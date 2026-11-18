/**
 * 기존 엑셀 이관 (F8). 소유자 전용, 1회용.
 *
 * 흐름: 화면(브라우저)이 엑셀을 읽고 **주민번호 열을 지운 행**을 보낸다 → 주민번호는 서버로 오지 않는다.
 *       서버는 받은 행을 검사(주민번호 모양이 있으면 거부)하고 parseLegacySheet 로 읽은 뒤
 *       buildLegacyPlan 으로 규칙을 적용한다. (규칙: PRD.md "기존 엑셀 이관 규칙")
 *
 * 안전장치: 실행 직전 운영 DB 백업 / 이미 이관했으면 거부 / 중간에 실패하면 쓴 행을 되돌림 /
 *           이관한 행의 ID를 Config(legacy_import_manifest)에 기록해 두었다가 undoLegacyImport 로 이관분만 되돌림
 */

function legacyPlanFromPayload_(payload) {
  if (!payload || !payload.rows || !payload.opts) throw apiError('INVALID', '이관 요청 형식이 맞지 않아요.');
  var o = payload.opts;
  if (PROGRAM_IDS.indexOf(o.program_id) < 0) throw apiError('INVALID', '프로그램이 올바르지 않아요.');
  var fee = validateValue(SESSION_RULES.fee, o.fee), cap = validateValue(SESSION_RULES.cap, o.cap);
  var year = validateValue({ type: 'int', min: 2000, max: 2100 }, o.year);
  if (!fee.ok) throw apiError('INVALID', '참가비: ' + fee.error);
  if (!cap.ok) throw apiError('INVALID', '정원: ' + cap.error);
  if (!year.ok) throw apiError('INVALID', '연도: ' + year.error);

  var clean = sanitizeLegacyRows(payload.rows);
  if (!clean.ok) throw apiError('INVALID', clean.error);

  return buildLegacyPlan(parseLegacySheet(clean.rows), {
    program_id: o.program_id, year: year.value, fee: fee.value, cap: cap.value,
    today: todayKst(), now: nowStr_(), makeId: makeId
  });
}

/** 저장 없이 결과만 미리 계산한다. 이름·연락처 같은 개인정보는 돌려주지 않는다. */
function previewLegacyImport(payload) {
  requireOwner_();
  var plan = legacyPlanFromPayload_(payload);
  return {
    ok: plan.ok, errors: plan.errors, warnings: plan.warnings, summary: plan.summary,
    counts: { sessions: plan.sessions.length, people: plan.people.length, enrollments: plan.enrollments.length },
    sessions: plan.sessions,
    already: readConfig_().legacy_imported === 'Y'
  };
}

/** 이관을 실행한다. 이미 이관했거나 오류가 있으면 거부한다. */
function commitLegacyImport(payload) {
  requireOwner_();
  var plan = legacyPlanFromPayload_(payload);
  if (!plan.ok) throw apiError('INVALID', plan.errors[0]);

  var result = withLock_(function () {
    if (readConfig_().legacy_imported === 'Y') throw apiError('INVALID', '이미 이관을 완료했어요. 되돌린 뒤 다시 할 수 있어요.');

    var db = openDb_();
    var exSessions = readTab_('Sessions'), exPeople = readTab_('People');
    plan.sessions.forEach(function (s) {
      if (exSessions.some(function (x) { return x.session_id === s.session_id; })) {
        throw apiError('DUPLICATE', s.session_id + ' 회차가 이미 있어요. 먼저 그 회차를 정리해 주세요.');
      }
    });

    // 이미 있는 사람(이름+전화번호)은 새로 만들지 않고 연결만 한다
    var idMap = {}, newPeople = [];
    plan.people.forEach(function (p) {
      var ex = exPeople.filter(function (x) { return String(x.name).trim() === p.name && digitsOnly(x.phone) === digitsOnly(p.phone); })[0];
      if (ex) idMap[p.person_id] = ex.person_id; else newPeople.push(p);
    });
    var newEnr = plan.enrollments.map(function (e) {
      var c = {}; Object.keys(e).forEach(function (k) { c[k] = e[k]; });
      if (idMap[c.person_id]) c.person_id = idMap[c.person_id];
      return c;
    });
    var manifest = {
      at: nowStr_(),
      sessions: plan.sessions.map(function (s) { return s.session_id; }),
      people: newPeople.map(function (p) { return p.person_id; }),
      enrollments: newEnr.map(function (e) { return e.enroll_id; })
    };

    var backup = backupDb_();   // 되돌릴 수 있도록 쓰기 직전 상태를 복사해 둔다
    try {
      appendObjects_(db, SCHEMA, 'Sessions', plan.sessions);
      appendObjects_(db, SCHEMA, 'People', newPeople);
      appendObjects_(db, SCHEMA, 'Enrollments', newEnr);
      setConfigUnlocked_('legacy_import_manifest', JSON.stringify(manifest));
      setConfigUnlocked_('legacy_imported', 'Y');
    } catch (err) {
      // 중간에 실패하면 지금까지 쓴 행을 지워 아무것도 남지 않게 한다
      deleteRowsByKeysUnlocked_('Enrollments', manifest.enrollments);
      deleteRowsByKeysUnlocked_('People', manifest.people);
      deleteRowsByKeysUnlocked_('Sessions', manifest.sessions);
      throw new Error('이관 중 오류가 나서 쓴 내용을 되돌렸어요: ' + (err && err.message ? err.message : err));
    }
    return { backup: backup, summary: plan.summary, warnings: plan.warnings,
             counts: { sessions: plan.sessions.length, people: newPeople.length, enrollments: newEnr.length, reusedPeople: plan.people.length - newPeople.length } };
  });

  audit_('legacy_import', 'ALL', '회차 ' + result.counts.sessions + ' · 사람 ' + result.counts.people + ' · 참여 ' + result.counts.enrollments);
  return result;
}

/**
 * 이관을 되돌린다. 이관으로 만든 회차·사람·참여 기록만 지운다.
 * 이관한 회차에 이관 뒤 새 참여 기록이 추가됐으면 데이터 손실을 막기 위해 거부한다.
 */
function undoLegacyImport() {
  requireOwner_();
  var removed = withLock_(function () {
    var cfg = readConfig_();
    if (cfg.legacy_imported !== 'Y' || !cfg.legacy_import_manifest) throw apiError('INVALID', '되돌릴 이관 기록이 없어요.');
    var m = JSON.parse(cfg.legacy_import_manifest);

    var enr = readTab_('Enrollments');
    var extra = enr.filter(function (e) { return m.sessions.indexOf(e.session_id) >= 0 && m.enrollments.indexOf(e.enroll_id) < 0; });
    if (extra.length) throw apiError('INVALID', '이관한 회차에 이관 뒤 추가된 참여 기록이 ' + extra.length + '건 있어 되돌릴 수 없어요.');

    var remaining = enr.filter(function (e) { return m.enrollments.indexOf(e.enroll_id) < 0; });
    var stillUsed = {}; remaining.forEach(function (e) { stillUsed[e.person_id] = true; });
    var peopleToDelete = m.people.filter(function (id) { return !stillUsed[id]; });

    var n = {
      enrollments: deleteRowsByKeysUnlocked_('Enrollments', m.enrollments),
      people: deleteRowsByKeysUnlocked_('People', peopleToDelete),
      sessions: deleteRowsByKeysUnlocked_('Sessions', m.sessions)
    };
    setConfigUnlocked_('legacy_imported', '');
    setConfigUnlocked_('legacy_import_manifest', '');
    return n;
  });
  audit_('legacy_undo', 'ALL', '회차 ' + removed.sessions + ' · 사람 ' + removed.people + ' · 참여 ' + removed.enrollments);
  return removed;
}
