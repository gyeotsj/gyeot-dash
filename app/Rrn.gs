/**
 * 주민번호 서버 기반 (2단계). 규칙의 정본은 DEV_PLAN_STAGE2.md 2장(R1~R10).
 *
 * 주민번호가 보관되는 곳은 "주민번호 파일"(별도 스프레드시트, 탭 RRN) 하나뿐이다. 열: enroll_id, rrn, session_end, saved_at
 * 이름·연락처는 두지 않는다. 운영 DB·감사 기록·발송 기록·오류 문구·실행 로그에는 번호 값이 없다.
 *
 * 이 파일의 규칙 (app/tests/run.js 가 코드를 읽어 검사한다)
 *  - 번호 값을 읽는 함수 rrnReadAll_ 은 rrnStatusMap_(상태만 계산)과 getInsuranceList(보험 명단) 에서만 부른다.
 *  - 번호를 쓰는 함수 rrnUpsertUnlocked_ 는 setRrn(입력·수정)과 commitApplications(등록) 에서만 부른다.
 *  - audit_, console, Logger, apiError, Error 에 번호 변수를 넣지 않는다. 사유는 코드와 한글 설명(RRN_CODE_LABELS)으로만 알린다.
 */

/** (파일 최상위에서 Schema.gs 값을 쓰면 읽는 순서 때문에 멈춘다. 함수로 둔다) */
function rrnCols_() { return RRN_SCHEMA.RRN.cols; }

function rrnSheet_() {
  var sh = openRrn_().getSheetByName('RRN');
  if (!sh) throw new Error('TAB_MISSING:RRN');
  return sh;
}

/** 번호 값까지 읽는다. 값이 서버 안에서만 쓰이는 두 함수(rrnStatusMap_, getInsuranceList)에서만 부른다. */
function rrnReadAll_() {
  var sh = rrnSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return rowsToObjects(rrnCols_(), sh.getRange(2, 1, last - 1, rrnCols_().length).getValues()).map(plainRow);
}

/** 번호 값 없이 읽는다 (보관 개수, 정리 대상 계산용) */
function rrnReadMeta_() {
  var sh = rrnSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  var idx = rrnCols_().indexOf('enroll_id'), idxEnd = rrnCols_().indexOf('session_end'), idxAt = rrnCols_().indexOf('saved_at');
  return sh.getRange(2, 1, last - 1, rrnCols_().length).getValues()
    .filter(function (r) { return String(r[idx]) !== ''; })
    .map(function (r) { return { enroll_id: String(r[idx]), session_end: String(r[idxEnd]), saved_at: String(r[idxAt]) }; });
}

/**
 * 번호를 기록한다. 같은 참여 기록의 번호가 이미 있으면 덮어쓴다. 잠금은 호출한 쪽에서.
 * rows: [{ enroll_id, rrn, session_end }]. 쓰기 전에 형식(R3)을 한 번 더 검사하고, 틀리면 아무것도 쓰지 않는다.
 */
function rrnUpsertUnlocked_(rows) {
  var clean = rows.map(function (r) {
    var v = validateRrn(r.rrn);
    if (!v.ok) throw apiError('INVALID', '주민번호 형식이 올바르지 않아요 (' + (RRN_CODE_LABELS[v.code] || '확인 필요') + ')');
    return { enroll_id: String(r.enroll_id), rrn: v.rrn, session_end: String(r.session_end || ''), saved_at: nowStr_() };
  });
  if (!clean.length) return 0;
  var sh = rrnSheet_(), last = sh.getLastRow();
  var rowOf = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { rowOf[String(r[0])] = i + 2; });
  }
  var appends = [];
  clean.forEach(function (c) {
    var row = objectToRow(rrnCols_(), c);
    if (rowOf[c.enroll_id]) sh.getRange(rowOf[c.enroll_id], 1, 1, rrnCols_().length).setValues([row]);
    else appends.push(row);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, rrnCols_().length).setValues(appends);
  return clean.length;
}

/** 해당 참여 기록들의 번호를 지운다 (아래쪽 행부터). 잠금은 호출한 쪽에서. 지운 행 수를 돌려준다. */
function rrnDeleteUnlocked_(ids) {
  if (!ids || !ids.length) return 0;
  var sh = rrnSheet_(), last = sh.getLastRow();
  if (last < 2) return 0;
  var want = {}; ids.forEach(function (id) { want[String(id)] = true; });
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < col.length; i++) if (want[String(col[i][0])]) rows.push(i + 2);
  for (var j = rows.length - 1; j >= 0; j--) sh.deleteRow(rows[j]);
  return rows.length;
}

/**
 * 다른 작업(보험 완료, 취소)이 끝난 뒤 번호를 지운다. 지우지 못해도 앞 작업은 이미 끝났으므로 예외를 던지지 않고
 * 화면에 알릴 안내 문구를 돌려준다 (조용히 넘어가지 않는다). 성공하면 빈 글자.
 */
function rrnClean_(ids) {
  try {
    withLock_(function () { return rrnDeleteUnlocked_(ids); });
    return '';
  } catch (e) {
    try { audit_('rrn_delete_failed', ids.length + '건', ''); } catch (e2) { /* 기록도 못 남기면 화면 안내만 */ }
    return '주민번호를 지우지 못했어요. 잠시 뒤 다시 시도하고, 계속되면 소유자에게 알려 주세요.';
  }
}

/**
 * 참여 기록별 번호 상태만 계산한다: { 참여기록ID: 'ok' 보관 중 | 'missing' 없음 | 'check' 확인 필요 }.
 * 아직 끝나지 않은 회차의 합격·취소 아닌 참여 기록 중 보험 가입 전인 것만 담고(가입을 마치면 번호가 지워져 더 필요 없다),
 * 번호 값은 돌려주지 않는다. 읽지 못하면 null.
 */
function rrnStatusMap_(enrollments, people, sessions) {
  try {
    var today = todayKst(), open = {}, pBy = {}, stored = {}, out = {};
    sessions.forEach(function (s) { if (String(s.end) >= today) open[s.session_id] = true; });
    people.forEach(function (p) { pBy[p.person_id] = p; });
    rrnReadAll_().forEach(function (r) { stored[r.enroll_id] = r.rrn; });
    enrollments.forEach(function (e) {
      if (open[e.session_id] && !enrCancelled_(e) && e.pass !== '불합격' && !e.ins_at) out[e.enroll_id] = rrnStatusFor(stored[e.enroll_id], pBy[e.person_id]);
    });
    return out;
  } catch (err) {
    return null;
  }
}

/**
 * 주민번호 입력·수정 (F16). 운영진 누구나. 합격이고 취소가 아니고 아직 끝나지 않은 회차의 참여 기록에만 입력한다.
 * 이미 있으면 덮어쓴다. 저장된 값은 어디에서도 보여 주지 않는다 (상태만 돌려준다).
 * 신청서의 성별·출생연도와 다르면 confirmMismatch 가 있어야 저장하고, 그때 상태는 'check'.
 * 오류 코드: INVALID (형식·대상 아님), RRN_CHECK (대조에 걸림, 확인이 필요), NOT_FOUND
 */
function setRrn(enrollId, rrn, confirmMismatch) {
  var who = requireStaff_();
  var today = todayKst();
  var e = readTab_('Enrollments').filter(function (x) { return x.enroll_id === enrollId; })[0];
  if (!e) throw apiError('NOT_FOUND', '참여 기록을 찾을 수 없어요.');
  if (enrCancelled_(e) || e.pass === '불합격') throw apiError('INVALID', '취소됐거나 합격이 아닌 참여 기록에는 주민번호를 입력할 수 없어요.');
  var s = sessionById_(e.session_id);
  if (String(s.end) < today) throw apiError('INVALID', '이미 끝난 회차에는 주민번호를 보관하지 않아요.');
  var p = readTab_('People').filter(function (x) { return x.person_id === e.person_id; })[0];
  if (!p) throw apiError('NOT_FOUND', '참여자를 찾을 수 없어요.');

  var m = rrnMatchesProfile(rrn, p.gender, p.birth_year);
  var mismatch = !m.ok && (m.codes[0] === 'BIRTH_MISMATCH' || m.codes[0] === 'GENDER_MISMATCH');
  if (!m.ok && !mismatch) throw apiError('INVALID', '주민번호: ' + (RRN_CODE_LABELS[m.code] || '형식이 맞지 않아요'));
  if (mismatch && !confirmMismatch) {
    throw apiError('RRN_CHECK', m.codes.map(function (c) { return RRN_CODE_LABELS[c]; }).join(', ') + '. 그래도 저장하려면 확인해 주세요.');
  }
  var v = validateRrn(rrn);
  withLock_(function () { rrnUpsertUnlocked_([{ enroll_id: e.enroll_id, rrn: v.rrn, session_end: s.end }]); });
  audit_('rrn_set', e.enroll_id, mismatch ? '성별·출생연도 대조에 걸렸지만 확인 후 저장' : '');
  return { status: mismatch ? 'check' : 'ok' };
}

/**
 * 개인정보 점검 (R6, 소유자 전용). 운영 DB의 모든 탭에서 주민번호 모양의 값이 있는 탭·열·개수만 알려 준다.
 * 값은 알려 주지 않는다. 0개여야 정상이다. (주민번호 파일은 일부러 보지 않는다)
 */
function scanForRrn() {
  requireOwner_();
  var ss = openDb_(), findings = [], total = 0;
  Object.keys(SCHEMA).forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;
    var cols = SCHEMA[tab].cols;
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
    var counts = {};
    values.forEach(function (row) {
      row.forEach(function (v, c) {
        if (v !== '' && v != null && looksLikeRrn(v)) counts[cols[c]] = (counts[cols[c]] || 0) + 1;
      });
    });
    Object.keys(counts).forEach(function (col) { findings.push({ tab: tab, column: col, count: counts[col] }); total += counts[col]; });
  });
  var at = nowStr_();
  withLock_(function () { setConfigUnlocked_('privacy_scan_last', at + '|' + total); });   // 시스템 상태 카드에 마지막 점검 결과로 보인다
  audit_('privacy_scan', '', '주민번호 모양 ' + total + '개');
  return { total: total, findings: findings, scannedAt: at };
}
