/**
 * 신청 엑셀 업로드 (F5). 운영진 누구나.
 *
 * 흐름: 화면(브라우저)이 엑셀을 읽고 **주민번호 열을 떼어낸 본문(rows)** 과 **주민번호(rrns, 별도 칸)** 를 따로 보낸다.
 *  - previewApplications: 규칙으로 판정만 한다 (저장하지 않음, 주민번호는 받지 않는다)
 *  - commitApplications : 본문을 다시 판정해 사람·참여 기록·빈 칸 채우기를 쓰고, 대상에만 주민번호를 주민번호 파일에 쓴다.
 *                         하나라도 실패하면 쓴 것을 모두 되돌린다
 *  - undoUpload         : 업로드 하나를 되돌린다 (운영진 누구나, 과거 어느 업로드든)
 *
 * 주민번호 값은 rrns 에서 planRrnWrites → rrnUpsertUnlocked_ 로만 흐른다. 응답·감사 기록·오류에는 담기지 않는다.
 * Uploads 탭의 manifest 에는 ID 와 해시만 있다 (이름·연락처·직업 같은 값 없음).
 */

function applicationInputs_(payload) {
  var chk = sanitizeApplicationPayload(payload);
  if (!chk.ok) throw apiError('INVALID', chk.error);
  return chk.value;
}

function applicationExisting_() {
  return { sessions: readTab_('Sessions'), people: readTab_('People'), enrollments: readTab_('Enrollments') };
}

function applicationPlan_(v, existing, actor) {
  var parsed = parseApplicationSheet(v.rows);
  var plan = buildApplicationPlan(parsed, existing, {
    program_id: v.programId, today: todayKst(), now: nowStr_(), actor: actor || '', makeId: makeId,
    sessionMap: v.sessionMap, applyAttend: v.applyAttend
  });
  return { parsed: parsed, plan: plan };
}

/**
 * 저장 없이 판정만 한다. 주민번호는 받지 않는다 (rrns 가 와도 무시).
 * 행마다: 행 번호, 이름(업로드한 사람이 확인하는 용도), 판정, 회차, 사유 등. 경고·요약에는 이름·연락처가 없다.
 */
function previewApplications(payload) {
  requireStaff_();
  var v = applicationInputs_(payload);
  var r = applicationPlan_(v, applicationExisting_(), '');
  var nameBy = {}, roundBy = {};
  r.parsed.rows.forEach(function (x) { nameBy[x.rowNo] = x.name; roundBy[x.rowNo] = x.roundText; });
  var fillsByField = {};
  collapseFills(r.plan.fills).forEach(function (f) { fillsByField[f.field] = (fillsByField[f.field] || 0) + 1; });
  return {
    ok: r.plan.ok, errors: r.plan.errors, warnings: r.plan.warnings, summary: r.plan.summary, fillsByField: fillsByField,
    sessionNotes: r.plan.sessionNotes.length,
    rows: r.plan.rows.map(function (x) {
      return {
        rowNo: x.rowNo, name: nameBy[x.rowNo] || '', decision: x.decision, session_id: x.session_id, method: x.method,
        reason: x.reason || '', rrnEligible: x.rrnEligible, gender: x.gender, birth_year: x.birth_year,
        roundText: x.decision === 'needs_session' ? String(roundBy[x.rowNo] || '').slice(0, 80) : ''
      };
    })
  };
}

/**
 * 등록한다. 본문을 서버가 다시 판정해(미리보기 이후 데이터가 바뀌었을 수 있으므로) 쓰고 Uploads 에 되돌리기 기록을 남긴다.
 * 주민번호는 합격 · 취소 아님 · 새 참여 기록 · 종료 전 회차에만 저장한다. 번호에 문제가 있어도 참여 기록은 등록하고
 * 그 행은 "번호 없음"이 되므로 나중에 setRrn 으로 입력한다. 반환의 rrn.status 에는 값이 없다.
 */
function commitApplications(payload) {
  var who = requireStaff_();
  var v = applicationInputs_(payload);

  var result = withLock_(function () {
    var existing = applicationExisting_();
    var r = applicationPlan_(v, existing, who.email), plan = r.plan;
    if (!plan.ok) throw apiError('INVALID', plan.errors[0]);
    var fills = collapseFills(plan.fills);
    if (!plan.newEnrollments.length && !fills.length && !plan.sessionNotes.length) {
      throw apiError('INVALID', '새로 등록하거나 채울 내용이 없어요.');
    }
    var rrnPlan = planRrnWrites(plan, v.rrns, existing.sessions);
    var manifest = buildUploadManifest(plan, fills, rrnPlan.writes.map(function (w) { return w.enroll_id; }));
    var mjson = JSON.stringify(manifest);
    if (mjson.length > 45000) throw apiError('INVALID', '한 번에 처리할 변경이 너무 많아요. 파일을 나눠 올려 주세요.');

    var s = plan.summary;
    var touched = {};
    plan.rows.forEach(function (x) { if (x.session_id && x.decision !== 'error' && x.decision !== 'needs_session') touched[x.session_id] = true; });
    var uploadRow = {
      upload_id: makeId('u_'), at: nowStr_(), by: who.email, program_id: v.programId, sessions: Object.keys(touched).join(','),
      n_new: s.new + s.cancelled_new, n_fill: s.existing, n_skip: s.rejected + s.needs_session + s.duplicate_in_file + s.error,
      manifest: mjson, undone_at: ''
    };

    var db = openDb_();
    try {
      appendObjects_(db, SCHEMA, 'People', plan.newPeople);
      appendObjects_(db, SCHEMA, 'Enrollments', plan.newEnrollments);
      var patchP = {}, patchE = {};
      fills.forEach(function (f) {
        var bag = f.table === 'People' ? patchP : patchE;
        (bag[f.id] = bag[f.id] || {})[f.field] = f.to;
      });
      bulkPatchByIdUnlocked_('People', patchP, who.email);
      bulkPatchByIdUnlocked_('Enrollments', patchE, who.email);
      var patchS = {};
      plan.sessionNotes.forEach(function (n) { patchS[n.session_id] = { note: n.to }; });
      bulkPatchByIdUnlocked_('Sessions', patchS, who.email);
      rrnUpsertUnlocked_(rrnPlan.writes);
      appendObjects_(db, SCHEMA, 'Uploads', [uploadRow]);
    } catch (err) {
      // 중간에 실패하면 쓴 것을 모두 되돌린다 (이 업로드가 쓴 값이 그대로인 칸만 원래대로)
      var back = applyUndoUnlocked_(manifest);
      var msg = err && err.message ? err.message : String(err);
      throw new Error('등록 중 오류가 나서 쓴 내용을 되돌렸어요' + (back.errors.length ? ' (일부는 되돌리지 못했어요. 소유자에게 알려 주세요)' : '') + ': ' + msg.replace(/\d{6}\s*-?\s*[1-8]\d{6}/g, '…'));
    }
    return {
      upload_id: uploadRow.upload_id, summary: s, warnings: plan.warnings,
      counts: { newPeople: plan.newPeople.length, newEnrollments: plan.newEnrollments.length, filledCells: fills.length, sessionNotes: plan.sessionNotes.length },
      rrn: { counts: rrnPlan.counts, status: rrnPlan.status },
      sessions: uploadRow.sessions
    };
  });

  audit_('application_upload', result.upload_id,
    '회차 ' + (result.sessions || '-') + ' · 신규 ' + (result.summary.new + result.summary.cancelled_new) + ' · 보충 ' + result.summary.existing +
    ' · 제외 ' + (result.summary.rejected + result.summary.needs_session + result.summary.duplicate_in_file + result.summary.error));
  return result;
}

/** 되돌리기 기록 목록 (최근 30건). manifest 는 보내지 않는다. */
function listUploads() {
  requireStaff_();
  var rows;
  try { rows = readTab_('Uploads'); }
  catch (e) {
    if (/TAB_MISSING/.test(String(e && e.message))) return { items: [], missingTab: true };
    throw e;
  }
  rows.sort(function (a, b) { return String(b.at) < String(a.at) ? -1 : (String(b.at) > String(a.at) ? 1 : 0); });
  return {
    missingTab: false,
    items: rows.slice(0, 30).map(function (u) {
      return { upload_id: u.upload_id, at: u.at, by: u.by, program_id: u.program_id, sessions: u.sessions, n_new: u.n_new, n_fill: u.n_fill, n_skip: u.n_skip, undone_at: u.undone_at };
    })
  };
}

function uploadById_(uploadId) {
  var u = readTab_('Uploads').filter(function (x) { return x.upload_id === uploadId; })[0];
  if (!u) throw apiError('NOT_FOUND', '업로드 기록을 찾을 수 없어요.');
  if (u.undone_at) throw apiError('INVALID', '이미 되돌린 업로드예요.');
  var m;
  try { m = JSON.parse(u.manifest); } catch (e) { throw apiError('INVALID', '되돌리기 기록을 읽을 수 없어요.'); }
  return { row: u, manifest: m };
}

function currentForUndo_() {
  return { people: readTab_('People'), enrollments: readTab_('Enrollments'), sessions: readTab_('Sessions') };
}

/** 되돌리기 확인창에 보여줄 영향. 저장하지 않는다. */
function previewUndoUpload(uploadId) {
  requireStaff_();
  var u = uploadById_(uploadId);
  var p = planUndo(u.manifest, currentForUndo_());
  var rrnCount = null;
  try {
    var have = {}; rrnReadMeta_().forEach(function (x) { have[x.enroll_id] = true; });
    rrnCount = p.rrnIds.filter(function (id) { return have[id]; }).length;
  } catch (e) { rrnCount = null; }
  var c = p.counts;
  return { upload_id: uploadId, at: u.row.at, program_id: u.row.program_id, sessions: u.row.sessions,
    counts: { enrollments: c.enrollments, people: c.people, keptPeople: c.keptPeople, cells: c.cells, skippedCells: c.skippedCells, notes: c.notes, rrn: rrnCount } };
}

/**
 * 되돌리기 계획을 실제로 적용한다. 잠금은 호출한 쪽에서. 단계마다 따로 실패를 잡아 가능한 만큼 진행하고,
 * 실패한 단계 이름을 errors 로 돌려준다 (다시 실행해도 안전하다: 이미 없는 것은 건너뛴다).
 */
function applyUndoUnlocked_(manifest) {
  var p = planUndo(manifest, currentForUndo_());
  var errors = [], details = [];
  // 실패한 단계의 이름과 오류 문구(숫자 6자리 이상은 가린다)를 모아 둔다. 주민번호 값은 이 단계들에서 다루지 않는다.
  var step = function (name, fn) { try { fn(); } catch (e) { errors.push(name); details.push(name + ': ' + String(e && e.message ? e.message : e).replace(/\d{6,}/g, '…').slice(0, 140)); } };
  step('주민번호', function () { rrnDeleteUnlocked_(p.rrnIds); });
  step('참여 기록', function () { deleteRowsByKeysUnlocked_('Enrollments', p.delEnroll); });
  step('사람', function () { deleteRowsByKeysUnlocked_('People', p.delPeople); });
  step('채운 칸', function () {
    var patchP = {}, patchE = {};
    p.restores.forEach(function (f) {
      var bag = f.table === 'People' ? patchP : patchE;
      (bag[f.id] = bag[f.id] || {})[f.field] = f.from;
    });
    bulkPatchByIdUnlocked_('People', patchP, currentEmail_());
    bulkPatchByIdUnlocked_('Enrollments', patchE, currentEmail_());
  });
  step('회차 메모', function () {
    var patchS = {};
    p.noteRestores.forEach(function (n) { patchS[n.session_id] = { note: n.from }; });
    bulkPatchByIdUnlocked_('Sessions', patchS, currentEmail_());
  });
  return { plan: p, errors: errors, details: details };
}

/**
 * 업로드를 되돌린다. 운영진 누구나, 과거 어느 업로드든.
 * 그 업로드가 만든 참여 기록·사람·주민번호를 지우고, 채운 칸은 아직 그 값이면 원래대로 되돌린다.
 */
function undoUpload(uploadId) {
  var who = requireStaff_();
  var out = withLock_(function () {
    var u = uploadById_(uploadId);
    var res = applyUndoUnlocked_(u.manifest);
    if (res.errors.length) {
      // 남은 것은 같은 버튼을 다시 누르면 마저 정리한다 (이미 지운 것은 건너뛴다). 원인은 감사 기록에도 남긴다.
      try { audit_('application_undo_failed', uploadId, res.details.join(' | ').slice(0, 400)); } catch (e2) { /* 기록도 못 남기면 화면 안내만 */ }
      throw new Error('일부만 되돌려졌어요 (' + res.details.join(' / ') + '). 같은 되돌리기 버튼을 한 번 더 누르면 남은 것을 마저 정리해요.');
    }
    updateRowUnlocked_('Uploads', uploadId, function () { return { undone_at: nowStr_() }; }, null, who.email);
    return res.plan.counts;
  });
  audit_('application_undo', uploadId, '참여 ' + out.enrollments + ' · 사람 ' + out.people + ' · 칸 ' + out.cells);
  return out;
}
