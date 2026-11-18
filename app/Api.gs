/**
 * 화면(google.script.run)이 부르는 서버 함수.
 *
 * 규칙
 *  - 모든 함수는 맨 앞에서 requireStaff_() 또는 requireOwner_()로 접속자를 확인한다.
 *  - 화면에서 온 값은 믿지 않는다. 열 허용 목록(Schema.gs)으로 다시 검사하고,
 *    updated_by 와 시각은 서버가 채운다.
 *  - 오류는 "[코드] 문구" 형태로 던진다. 코드: LOGIN_REQUIRED, NOT_STAFF, OWNER_ONLY, NOT_FOUND,
 *    CONFLICT, INVALID, CANCELLED, DUPLICATE
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
    sessions: readTab_('Sessions'),
    people: readTab_('People'),
    enrollments: readTab_('Enrollments'),
    staff: who.owner ? readTab_('Staff') : null
  };
}

/* ---------- 참여 기록 쓰기 ---------- */

function sessionById_(sessionId) {
  var found = readTab_('Sessions').filter(function (s) { return s.session_id === sessionId; })[0];
  if (!found) throw apiError('NOT_FOUND', '회차를 찾을 수 없어요.');
  return found;
}

/** 참석 여부는 프로그램이 시작된 뒤에만 입력할 수 있다 */
function assertStarted_(sessionId, today) {
  var s = sessionById_(sessionId);
  if (today < s.start) throw apiError('INVALID', '프로그램이 시작된 뒤에 참석 여부를 입력할 수 있어요.');
}

/**
 * 단계 체크. step: m1 | pay | ins | m2 | attend
 * 날짜 단계는 value=true면 오늘 날짜(이미 있으면 그대로), false면 비움. 참석은 '참석' | '불참' | ''
 */
function setStep(enrollId, step, value, expectedUpdatedAt) {
  var who = requireStaff_();
  var def = STEP_DEFS[step];
  if (!def) throw apiError('INVALID', '알 수 없는 단계예요.');
  var today = todayKst();

  var res = updateRowByKey_('Enrollments', enrollId, function (cur) {
    if (cur.cancel_reason) throw apiError('CANCELLED', '취소된 참여자는 단계를 바꿀 수 없어요.');
    if (step === 'attend') assertStarted_(cur.session_id, today);
    var on = (value === true || value === 'true');
    if (def.kind === 'date' && on && cur[def.col]) return {};   // 이미 완료: 날짜를 유지
    try {
      return stepPatch(step, value, today);
    } catch (e) {
      throw apiError('INVALID', e.message);
    }
  }, expectedUpdatedAt, who.email);

  if (res.changed.length) audit_('step', enrollId, step + ' → ' + (res.row[def.col] ? (def.kind === 'attend' ? res.row[def.col] : '완료') : '해제'));
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

  var changedRows = withLock_(function () {
    if (step === 'attend') assertStarted_(sessionId, today);
    return bulkUpdateUnlocked_('Enrollments', function (r) {
      return r.session_id === sessionId && !r.cancel_reason && (!ids || ids.indexOf(String(r.enroll_id)) >= 0);
    }, function (r) {
      if (def.kind === 'date' && on && r[def.col]) return {};
      try { return stepPatch(step, value, today); } catch (e) { throw apiError('INVALID', e.message); }
    }, who.email);
  });

  if (changedRows.length) audit_('bulk_step', sessionId, step + ' · ' + changedRows.length + '명');
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
