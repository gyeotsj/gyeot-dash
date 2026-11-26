/**
 * 화면(google.script.run)이 부르는 서버 함수.
 *
 * 규칙
 *  - 모든 함수는 맨 앞에서 requireStaff_() 또는 requireOwner_()로 접속자를 확인한다.
 *  - 화면에서 온 값은 믿지 않는다. 열 허용 목록(Schema.gs)으로 다시 검사하고,
 *    updated_by 와 시각은 서버가 채운다.
 *  - 오류는 "[코드] 문구" 형태로 던진다. 코드: LOGIN_REQUIRED, NOT_STAFF, OWNER_ONLY, NOT_FOUND,
 *    CONFLICT, INVALID, CANCELLED, DUPLICATE, RRN_CHECK(주민번호가 성별·출생연도와 맞지 않아 확인이 필요)
 *  - 주민번호는 이 파일에서 다루지 않는다 (Rrn.gs). 이 파일의 함수가 주민번호를 지울 때는 rrnClean_ 만 부르고,
 *    실패하면 돌려주는 행에 _warn(안내 문구)을 붙인다.
 *  - 감사 기록에는 누가·무엇을·대상 ID만 남기고 값(이름, 연락처 등)은 남기지 않는다.
 */

/* ---------- 접속자 확인 ---------- */

function requireStaff_() {
  var email = currentEmail_();
  if (!email) throw apiError('LOGIN_REQUIRED', '구글 로그인이 필요해요.');
  var row = findActiveStaff(readTab_('Staff'), email);
  if (!row) throw apiError('NOT_STAFF', '등록된 운영진이 아니에요.');
  return { email: email, row: row, owner: row.role === 'owner' };
}

function requireOwner_() {
  var who = requireStaff_();
  if (!who.owner) throw apiError('OWNER_ONLY', '소유자만 할 수 있어요.');
  return who;
}

/* ---------- 읽기 ---------- */

/** 화면에 필요한 모든 표를 한 번에 돌려준다. 주민번호 관련 값은 존재하지 않는다. */
function getBootstrap() {
  var who = requireStaff_();
  var cfg = readConfig_();
  var sessions = readTab_('Sessions'), people = readTab_('People'), enrollments = readTab_('Enrollments');
  return {
    me: { email: who.email, name: who.row.name, role: who.row.role },
    now: nowStr_(),
    today: todayKst(),
    config: {
      refund_days: Number(cfg.refund_days || 3),
      retention_years: Number(cfg.retention_years || 3),
      legacy_imported: cfg.legacy_imported === 'Y'
    },
    programs: readTab_('Programs'),
    sessions: sessions,
    people: people,
    enrollments: enrollments,
    // 주민번호는 값이 아니라 상태만 보낸다: 참여기록ID → ok(보관 중) / missing(없음) / check(확인 필요). 읽지 못하면 null
    rrnStatus: rrnStatusMap_(enrollments, people, sessions),
    // 저장한 문구(자리표시자 상태)와 최근 발송 기록 50건. 받는 사람의 이름·연락처·주민번호는 없다.
    templates: readTab_('Templates'),
    messageLog: readTab_('MessageLog').sort(function (a, b) { return String(b.at) < String(a.at) ? -1 : (String(b.at) > String(a.at) ? 1 : 0); }).slice(0, 50),
    staff: who.owner ? readTab_('Staff') : null
  };
}

/* ---------- 참여 기록 쓰기 ---------- */

function sessionById_(sessionId) {
  var found = readTab_('Sessions').filter(function (s) { return s.session_id === sessionId; })[0];
  if (!found) throw apiError('NOT_FOUND', '회차를 찾을 수 없어요.');
  return found;
}

/** 참석 여부·만족도 응답은 프로그램이 시작된 뒤에만 입력할 수 있다 */
function assertStarted_(sessionId, today, label) {
  var s = sessionById_(sessionId);
  if (today < s.start) throw apiError('INVALID', '프로그램이 시작된 뒤에 ' + (label || '참석 여부') + '를 입력할 수 있어요.');
}

/** 만족도 열(sat_at)이 시트 머리글에 있는지. 2단계에서 추가된 열이라 기존 시트는 소유자가 "스키마 확장"을 눌러야 생긴다. */
function assertSatColumn_() {
  var sh = openDb_().getSheetByName('Enrollments');
  var idx = SCHEMA.Enrollments.cols.indexOf('sat_at') + 1;
  if (String(sh.getRange(1, idx).getValue()) !== 'sat_at') {
    throw apiError('INVALID', '만족도 열이 아직 없어요. 소유자가 시스템 상태에서 "스키마 확장"을 눌러 주세요.');
  }
}

/** 이 단계를 지금 입력할 수 있는지 확인한다 (시작 전 회차의 참석·만족도, 만족도 열 준비 여부) */
function assertStepAllowed_(step, sessionId, today) {
  if (step === 'sat') assertSatColumn_();
  if (step === 'attend') assertStarted_(sessionId, today);
  if (step === 'sat') assertStarted_(sessionId, today, '만족도 응답');
}

/**
 * 단계 체크. step: m1 | pay | ins | m2 | attend | sat(만족도 응답)
 * 날짜 단계는 value=true면 오늘 날짜(이미 있으면 그대로), false면 비움. 참석은 '참석' | '불참' | ''
 */
function setStep(enrollId, step, value, expectedUpdatedAt) {
  var who = requireStaff_();
  var def = STEP_DEFS[step];
  if (!def) throw apiError('INVALID', '알 수 없는 단계예요.');
  var today = todayKst();

  var res = updateRowByKey_('Enrollments', enrollId, function (cur) {
    if (cur.cancel_reason) throw apiError('CANCELLED', '취소된 참여자는 단계를 바꿀 수 없어요.');
    assertStepAllowed_(step, cur.session_id, today);
    var on = (value === true || value === 'true');
    if (def.kind === 'date' && on && cur[def.col]) return {};   // 이미 완료: 날짜를 유지
    try {
      return stepPatch(step, value, today);
    } catch (e) {
      throw apiError('INVALID', e.message);
    }
  }, expectedUpdatedAt, who.email);

  if (res.changed.length) audit_('step', enrollId, step + ' → ' + (res.row[def.col] ? (def.kind === 'attend' ? res.row[def.col] : '완료') : '해제'));
  // 보험 가입이 끝나면 주민번호는 더 필요 없다: 바로 지운다 (R5). 지우지 못하면 화면에 알린다.
  if (step === 'ins' && (value === true || value === 'true')) {
    var warn = rrnClean_([enrollId]);
    if (warn) res.row._warn = warn;
  }
  return res.row;
}

/** 이동수단, 남긴 말, 취소 상태·사유, 입금액, 환불액 수정 */
function updateEnrollment(enrollId, patch, expectedUpdatedAt) {
  var who = requireStaff_();
  var v = validatePatch(ENROLLMENT_EDITABLE, patch);
  if (!v.ok) throw apiError('INVALID', firstError(v.errors));
  var today = todayKst();

  var res = updateRowByKey_('Enrollments', enrollId, function (cur) {
    return normalizeCancel(v.clean, cur, today);
  }, expectedUpdatedAt, who.email);

  if (res.changed.length) audit_('update_enrollment', enrollId, '항목: ' + res.changed.join(', '));
  // 신청이 취소되면 주민번호를 바로 지운다 (R5)
  if (res.row.cancel_reason && res.changed.indexOf('cancel_reason') >= 0) {
    var warn = rrnClean_([enrollId]);
    if (warn) res.row._warn = warn;
  }
  return res.row;
}

/** 이름, 연락처, 이메일, 직업, 거주지, 동의 항목 수정 (그 사람의 모든 회차에 적용됨) */
function updatePerson(personId, patch, expectedUpdatedAt) {
  var who = requireStaff_();
  var v = validatePatch(PERSON_EDITABLE, patch);
  if (!v.ok) throw apiError('INVALID', firstError(v.errors));

  var res = updateRowByKey_('People', personId, function (cur) {
    var name = v.clean.name !== undefined ? v.clean.name : cur.name;
    var phone = v.clean.phone !== undefined ? v.clean.phone : cur.phone;
    if (isDuplicatePerson(readTab_('People'), personId, name, phone)) {
      throw apiError('DUPLICATE', '같은 이름과 전화번호의 다른 참여자가 이미 있어요.');
    }
    return v.clean;
  }, expectedUpdatedAt, who.email);

  if (res.changed.length) audit_('update_person', personId, '항목: ' + res.changed.join(', '));
  return res.row;
}

/**
 * 회차 전체(또는 선택한 사람)에게 단계를 한 번에 처리한다. 취소된 참여자는 제외한다.
 * enrollIds 가 비어 있으면 회차의 취소 아닌 참여자 전원.
 */
function bulkSetStep(sessionId, step, value, enrollIds) {
  var who = requireStaff_();
  var def = STEP_DEFS[step];
  if (!def) throw apiError('INVALID', '알 수 없는 단계예요.');
  var ids = Array.isArray(enrollIds) && enrollIds.length ? enrollIds.map(String) : null;
  if (ids && ids.length > 200) throw apiError('INVALID', '한 번에 200명까지만 처리할 수 있어요.');
  var today = todayKst();
  var on = (value === true || value === 'true');

  var matched = [];   // 이 처리의 대상이 된 참여 기록 (보험을 켤 때 주민번호를 지울 대상)
  var changedRows = withLock_(function () {
    assertStepAllowed_(step, sessionId, today);
    return bulkUpdateUnlocked_('Enrollments', function (r) {
      var hit = r.session_id === sessionId && !r.cancel_reason && (!ids || ids.indexOf(String(r.enroll_id)) >= 0);
      if (hit) matched.push(r.enroll_id);
      return hit;
    }, function (r) {
      if (def.kind === 'date' && on && r[def.col]) return {};
      try { return stepPatch(step, value, today); } catch (e) { throw apiError('INVALID', e.message); }
    }, who.email);
  });

  if (changedRows.length) audit_('bulk_step', sessionId, step + ' · ' + changedRows.length + '명');
  if (step === 'ins' && on && matched.length) {
    var warn = rrnClean_(matched);
    if (warn && changedRows.length) changedRows[0]._warn = warn;
  }
  return changedRows;
}

/* ---------- 회차 관리 (F15) ---------- */

/**
 * 회차 추가·수정. input.session_id 가 있으면 수정(날짜, 참가비, 정원, 메모만), 없으면 추가(프로그램+번호로 session_id 생성)
 */
function saveSession(input) {
  var who = requireStaff_();
  input = input || {};

  var result = withLock_(function () {
    var sessions = readTab_('Sessions');
    var existing = null;
    if (input.session_id) {
      existing = sessions.filter(function (s) { return s.session_id === input.session_id; })[0];
      if (!existing) throw apiError('NOT_FOUND', '회차를 찾을 수 없어요.');
    }
    var v = validateSession(input, existing);
    if (!v.ok) throw apiError('INVALID', firstError(v.errors));

    if (existing) {
      var res = updateRowUnlocked_('Sessions', existing.session_id, function () { return v.clean; }, null, who.email);
      return { row: res.row, created: false, changed: res.changed };
    }
    if (sessions.some(function (s) { return s.session_id === v.clean.session_id; })) {
      throw apiError('DUPLICATE', '이미 같은 프로그램·회차 번호가 있어요.');
    }
    appendObjects_(openDb_(), SCHEMA, 'Sessions', [v.clean]);
    return { row: v.clean, created: true, changed: [] };
  });

  audit_(result.created ? 'create_session' : 'update_session', result.row.session_id,
    result.created ? '' : '항목: ' + result.changed.join(', '));
  return result.row;
}

/** 참여 기록이 하나도 없는 회차만 삭제할 수 있다 */
function deleteSession(sessionId) {
  requireStaff_();
  withLock_(function () {
    var sh = openDb_().getSheetByName('Sessions');
    var rowNo = findKeyRow_(sh, SCHEMA.Sessions, sessionId);
    if (rowNo < 0) throw apiError('NOT_FOUND', '회차를 찾을 수 없어요.');
    var used = readTab_('Enrollments').some(function (e) { return e.session_id === sessionId; });
    if (used) throw apiError('INVALID', '참여 기록이 있는 회차는 삭제할 수 없어요.');
    sh.deleteRow(rowNo);
  });
  audit_('delete_session', sessionId, '');
  return true;
}

/* ---------- 소유자 전용 ---------- */

/** 운영 DB를 백업 폴더에 복사한다 (주민번호 파일은 복사하지 않음) */
function backupNow() {
  requireOwner_();
  var b = backupDb_();
  audit_('backup', b.name, '');
  return b;
}
