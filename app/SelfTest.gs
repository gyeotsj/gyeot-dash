/**
 * 서버 쓰기 기능의 자체 시험. 소유자가 Apps Script 편집기에서 runSelfTest 를 실행한다.
 *
 * 안전: 운영 DB를 통째로 복사한 임시 파일에서만 시험하고, 끝나면 그 복사본을 휴지통으로 보낸다.
 *       운영 DB와 AuditLog는 건드리지 않는다. 시험 데이터는 모두 가짜(시험가, 시험나)다.
 * 결과: 실행 로그에 "통과/실패" 줄이 나온다. 모두 통과해야 한다.
 */
function runSelfTest() {
  requireOwner_();
  var copy = DriveApp.getFileById(propOrThrow_('DB_ID')).makeCopy('곁마을 자체시험용 복사본 (자동 삭제)');
  var lines = [], failed = 0;
  var realRrnBefore = -1, tmpRrnId = '';   // 실제 주민번호 파일의 시험 전 행 수 / 시험용 임시 주민번호 파일
  var check = function (name, cond, extra) {
    lines.push((cond ? '통과: ' : '실패: ') + name + (cond || !extra ? '' : '  → ' + extra));
    if (!cond) failed++;
  };
  var expectError = function (name, code, fn) {
    try { fn(); check(name, false, '오류가 나야 하는데 통과함'); }
    catch (e) { check(name, String(e.message).indexOf('[' + code + ']') === 0, e.message); }
  };

  try {
    // 주민번호는 실제 파일이 아니라 임시 파일에서만 시험한다 (R7). 시험 전 실제 파일의 행 수를 기억해 두었다가 끝나고 비교한다.
    realRrnBefore = SpreadsheetApp.openById(propOrThrow_('RRN_ID')).getSheetByName('RRN').getLastRow();
    var tmpRrn = SpreadsheetApp.create('곁마을 자체시험용 주민번호 (자동 삭제)');
    tmpRrnId = tmpRrn.getId();
    ensureTabs_(tmpRrn, RRN_SCHEMA, { lines: [], warnings: [] });
    RRN_CACHE_ = tmpRrn;
    DB_CACHE_ = SpreadsheetApp.openById(copy.getId());   // 이후 모든 읽기·쓰기는 복사본으로 간다
    var db = openDb_();
    var today = todayKst();
    var old = '2026-01-01 00:00:00';
    // 복사본에는 이관한 실제 데이터가 이미 들어 있을 수 있어서, 시험 데이터를 넣기 전의 개수를 기준으로 증가분을 센다
    var pre = { s: readTab_('Sessions').length, p: readTab_('People').length, e: readTab_('Enrollments').length };

    appendObjects_(db, SCHEMA, 'Sessions', [
      { session_id: 'w91', program_id: 'w', n: 91, start: '2026-01-05', end: '2026-01-07', fee: 50000, cap: 7, note: '시험(지난 회차)' },
      { session_id: 'w92', program_id: 'w', n: 92, start: '2099-01-05', end: '2099-01-07', fee: 50000, cap: 7, note: '시험(미래 회차)' }
    ]);
    appendObjects_(db, SCHEMA, 'People', [
      { person_id: 'p_a', name: '시험가', phone: '010-0000-0001', email: 'a@example.com', gender: '여', birth_year: 1995, job: '', area: '', consent_retain: '', consent_portrait: '', created_at: old, updated_at: old },
      { person_id: 'p_b', name: '시험나', phone: '010-0000-0002', email: 'b@example.com', gender: '남', birth_year: 1996, job: '', area: '', consent_retain: '', consent_portrait: '', created_at: old, updated_at: old }
    ]);
    appendObjects_(db, SCHEMA, 'Enrollments', [
      { enroll_id: 'e_a', session_id: 'w91', person_id: 'p_a', pass: '합격', transport: '고속터미널', updated_at: old, updated_by: 'seed' },
      { enroll_id: 'e_b', session_id: 'w91', person_id: 'p_b', pass: '합격', transport: '', updated_at: old, updated_by: 'seed' },
      { enroll_id: 'e_c', session_id: 'w92', person_id: 'p_a', pass: '합격', transport: '', updated_at: old, updated_by: 'seed' }
    ]);
    var enr = function (id) { return readTab_('Enrollments').filter(function (r) { return r.enroll_id === id; })[0]; };

    // 읽기
    var boot = getBootstrap();
    check('getBootstrap: 시험 데이터(회차 2, 사람 2, 참여 기록 3)가 기존 데이터에 더해져 보인다',
      boot.sessions.length === pre.s + 2 && boot.people.length === pre.p + 2 && boot.enrollments.length === pre.e + 3,
      boot.sessions.length + '/' + boot.people.length + '/' + boot.enrollments.length + ' (기준 ' + pre.s + '/' + pre.p + '/' + pre.e + ')');
    check('getBootstrap: 소유자는 운영진 목록을 받는다', Array.isArray(boot.staff) && boot.me.role === 'owner');
    // 2단계부터 rrnStatus(상태만)가 들어간다. 그것과 사용자가 쓴 문구(templates·messageLog)를 뺀 나머지 표 데이터에는 주민번호 관련 열이 없어야 한다.
    var bootRest = {}; Object.keys(boot).forEach(function (k) { if (k !== 'rrnStatus' && k !== 'templates' && k !== 'messageLog') bootRest[k] = boot[k]; });
    check('getBootstrap: 표 데이터에 주민번호 관련 열이 없다 (rrnStatus 는 상태만)', JSON.stringify(bootRest).search(/rrn|주민/i) < 0);

    // 단계 체크
    var r1 = setStep('e_a', 'pay', true);
    check('setStep: 입금 체크하면 오늘 날짜가 기록된다', r1.pay_at === today, r1.pay_at);
    check('setStep: updated_by는 서버가 채운다(시험자 이메일)', r1.updated_by === currentEmail_(), r1.updated_by);
    var r2 = setStep('e_a', 'pay', true);
    check('setStep: 이미 완료면 날짜와 수정 시각이 그대로다', r2.pay_at === r1.pay_at && r2.updated_at === r1.updated_at);
    check('setStep: 해제하면 빈칸', setStep('e_a', 'pay', false).pay_at === '');
    expectError('setStep: 알 수 없는 단계는 거부', 'INVALID', function () { setStep('e_a', 'pass', true); });
    expectError('setStep: 시작 전 회차의 참석은 거부', 'INVALID', function () { setStep('e_c', 'attend', '참석'); });
    check('setStep: 시작한 회차의 참석은 가능', setStep('e_a', 'attend', '참석').attend === '참석');
    expectError('setStep: 참석 값이 이상하면 거부', 'INVALID', function () { setStep('e_a', 'attend', '노쇼'); });
    expectError('setStep: 없는 참여 기록은 NOT_FOUND', 'NOT_FOUND', function () { setStep('nope', 'pay', true); });

    // 참여 기록 수정
    var u1 = updateEnrollment('e_a', { transport: '시외터미널', memo: '알레르기 있음' });
    check('updateEnrollment: 이동수단을 바꾼다', u1.transport === '시외터미널' && u1.memo === '알레르기 있음');
    expectError('updateEnrollment: 허용되지 않은 이동수단 거부', 'INVALID', function () { updateEnrollment('e_a', { transport: '기차' }); });
    expectError('updateEnrollment: 수정 불가 열(updated_by) 거부', 'INVALID', function () { updateEnrollment('e_a', { updated_by: 'x@x.com' }); });
    expectError('updateEnrollment: 수정 불가 열(pay_at) 거부', 'INVALID', function () { updateEnrollment('e_a', { pay_at: '2026-01-01' }); });
    expectError('updateEnrollment: 주민번호 모양 거부', 'INVALID', function () { updateEnrollment('e_a', { memo: '900101-1234567' }); });
    expectError('updateEnrollment: 오래된 수정 시각이면 충돌', 'CONFLICT', function () { updateEnrollment('e_a', { memo: '충돌' }, '2000-01-01 00:00:00'); });
    var u2 = updateEnrollment('e_a', { memo: '최신 시각으로 수정' }, enr('e_a').updated_at);
    check('updateEnrollment: 최신 시각이면 통과', u2.memo === '최신 시각으로 수정');
    check('updateEnrollment: HTML 글자는 그대로 저장(이스케이프는 화면에서)', updateEnrollment('e_a', { memo: '<b>굵게</b>' }).memo === '<b>굵게</b>');

    // 사람 수정
    var pu = updatePerson('p_a', { job: '디자이너', phone: '01000000001', consent_retain: 'Y' });
    check('updatePerson: 값이 정리되어 저장된다(전화번호 형식)', pu.job === '디자이너' && pu.phone === '010-0000-0001' && pu.consent_retain === 'Y');
    expectError('updatePerson: 같은 이름+전화번호면 중복', 'DUPLICATE', function () { updatePerson('p_b', { name: '시험가', phone: '010-0000-0001' }); });
    expectError('updatePerson: 수정 불가 열(gender) 거부', 'INVALID', function () { updatePerson('p_a', { gender: '남' }); });
    expectError('updatePerson: 이름 비우면 거부', 'INVALID', function () { updatePerson('p_a', { name: '  ' }); });

    // 일괄 처리와 취소
    var b1 = bulkSetStep('w91', 'attend', '불참');
    check('bulkSetStep: 회차 전원에게 적용(2명)', b1.length === 2, String(b1.length));
    var c1 = updateEnrollment('e_b', { cancel_reason: '시험 취소' });
    check('취소: 사유를 넣으면 취소일이 오늘로 기록된다', c1.cancel_reason === '시험 취소' && c1.cancelled_at === today, c1.cancelled_at);
    expectError('취소된 참여자의 단계 체크는 거부', 'CANCELLED', function () { setStep('e_b', 'pay', true); });
    var b2 = bulkSetStep('w91', 'attend', '참석');
    check('bulkSetStep: 취소된 사람은 제외(1명만 바뀜)', b2.length === 1 && b2[0].enroll_id === 'e_a', String(b2.length));
    check('bulkSetStep: 취소된 사람의 값은 그대로', enr('e_b').attend === '불참');
    expectError('bulkSetStep: 시작 전 회차의 참석은 거부', 'INVALID', function () { bulkSetStep('w92', 'attend', '참석'); });
    var c2 = updateEnrollment('e_b', { cancel_reason: '' });
    check('취소 해제: 사유와 취소일이 비워진다', c2.cancel_reason === '' && c2.cancelled_at === '');

    // 만족도 응답 표기 + 스키마 확장 (복사본에서 sat_at 머리글을 지운 뒤 migrateSchema 가 다시 만드는지까지 본다)
    var enrSh = openDb_().getSheetByName('Enrollments');
    var satIdx = SCHEMA.Enrollments.cols.indexOf('sat_at') + 1;
    enrSh.getRange(1, satIdx).clearContent();
    expectError('만족도: 열이 없으면 안내와 함께 거부(스키마 확장 필요)', 'INVALID', function () { setStep('e_a', 'sat', true); });
    var enrTab0 = checkTabs_(openDb_(), SCHEMA).filter(function (t) { return t.name === 'Enrollments'; })[0];
    check('스키마 확장: 열이 없으면 시스템 상태가 알려 준다', !enrTab0.ok && /sat_at/.test(enrTab0.problem), enrTab0.problem);
    var mig = migrateSchema();
    check('스키마 확장: 빠진 열(sat_at)만 덧붙인다', mig.added.length === 1 && mig.added[0].tab === 'Enrollments' && mig.added[0].cols.join() === 'sat_at', JSON.stringify(mig));
    check('스키마 확장: 실행 뒤 모든 탭이 정의와 맞는다', checkTabs_(openDb_(), SCHEMA).every(function (t) { return t.ok; }), JSON.stringify(checkTabs_(openDb_(), SCHEMA).filter(function (t) { return !t.ok; })));
    check('스키마 확장: 한 번 더 실행해도 바뀌는 것이 없다', migrateSchema().added.length === 0);
    check('스키마 확장: 기존 데이터는 그대로다 (시험 참여 기록이 남아 있다)', !!enr('e_a') && !!enr('e_b'));
    expectError('만족도: 시작 전 회차는 거부', 'INVALID', function () { setStep('e_c', 'sat', true); });
    var sat1 = setStep('e_a', 'sat', true);
    check('만족도: 체크하면 오늘 날짜가 기록된다', sat1.sat_at === today, sat1.sat_at);
    check('만족도: 이미 체크한 것을 다시 눌러도 날짜가 그대로', setStep('e_a', 'sat', true).sat_at === today);
    check('만족도: 해제하면 빈칸', setStep('e_a', 'sat', false).sat_at === '');
    expectError('만족도: 직접 고치기(updateEnrollment)는 거부', 'INVALID', function () { updateEnrollment('e_a', { sat_at: '2026-01-01' }); });
    updateEnrollment('e_b', { cancel_reason: '시험 취소 3' });
    expectError('만족도: 취소된 참여자는 거부', 'CANCELLED', function () { setStep('e_b', 'sat', true); });
    var sb = bulkSetStep('w91', 'sat', true);
    check('만족도: 일괄 체크는 취소된 사람을 제외한다(1명)', sb.length === 1 && sb[0].enroll_id === 'e_a' && enr('e_b').sat_at === '', String(sb.length));
    expectError('만족도: 시작 전 회차 일괄 체크는 거부', 'INVALID', function () { bulkSetStep('w92', 'sat', true); });
    updateEnrollment('e_b', { cancel_reason: '' });
    bulkSetStep('w91', 'sat', false);
    check('만족도: 일괄 해제', enr('e_a').sat_at === '' && enr('e_b').sat_at === '');

    // 회차 관리
    var s1 = saveSession({ program_id: 'w', n: '95', start: '2026-12-01', end: '2026-12-03', fee: '50000', cap: '7', note: '' });
    check('saveSession: 새 회차 추가(session_id = w95)', s1.session_id === 'w95' && s1.fee === 50000 && s1.cap === 7, JSON.stringify(s1));
    expectError('saveSession: 같은 프로그램·번호는 중복', 'DUPLICATE', function () { saveSession({ program_id: 'w', n: 95, start: '2026-12-01', end: '2026-12-03', fee: 0, cap: 7 }); });
    expectError('saveSession: 종료일이 시작일보다 빠르면 거부', 'INVALID', function () { saveSession({ program_id: 'w', n: 96, start: '2026-12-05', end: '2026-12-03', fee: 0, cap: 7 }); });
    var s2 = saveSession({ session_id: 'w95', start: '2026-12-02', end: '2026-12-04', fee: 60000, cap: 5, note: '수정함' });
    check('saveSession: 기존 회차 수정(날짜·참가비·정원)', s2.start === '2026-12-02' && s2.fee === 60000 && s2.cap === 5);
    check('saveSession: 수정해도 프로그램·번호는 그대로', s2.program_id === 'w' && s2.n === 95);
    expectError('deleteSession: 참여 기록이 있는 회차는 삭제 불가', 'INVALID', function () { deleteSession('w91'); });
    check('deleteSession: 비어 있는 회차는 삭제 가능', deleteSession('w95') === true && readTab_('Sessions').every(function (s) { return s.session_id !== 'w95'; }));

    // 주민번호 (임시 파일에서만. 모두 가짜 번호)
    var rrnHas = function (id) { return rrnReadMeta_().some(function (r) { return r.enroll_id === id; }); };
    var rrnVal = function (id) { var f = rrnReadAll_().filter(function (r) { return r.enroll_id === id; })[0]; return f ? f.rrn : null; };
    check('주민번호 시험은 임시 파일에서만 한다 (실제 주민번호 파일이 아님)', tmpRrnId !== '' && openRrn_().getId() === tmpRrnId && tmpRrnId !== propOrThrow_('RRN_ID'));
    expectError('setRrn: 이미 끝난 회차에는 입력할 수 없다', 'INVALID', function () { setRrn('e_a', '950101-2234567'); });
    expectError('setRrn: 자릿수 오류는 거부', 'INVALID', function () { setRrn('e_c', '9501012'); });
    expectError('setRrn: 생년월일 오류는 거부', 'INVALID', function () { setRrn('e_c', '951301-2234567'); });
    expectError('setRrn: 성별 자리 오류는 거부', 'INVALID', function () { setRrn('e_c', '950101-9234567'); });
    expectError('setRrn: 성별 불일치는 확인이 필요 (RRN_CHECK)', 'RRN_CHECK', function () { setRrn('e_c', '950101-1234567'); });
    expectError('setRrn: 출생연도 불일치도 확인이 필요 (RRN_CHECK)', 'RRN_CHECK', function () { setRrn('e_c', '960101-2234567'); });
    check('setRrn: 거부된 번호는 저장되지 않는다', rrnReadMeta_().length === 0);
    check('setRrn: 정상 번호는 저장되고 상태는 ok', setRrn('e_c', '9501012234567').status === 'ok' && rrnHas('e_c'));
    check('setRrn: 하이픈 형태로 정리돼 저장된다', rrnVal('e_c') === '950101-2234567');
    check('setRrn: 다시 입력하면 덮어쓰고 행이 늘지 않는다', setRrn('e_c', '950101-2345678').status === 'ok' && rrnReadMeta_().length === 1 && rrnVal('e_c') === '950101-2345678');
    var bs = getBootstrap();
    check('getBootstrap: 주민번호는 상태만 있다 (e_c: ok)', !!bs.rrnStatus && bs.rrnStatus.e_c === 'ok');
    check('getBootstrap: 응답 어디에도 주민번호 값이 없다', JSON.stringify(bs).search(/\d{6}-?[1-8]\d{6}/) < 0);
    check('getBootstrap: 끝난 회차의 참여 기록은 주민번호 상태에 없다', bs.rrnStatus.e_a === undefined);
    check('setRrn(확인 선택): 대조에 걸린 번호도 저장되고 상태는 check', setRrn('e_c', '950101-1234567', true).status === 'check' && getBootstrap().rrnStatus.e_c === 'check');
    expectError('주민번호 파일 쓰기: 형식이 틀린 번호는 아무것도 쓰지 않는다', 'INVALID', function () {
      withLock_(function () { rrnUpsertUnlocked_([{ enroll_id: 'zz', rrn: 'bad', session_end: '2099-01-01' }]); });
    });
    check('주민번호 파일 쓰기: 거부된 행이 남지 않는다', !rrnHas('zz'));
    // 삭제 경로 ①: 보험 가입 완료
    setRrn('e_c', '950101-2234567');
    var del1 = setStep('e_c', 'ins', true);
    check('주민번호 삭제 ① 보험 완료 체크하면 그 번호가 지워진다', !rrnHas('e_c') && !del1._warn);
    // 삭제 경로 ②: 신청 취소
    setRrn('e_c', '950101-2234567');
    var del2 = updateEnrollment('e_c', { cancel_reason: '시험 취소' });
    check('주민번호 삭제 ② 취소하면 그 번호가 지워진다', !rrnHas('e_c') && !del2._warn);
    expectError('setRrn: 취소된 참여 기록에는 입력할 수 없다', 'INVALID', function () { setRrn('e_c', '950101-2234567'); });
    updateEnrollment('e_c', { cancel_reason: '' });
    // 일괄 보험 처리도 번호를 지운다
    setRrn('e_c', '950101-2234567');
    bulkSetStep('w92', 'ins', true);
    check('주민번호 삭제 ① 보험 일괄 처리도 번호를 지운다', !rrnHas('e_c'));
    // 지우기에 실패하면 조용히 넘어가지 않고 화면에 알린다 (삭제 함수를 일부러 실패시켜 본다)
    setRrn('e_c', '950101-2234567');
    var origDelete = rrnDeleteUnlocked_;
    rrnDeleteUnlocked_ = function () { throw new Error('시험용 실패'); };
    var del3;
    try { del3 = updateEnrollment('e_c', { cancel_reason: '시험 취소 2' }); } finally { rrnDeleteUnlocked_ = origDelete; }
    check('주민번호 삭제 실패: 화면에 알릴 안내가 붙고, 번호는 남아 있다 (거짓으로 성공이라고 하지 않음)', !!del3._warn && rrnHas('e_c'));
    check('주민번호 삭제 실패: 감사 기록에 남는다 (값 없음)', readTab_('AuditLog').some(function (a) { return a.action === 'rrn_delete_failed'; }));
    withLock_(function () { rrnDeleteUnlocked_(['e_c']); });
    updateEnrollment('e_c', { cancel_reason: '' });
    check('주민번호 파일이 시험 끝에 비어 있다', rrnReadMeta_().length === 0);
    // 개인정보 점검 (운영 DB 복사본에는 실제 데이터가 들어 있으므로, 실제 DB가 깨끗한지도 함께 확인된다)
    var scan0 = scanForRrn();
    check('개인정보 점검: 운영 DB에 주민번호 모양의 값이 없다 (실제 데이터 포함)', scan0.total === 0, JSON.stringify(scan0.findings));
    withLock_(function () {
      appendObjects_(openDb_(), SCHEMA, 'Enrollments', [{ enroll_id: 'e_leak', session_id: 'w91', person_id: 'p_a', pass: '합격', memo: '900101-1234567', updated_at: old, updated_by: 'seed' }]);
    });
    var scan1 = scanForRrn();
    check('개인정보 점검: 숨어 있는 번호를 찾아 탭·열·개수만 알려 준다 (값 없음)',
      scan1.total === 1 && scan1.findings[0].tab === 'Enrollments' && scan1.findings[0].column === 'memo' && JSON.stringify(scan1).indexOf('900101') < 0, JSON.stringify(scan1));
    withLock_(function () { deleteRowsByKeysUnlocked_('Enrollments', ['e_leak']); });
    check('개인정보 점검: 지운 뒤에는 다시 0개', scanForRrn().total === 0);

    // 보험 명단 (임시 파일의 가짜 번호). 정상 1명·확인 필요 1명·번호 없음 1명
    setStep('e_c', 'ins', false);
    withLock_(function () {
      appendObjects_(openDb_(), SCHEMA, 'People', [{ person_id: 'p_i', name: '시험이', phone: '010-0000-0009', gender: '여', birth_year: 1990, created_at: old, updated_at: old }]);
      appendObjects_(openDb_(), SCHEMA, 'Enrollments', [
        { enroll_id: 'e_i1', session_id: 'w92', person_id: 'p_b', pass: '합격', updated_at: old, updated_by: 'seed' },
        { enroll_id: 'e_i2', session_id: 'w92', person_id: 'p_i', pass: '합격', updated_at: old, updated_by: 'seed' }]);
    });
    setRrn('e_c', '950101-2234567');                    // 시험가(여, 1995): 정상
    setRrn('e_i1', '960101-2234567', true);             // 시험나(남, 1996): 성별 자리가 달라 "확인 필요"로 저장
    var ins1 = getInsuranceList('w92');
    check('보험 명단: 정상 번호인 1명만 이름·번호가 나온다', ins1.list.length === 1 && ins1.list[0].enroll_id === 'e_c' && ins1.list[0].name === '시험가' && ins1.list[0].rrn === '950101-2234567', JSON.stringify(ins1.list.length));
    var exc = {}; ins1.excluded.forEach(function (x) { exc[x.enroll_id] = x; });
    check('보험 명단: 확인 필요(e_i1)와 번호 없음(e_i2)은 이름과 이유만, 번호는 없다', ins1.excluded.length === 2 && exc.e_i1.reason === 'check' && exc.e_i2.reason === 'missing' && JSON.stringify(ins1.excluded).search(/\d{6}/) < 0);
    check('보험 명단: 확인 필요인 사람의 번호는 명단 어디에도 없다', JSON.stringify(ins1).indexOf('960101') < 0);
    var insAudit = JSON.stringify(readTab_('AuditLog').filter(function (a) { return a.action === 'insurance_list'; }));
    check('감사 기록: insurance_list 에 인원 수만 있고 이름·번호가 없다', insAudit.indexOf('명단 1명') >= 0 && insAudit.search(/시험[가나다라마바사이]|\d{6}-?\d/) < 0, insAudit);
    expectError('보험 명단: 없는 회차는 NOT_FOUND', 'NOT_FOUND', function () { getInsuranceList('nope'); });
    expectError('보험 완료: 선택한 사람이 없으면 거부', 'INVALID', function () { completeInsurance('w92', []); });
    updateEnrollment('e_i2', { cancel_reason: '시험 취소 4' });
    check('보험 명단: 취소된 사람은 제외 목록에도 나오지 않는다', getInsuranceList('w92').excluded.every(function (x) { return x.enroll_id !== 'e_i2'; }));
    var comp = completeInsurance('w92', ['e_c']);
    check('보험 완료: 보험 완료일이 기록되고 그 사람의 주민번호가 지워진다', comp.length === 1 && comp[0].ins_at === today && !rrnHas('e_c') && !comp[0]._warn);
    check('보험 완료: 선택하지 않은 사람의 번호는 남는다', rrnHas('e_i1'));
    check('주민번호 상태: 보험 완료한 사람은 상태 맵에서 빠진다 (번호가 지워졌으므로 "없음"으로 보이지 않는다)', getBootstrap().rrnStatus.e_c === undefined);
    var ins2 = getInsuranceList('w92');
    check('보험 명단: 완료한 사람은 명단에서 빠지고 "이미 완료"로 센다', ins2.list.length === 0 && ins2.done === 1, JSON.stringify([ins2.list.length, ins2.done]));
    withLock_(function () { rrnDeleteUnlocked_(['e_i1']); deleteRowsByKeysUnlocked_('Enrollments', ['e_i1', 'e_i2']); deleteRowsByKeysUnlocked_('People', ['p_i']); });
    check('보험 시험 뒤 주민번호 파일이 비어 있다', rrnReadMeta_().length === 0 && scanForRrn().total === 0);

    // 문구 저장·발송 기록·프로그램 설정
    var tplCount = function () { return readTab_('Templates').length; };
    var tc0 = tplCount();
    var t1 = saveTemplate({ name: '시험 문구', stage: 'm1', program_id: 'all', channel: 'sms', body: '{이름}님 안녕하세요' });
    check('문구 저장: 새 문구가 저장되고 저장한 사람이 기록된다', tplCount() === tc0 + 1 && t1.saved_by === currentEmail_() && /^t_/.test(t1.tpl_id));
    var t1b = saveTemplate({ name: '시험 문구', stage: 'm1', program_id: 'all', channel: 'mail', body: '{이름}님, 내용을 바꿨어요' });
    check('문구 저장: 같은 이름·단계·프로그램이면 덮어쓴다(개수 그대로, 같은 ID)', tplCount() === tc0 + 1 && t1b.tpl_id === t1.tpl_id && t1b.channel === 'mail' && t1b.body.indexOf('바꿨어요') >= 0);
    expectError('문구 저장: 주민번호 모양은 거부', 'INVALID', function () { saveTemplate({ name: '나쁜 문구', stage: 'm1', program_id: 'all', channel: 'sms', body: '번호 900101-1234567' }); });
    expectError('문구 저장: 단계가 이상하면 거부', 'INVALID', function () { saveTemplate({ name: '나쁜 문구', stage: 'zz', program_id: 'all', channel: 'sms', body: '내용' }); });
    expectError('문구 저장: 이름이 비면 거부', 'INVALID', function () { saveTemplate({ name: '  ', stage: 'm1', program_id: 'all', channel: 'sms', body: '내용' }); });
    var t2 = saveTemplate({ name: '시험 문구 2', stage: 'pay', program_id: 'w', channel: 'sms', body: '입금해 주세요' });
    expectError('문구 저장: 이름을 바꾸다 다른 문구와 겹치면 DUPLICATE', 'DUPLICATE', function () { saveTemplate({ tpl_id: t2.tpl_id, name: '시험 문구', stage: 'm1', program_id: 'all', channel: 'sms', body: '내용' }); });
    var t2b = saveTemplate({ tpl_id: t2.tpl_id, name: '시험 문구 2 (이름 바꿈)', stage: 'pay', program_id: 'w', channel: 'sms', body: '입금해 주세요' });
    check('문구 저장: tpl_id 로 이름을 바꿀 수 있다(개수 그대로)', t2b.tpl_id === t2.tpl_id && tplCount() === tc0 + 2 && t2b.name.indexOf('이름 바꿈') >= 0);
    check('문구 삭제: 지운다', deleteTemplate(t1.tpl_id) === true && deleteTemplate(t2.tpl_id) === true && tplCount() === tc0);
    expectError('문구 삭제: 없는 문구는 NOT_FOUND', 'NOT_FOUND', function () { deleteTemplate(t1.tpl_id); });
    check('문구: 처음 넣어 둔 기본 문구는 그대로 남아 있다', readTab_('Templates').some(function (x) { return x.tpl_id === 't1'; }) || tc0 === 0);

    var logCount = function () { return readTab_('MessageLog').length; };
    var lc0 = logCount();
    var lg1 = logMessage('w92', 'sms', 'm1', 'nom1', '{이름}님 1차 안내', true);
    check('발송 기록: 대상 1명이 기록되고 1차 안내 완료로 표시된다', lg1.count === 1 && lg1.marked === 1 && enr('e_c').m1_at === today && logCount() === lc0 + 1, JSON.stringify([lg1.count, lg1.marked]));
    check('발송 기록: 보낸 사람은 서버가 채우고 받는 사람 정보는 없다', lg1.log.by === currentEmail_() && JSON.stringify(lg1.log).search(/시험가|0100000/) < 0);
    var lg2 = logMessage('w92', 'sms', 'm1', 'nom1', '{이름}님 1차 안내', true);
    check('발송 기록: 이미 안내한 사람은 "1차 안내 미발송" 대상에서 빠진다', lg2.count === 0 && lg2.marked === 0);
    var lg3 = logMessage('w92', 'sms', 'pay', 'unpaid', '입금해 주세요', true);
    check('발송 기록: 입금 단계는 안내 완료 표시를 하지 않는다(기록만)', lg3.count === 1 && lg3.marked === 0 && enr('e_c').pay_at === '');
    var lg4 = logMessage('w92', 'sms', 'etc', 'all', '기타 안내', false);
    check('발송 기록: 표시 옵션을 끄면 기록만 한다', lg4.count === 1 && lg4.marked === 0);
    expectError('발송 기록: 주민번호 모양의 문구는 거부', 'INVALID', function () { logMessage('w92', 'sms', 'etc', 'all', '900101-1234567', false); });
    expectError('발송 기록: 방식이 이상하면 거부', 'INVALID', function () { logMessage('w92', 'kakao', 'etc', 'all', '내용', false); });
    expectError('발송 기록: 대상 조건이 이상하면 거부', 'INVALID', function () { logMessage('w92', 'sms', 'etc', 'everyone', '내용', false); });
    expectError('발송 기록: 없는 회차는 NOT_FOUND', 'NOT_FOUND', function () { logMessage('nope', 'sms', 'etc', 'all', '내용', false); });
    var mAudit = JSON.stringify(readTab_('AuditLog').filter(function (a) { return a.action === 'message_log'; }));
    check('감사 기록: message_log 에 문구 내용과 이름이 없다', mAudit.indexOf('message_log') >= 0 && mAudit.indexOf('1차 안내') < 0 && mAudit.search(/시험가|0100000/) < 0);
    check('getBootstrap: 문구와 최근 발송 기록이 들어 있다', getBootstrap().templates.length === tc0 && getBootstrap().messageLog.length >= 4);
    setStep('e_c', 'm1', false);

    var pg0 = readTab_('Programs').filter(function (p) { return p.program_id === 'w'; })[0];
    var pg1 = saveProgram('w', { form_url: 'https://forms.example.com/sat-test' });
    check('프로그램 설정: 만족도 폼 링크가 저장된다', pg1.form_url === 'https://forms.example.com/sat-test' && readTab_('Programs').filter(function (p) { return p.program_id === 'w'; })[0].form_url === pg1.form_url);
    expectError('프로그램 설정: http(s) 가 아닌 주소는 거부', 'INVALID', function () { saveProgram('w', { form_url: 'javascript:alert(1)' }); });
    expectError('프로그램 설정: 없는 프로그램은 NOT_FOUND', 'NOT_FOUND', function () { saveProgram('zz', { form_url: 'https://example.com' }); });
    check('프로그램 설정: 비우면 링크가 지워진다', saveProgram('w', { form_url: '' }).form_url === '');
    saveProgram('w', { form_url: pg0.form_url || '' });

    // 자동 정리 (임시 주민번호 파일). 기간이 지난 것 · 참여 기록이 없거나 취소된 것은 지우고, 정상인 것은 남긴다
    withLock_(function () {
      appendObjects_(openDb_(), SCHEMA, 'Enrollments', [
        { enroll_id: 'e_sw', session_id: 'w92', person_id: 'p_b', pass: '합격', updated_at: old, updated_by: 'seed' },
        { enroll_id: 'e_sw2', session_id: 'w92', person_id: 'p_a', pass: '합격', cancel_reason: '시험 취소 5', cancelled_at: today, updated_at: old, updated_by: 'seed' }]);
      rrnUpsertUnlocked_([
        { enroll_id: 'e_a', rrn: '950101-2234567', session_end: '2026-01-07' },      // 회차 종료 3개월이 지남 → 지운다
        { enroll_id: 'e_none', rrn: '960101-1234567', session_end: '2099-01-07' },   // 참여 기록이 없음 → 지운다
        { enroll_id: 'e_sw2', rrn: '950101-2234567', session_end: '2099-01-07' },    // 취소됨 → 지운다
        { enroll_id: 'e_sw', rrn: '960101-1234567', session_end: '2099-01-07' }]);   // 정상 → 남긴다
    });
    var sw1 = sweepRrn();
    check('자동 정리: 기간 지난 것·기록 없는 것·취소된 것 3건을 지우고 정상 1건은 남긴다', sw1.deleted === 3 && rrnHas('e_sw') && !rrnHas('e_a') && !rrnHas('e_none') && !rrnHas('e_sw2'), JSON.stringify(sw1));
    check('자동 정리: 실행 시각과 지운 개수가 Config 에 남는다', readConfig_().rrn_sweep_last.slice(0, 10) === today && readConfig_().rrn_sweep_count === '3');
    check('자동 정리: 감사 기록 rrn_sweep 에 개수만 있다', readTab_('AuditLog').some(function (a) { return a.action === 'rrn_sweep' && /지움 3건/.test(a.detail) && !/\d{6}/.test(a.detail); }));
    check('자동 정리: 한 번 더 돌려도 더 지우지 않는다', sweepRrn().deleted === 0 && rrnHas('e_sw'));
    scanForRrn();
    var stt = getSystemStatus();
    check('시스템 상태: 자동 정리가 최근 실행됐고 멈춤 경고가 없다', !!stt.sweep && !stt.sweep.stale && stt.sweep.lastCount === 0, JSON.stringify(stt.sweep));
    check('시스템 상태: 보관 중인 주민번호는 개수와 가장 오래된 보관일만 (값 없음)', stt.rrnHeld.count === 1 && stt.rrnHeld.oldestSavedAt === today && JSON.stringify(stt).search(/\d{6}-?[1-8]\d{6}/) < 0, JSON.stringify(stt.rrnHeld));
    check('시스템 상태: 마지막 개인정보 점검 결과(0개)가 보인다', stt.privacy.total === 0 && stt.privacy.last.slice(0, 10) === today, JSON.stringify(stt.privacy));
    check('시스템 상태: 스키마 확장이 필요한 탭이 없다', !!stt.schema && stt.schema.needs.length === 0, JSON.stringify(stt.schema));
    withLock_(function () { rrnDeleteUnlocked_(['e_sw']); deleteRowsByKeysUnlocked_('Enrollments', ['e_sw', 'e_sw2']); });
    check('자동 정리 시험 뒤 주민번호 파일이 비어 있다', rrnReadMeta_().length === 0);

    // 만족도 응답 확인 (임시 응답 시트. 응답 내용 열에는 일부러 표식 글자를 넣어 앱이 읽지 않는지 본다)
    var respSs = SpreadsheetApp.create('곁마을 자체시험용 응답 시트 (자동 삭제)');
    var respId = respSs.getId();
    try {
      respSs.getSheets()[0].getRange(1, 1, 8, 6).setValues([
        ['타임스탬프', '이메일 주소', '1) 참여자 이름', '2) 참여 기수', '7) 활동 소감', '8) 사진'],
        ['2026-01-08 10:00:00', 'secret-mail-1@example.com', '시험가', '91기 | 1/5~7', '비밀소감표식A', 'secret-photo-1.jpg'],
        ['2026-01-08 10:05:00', 'secret-mail-2@example.com', '시험나', '91기 | 1/5~7', '비밀소감표식B', 'secret-photo-2.jpg'],
        ['2026-01-08 10:06:00', 'secret-mail-1@example.com', ' 시험 가 ', '91기', '비밀소감표식C', ''],
        ['2026-01-08 10:07:00', 'x@example.com', '시험다', '91기', '비밀소감표식D', ''],
        ['2026-01-08 10:08:00', 'x@example.com', '시험', '91기', '비밀소감표식E', ''],
        ['2026-01-08 10:09:00', 'x@example.com', '시험가', '', '비밀소감표식F', ''],
        ['2026-01-08 10:10:00', 'x@example.com', '', '91기', '비밀소감표식G', '']]);
      expectError('프로그램 설정: 응답 시트 주소 형식이 이상하면 거부', 'INVALID', function () { saveProgram('w', { form_sheet_id: '잘못된값' }); });
      expectError('만족도 응답 확인: 응답 시트를 연결하지 않았으면 안내와 함께 거부', 'INVALID', function () { previewSatisfaction('l'); });
      var spg = saveProgram('w', { form_sheet_id: 'https://docs.google.com/spreadsheets/d/' + respId + '/edit' });
      check('프로그램 설정: 응답 시트 주소에서 ID 를 꺼내 저장한다', spg.form_sheet_id === respId);
      var sp1 = previewSatisfaction('w'), sm = sp1.summary;
      check('만족도 응답 확인: 자동 2 · 중복 1 · 못 찾음 1 · 비슷한 이름 1 · 기수 못 읽음 1 · 이름 없음 1', sm.auto === 2 && sm.duplicate === 1 && sm.none === 1 && sm.similar === 1 && sm.no_round === 1 && sm.no_name === 1, JSON.stringify(sm));
      check('만족도 응답 확인: 응답 내용(소감·사진·이메일)은 읽지도 돌려주지도 않는다', JSON.stringify(sp1).search(/비밀소감|secret-/) < 0);
      var rk = {}; sp1.rows.forEach(function (x) { rk[x.rowNo] = x; });
      check('만족도 응답 확인: 첫 응답은 시험가(e_a), 둘째는 시험나(e_b)로 자동 연결 판정', rk[2].decision === 'auto' && rk[2].enroll_id === 'e_a' && rk[3].decision === 'auto' && rk[3].enroll_id === 'e_b');
      expectError('만족도 응답 확인: 적용할 것이 없으면 거부', 'INVALID', function () { applySatisfaction('w', []); });
      var ap1 = applySatisfaction('w', [{ respKey: rk[2].respKey, enroll_id: 'e_a' }, { respKey: rk[3].respKey, enroll_id: 'e_b' }, { respKey: rk[6].respKey, ignore: true }, { respKey: rk[4].respKey, enroll_id: 'e_a' }]);
      check('만족도 응답 확인 적용: 연결 2 · 무시 1 · 건너뜀 1 (중복 응답은 쓰지 않는다)', ap1.linked === 2 && ap1.ignored === 1 && ap1.skipped === 1, JSON.stringify(ap1));
      check('만족도 응답 확인 적용: 만족도 응답일이 응답 날짜로 채워진다', enr('e_a').sat_at === '2026-01-08' && enr('e_b').sat_at === '2026-01-08', enr('e_a').sat_at);
      var smRows = readTab_('SatMatches').filter(function (r) { return r.program_id === 'w'; });
      check('만족도 응답 확인 적용: 연결 기록에 응답 식별자와 결과만 있고 이름·기수 원문은 없다', smRows.length === 3 && JSON.stringify(smRows).search(/시험[가나다]|91기|비밀소감/) < 0 && smRows.every(function (r) { return r.raw_name === '' && r.raw_session === ''; }), JSON.stringify(smRows.length));
      var sp2 = previewSatisfaction('w');
      check('만족도 응답 확인: 처리한 응답은 다시 "처리됨"으로 나온다', sp2.summary.synced === 3 && sp2.summary.auto === 0, JSON.stringify(sp2.summary));
      var ap2 = applySatisfaction('w', [{ respKey: rk[2].respKey, enroll_id: 'e_a' }]);
      check('만족도 응답 확인: 이미 처리한 응답을 다시 적용해도 아무것도 바뀌지 않는다', ap2.linked === 0 && ap2.skipped === 1 && readTab_('SatMatches').filter(function (r) { return r.program_id === 'w'; }).length === 3);
      var ul = unlinkResponse(rk[2].respKey);
      check('연결 풀기: 연결 기록이 지워지고 만족도 응답일이 비워진다', ul.cleared === true && enr('e_a').sat_at === '' && readTab_('SatMatches').filter(function (r) { return r.program_id === 'w'; }).length === 2);
      expectError('연결 풀기: 없는 기록은 NOT_FOUND', 'NOT_FOUND', function () { unlinkResponse('없는키'); });
      var sp3 = previewSatisfaction('w'), rk3 = {}; sp3.rows.forEach(function (x) { rk3[x.rowNo] = x; });
      var ap3 = applySatisfaction('w', [{ respKey: rk3[5].respKey, enroll_id: 'e_a' }]);   // 못 찾은 응답(시험다)을 사람이 골라 연결
      check('사람이 고른 연결(못 찾음 → e_a)도 기록되고 상태는 manual', ap3.linked === 1 && enr('e_a').sat_at === '2026-01-08' && readTab_('SatMatches').some(function (r) { return r.resp_key === rk3[5].respKey && r.status === 'manual'; }));
      // 정리
      withLock_(function () { deleteRowsByKeysUnlocked_('SatMatches', readTab_('SatMatches').filter(function (r) { return r.program_id === 'w'; }).map(function (r) { return r.resp_key; })); });
      bulkSetStep('w91', 'sat', false);
      saveProgram('w', { form_sheet_id: '' });
      check('만족도 응답 확인 시험 뒤 정리: 연결 기록이 없고 응답 시트 연결이 풀렸다', readTab_('SatMatches').filter(function (r) { return r.program_id === 'w'; }).length === 0 && readTab_('Programs').filter(function (p) { return p.program_id === 'w'; })[0].form_sheet_id === '');
    } finally { try { DriveApp.getFileById(respId).setTrashed(true); } catch (eT) { /* 이미 지워졌으면 넘어간다 */ } }

    // 개인정보 파기 (가짜 데이터: 2023년 회차의 사람들)
    appendObjects_(db, SCHEMA, 'Sessions', [{ session_id: 'w90', program_id: 'w', n: 90, start: '2023-10-06', end: '2023-10-08', fee: 50000, cap: 7, note: '시험(옛 회차)' }]);
    appendObjects_(db, SCHEMA, 'People', [
      { person_id: 'p_on', name: '시험파기가', phone: '010-0000-0101', gender: '여', birth_year: 2010, job: '학생', area: '서울', consent_retain: 'N', created_at: old, updated_at: old },
      { person_id: 'p_oy', name: '시험파기나', phone: '010-0000-0102', gender: '남', birth_year: 1990, job: '', area: '서울', consent_retain: 'Y', created_at: old, updated_at: old },
      { person_id: 'p_ou', name: '시험파기다', phone: '010-0000-0103', gender: '여', birth_year: 1985, job: '', area: '', consent_retain: '', created_at: old, updated_at: old }]);
    appendObjects_(db, SCHEMA, 'Enrollments', [
      { enroll_id: 'e_on', session_id: 'w90', person_id: 'p_on', pass: '합격', attend: '참석', updated_at: old, updated_by: 'seed' },
      { enroll_id: 'e_oy', session_id: 'w90', person_id: 'p_oy', pass: '합격', attend: '불참', updated_at: old, updated_by: 'seed' },
      { enroll_id: 'e_ou', session_id: 'w90', person_id: 'p_ou', pass: '합격', attend: '참석', updated_at: old, updated_by: 'seed' }]);
    appendObjects_(db, SCHEMA, 'SatMatches', [{ resp_key: 'k_on', program_id: 'w', enroll_id: 'e_on', status: 'manual', matched_at: old }]);
    withLock_(function () { rrnUpsertUnlocked_([{ enroll_id: 'e_on', rrn: '100101-4234567', session_end: '2023-10-08' }]); });
    var pg = previewPurge();
    check('파기 미리보기: 미동의(연말 지남)·동의(3년 지남) 2명이 삭제 대상, 동의 미확인 1명은 검토 목록', pg.expired.length === 2 && pg.review.length === 1 && pg.expired.some(function (x) { return x.person_id === 'p_on' && x.reason === 'N'; }) && pg.expired.some(function (x) { return x.person_id === 'p_oy' && x.reason === 'Y'; }) && pg.review[0].person_id === 'p_ou', JSON.stringify(pg.summary));
    check('파기 미리보기: 다가오는 회차에 참여 기록이 있는 사람(시험가)과 최근 참여자는 대상이 아니다', !pg.expired.some(function (x) { return x.person_id === 'p_a' || x.person_id === 'p_b'; }));
    check('파기 미리보기: 저장하지 않는다', readTab_('People').some(function (p) { return p.person_id === 'p_on'; }) && readTab_('Stats').every(function (s) { return s.session_id !== 'w90'; }));
    expectError('파기 실행: 확인 문구가 없으면 거부', 'INVALID', function () { purgeExpired(''); });
    expectError('파기 실행: 확인 문구가 다르면 거부', 'INVALID', function () { purgeExpired('삭제합니다'); });
    check('파기 실행 전에는 아무것도 지워지지 않았다', readTab_('People').some(function (p) { return p.person_id === 'p_on'; }));
    var pr = purgeExpired('삭제');
    check('파기 실행: 사람 2·참여 기록 2·주민번호 1·만족도 연결 1이 지워지고 익명 통계 1줄이 남는다', pr.people === 2 && pr.enrollments === 2 && pr.rrn === 1 && pr.satMatches === 1 && pr.statsRows === 1, JSON.stringify(pr));
    check('파기 실행: 삭제 직전 백업이 만들어진다', !!pr.backup && !!pr.backup.id);
    try { DriveApp.getFileById(pr.backup.id).setTrashed(true); } catch (eB) { /* 백업 파일 정리 */ }
    var peopleAfter = readTab_('People').map(function (p) { return p.person_id; });
    check('파기 실행: 대상은 사라지고 검토 대상(동의 미확인)과 다른 사람은 남는다', peopleAfter.indexOf('p_on') < 0 && peopleAfter.indexOf('p_oy') < 0 && peopleAfter.indexOf('p_ou') >= 0 && peopleAfter.indexOf('p_a') >= 0);
    check('파기 실행: 주민번호 파일·만족도 연결·참여 기록도 지워진다', !rrnHas('e_on') && readTab_('SatMatches').every(function (r) { return r.enroll_id !== 'e_on'; }) && readTab_('Enrollments').every(function (e) { return e.enroll_id !== 'e_on' && e.enroll_id !== 'e_oy'; }) && readTab_('Enrollments').some(function (e) { return e.enroll_id === 'e_ou'; }));
    var st90 = readTab_('Stats').filter(function (s) { return s.session_id === 'w90'; })[0];
    check('파기 실행: 익명 통계에 인원·참석·성별·연령대가 맞게 남고 이름이 없다', !!st90 && Number(st90.n_applied) === 2 && Number(st90.n_attend) === 1 && Number(st90.n_male) === 1 && Number(st90.n_female) === 1 && Number(st90.n_age_under20) === 1 && Number(st90.n_age_30s) === 1 && JSON.stringify(st90).search(/시험파기|010-0000/) < 0, JSON.stringify(st90));
    var purgeAudit = JSON.stringify(readTab_('AuditLog').filter(function (a) { return a.action === 'purge'; }));
    check('감사 기록: purge 에 인원 수만 있고 이름·연락처가 없다', purgeAudit.indexOf('사람 2') >= 0 && purgeAudit.search(/시험파기|010-0000/) < 0, purgeAudit);
    check('파기 실행 뒤 진행 상태(purge_state)가 비워진다', !readConfig_().purge_state);
    expectError('파기 실행: 남은 대상이 없으면 거부', 'INVALID', function () { purgeExpired('삭제'); });
    // 중간에 멈췄던 파기를 이어서 하는 경우: 통계를 두 번 더하지 않는다
    appendObjects_(db, SCHEMA, 'People', [{ person_id: 'p_on2', name: '시험파기라', phone: '010-0000-0104', gender: '여', birth_year: 1995, consent_retain: 'N', created_at: old, updated_at: old }]);
    appendObjects_(db, SCHEMA, 'Enrollments', [{ enroll_id: 'e_on2', session_id: 'w90', person_id: 'p_on2', pass: '합격', attend: '참석', updated_at: old, updated_by: 'seed' }]);
    withLock_(function () { setConfigUnlocked_('purge_state', JSON.stringify({ ids: ['p_on2'], statsDone: true })); });
    var pr2 = purgeExpired('삭제');
    var st90b = readTab_('Stats').filter(function (s) { return s.session_id === 'w90'; })[0];
    check('이어서 하는 파기: 이미 통계를 남긴 상태면 통계를 다시 더하지 않고 사람만 지운다', pr2.resumed === true && pr2.statsRows === 0 && pr2.people === 1 && Number(st90b.n_applied) === 2, JSON.stringify(pr2));
    withLock_(function () {
      purgeDeleteWhere_('Stats', 'session_id', { w90: true }); deleteRowsByKeysUnlocked_('Enrollments', ['e_ou']); deleteRowsByKeysUnlocked_('People', ['p_ou']); deleteRowsByKeysUnlocked_('Sessions', ['w90']);
    });
    check('파기 시험 뒤 개인정보 점검 0개, 주민번호 파일 비어 있음', scanForRrn().total === 0 && rrnReadMeta_().length === 0);

    // 신청 엑셀 업로드 (가짜 데이터. 미래 회차 w93 에 올린다. 주민번호는 임시 파일에만 저장된다)
    if (!db.getSheetByName('Uploads')) {
      check('업로드 시험: Uploads 탭이 있다 (없으면 setup 을 다시 실행해 주세요)', false, 'Uploads 탭 없음');
    } else {
      appendObjects_(db, SCHEMA, 'Sessions', [{ session_id: 'w93', program_id: 'w', n: 93, start: '2099-03-01', end: '2099-03-03', fee: 50000, cap: 7, note: '' }]);
      var AH = ['번호', '이름', '연락처', '성별', '출생연도', '직업', '거주지', '이메일', '주민번호', '프로그램 상세 시간표', '신청하시는 회차', '이외에 곁마을 운영진에게', '기타답변', '초상권동의', '추가보유동의', '신청일', '합격여부', '참석 여부', '취소사유'];
      var AR = function (name, phone, g, b, o) {   // 주민번호 칸은 화면이 떼어낸 것처럼 비워 둔다
        o = o || {};
        return ['1', name, phone, g, b, o.job || '', '서울', '', '', '예', o.round || '93회차 | 시험테마 | 3/1-3', '', '', o.portrait || '동의', '동의', '2026-11-10 9:30', o.pass || '합격', '', o.cancel || ''];
      };
      var upRows = [AH,
        AR('시험다', '01000000003', '여', '1990', { job: '시험직업' }),     // 2행: 새 사람, 번호 정상
        AR('시험나', '01000000002', '남', '1996', { job: '시험직업2' }),    // 3행: 이미 있는 사람(p_b), 새 참여 기록, 번호 정상
        AR('시험라', '01000000004', '남', '1991'),                          // 4행: 새 사람, 번호 자릿수 오류
        AR('시험마', '01000000005', '남', '1992', { pass: '불합격' }),      // 5행: 불합격 제외
        AR('시험바', '01000000006', '여', '1993', { cancel: '시험 취소' }), // 6행: 취소 상태로 등록
        AR('시험사', '01000000007', '여', '1994', { round: '77회차 | 없음 | 1/1-2' })];  // 7행: 회차 확인 필요
      var upRrns = [
        { rowNo: 2, rrn: '9001012234567', confirmMismatch: false },
        { rowNo: 3, rrn: '960101-1234567', confirmMismatch: false },
        { rowNo: 4, rrn: '12345', confirmMismatch: false },
        { rowNo: 6, rrn: '930101-2234567', confirmMismatch: false }];
      var cnt = function () { return { p: readTab_('People').length, e: readTab_('Enrollments').length, u: readTab_('Uploads').length }; };
      var c0 = cnt(), sess93 = function () { return readTab_('Sessions').filter(function (s) { return s.session_id === 'w93'; })[0]; };
      var personNamed = function (n) { return readTab_('People').filter(function (p) { return p.name === n; })[0]; };
      var enrOf = function (n) { var p = personNamed(n); return p ? readTab_('Enrollments').filter(function (e) { return e.person_id === p.person_id && e.session_id === 'w93'; })[0] : null; };

      var prev = previewApplications({ rows: upRows, programId: 'w' });
      var ps = prev.summary;
      check('업로드 미리보기: 신규 3·취소 등록 1·불합격 1·회차 확인 필요 1', prev.ok && ps.new === 3 && ps.cancelled_new === 1 && ps.rejected === 1 && ps.needs_session === 1, JSON.stringify(ps));
      check('업로드 미리보기: 저장하지 않는다', JSON.stringify(cnt()) === JSON.stringify(c0));
      check('업로드 미리보기: 경고·요약에 이름·연락처가 없다', JSON.stringify([prev.warnings, prev.summary, prev.errors]).search(/시험[가나다라마바사]|0100000/) < 0);
      expectError('업로드: 본문에 주민번호 모양이 있으면 거부', 'INVALID', function () {
        var bad = upRows.map(function (r) { return r.slice(); }); bad[1][11] = '9001012234567';
        commitApplications({ rows: bad, programId: 'w', rrns: [] });
      });
      expectError('업로드: 프로그램이 이상하면 거부', 'INVALID', function () { previewApplications({ rows: upRows, programId: 'zz' }); });
      check('업로드 거부 뒤에도 아무것도 저장되지 않았다', JSON.stringify(cnt()) === JSON.stringify(c0));

      // 중간에 실패하면 쓴 것을 모두 되돌린다 (주민번호 쓰기를 일부러 실패시켜 본다)
      var origUpsert = rrnUpsertUnlocked_;
      rrnUpsertUnlocked_ = function () { throw new Error('시험용 실패'); };
      var failMsg = '';
      try { commitApplications({ rows: upRows, programId: 'w', rrns: upRrns }); } catch (e1) { failMsg = String(e1.message); } finally { rrnUpsertUnlocked_ = origUpsert; }
      check('업로드 중간 실패: 오류가 알려진다', failMsg.indexOf('되돌렸어요') >= 0, failMsg);
      check('업로드 중간 실패: 사람·참여 기록·업로드 기록이 하나도 남지 않는다', JSON.stringify(cnt()) === JSON.stringify(c0), JSON.stringify(cnt()));
      check('업로드 중간 실패: 채운 칸과 회차 메모도 원래대로', readTab_('People').filter(function (p) { return p.person_id === 'p_b'; })[0].job === '' && sess93().note === '');
      check('업로드 중간 실패: 주민번호가 남지 않는다', rrnReadMeta_().length === 0);

      var done = commitApplications({ rows: upRows, programId: 'w', rrns: upRrns });
      var c1 = cnt();
      check('업로드 등록: 사람 3(다·라·바)·참여 기록 4·업로드 기록 1이 늘어난다', c1.p === c0.p + 3 && c1.e === c0.e + 4 && c1.u === c0.u + 1, JSON.stringify(c1));
      check('업로드 등록: 이미 있는 사람(시험나)은 새로 만들지 않고 연결, 빈 칸(직업·초상권)을 채운다', personNamed('시험나').person_id === 'p_b' && readTab_('People').filter(function (p) { return p.person_id === 'p_b'; })[0].job === '시험직업2' && readTab_('People').filter(function (p) { return p.person_id === 'p_b'; })[0].consent_portrait === 'Y');
      check('업로드 등록: 취소 사유가 있는 행은 취소 상태로 등록', !!enrOf('시험바') && enrOf('시험바').cancel_reason === '시험 취소' && enrOf('시험바').cancelled_at === today);
      check('업로드 등록: 불합격·회차 미정 행은 저장하지 않는다', !personNamed('시험마') && !personNamed('시험사'));
      check('업로드 등록: 회차 메모에 테마가 붙는다', sess93().note.indexOf('테마: 시험테마') >= 0, sess93().note);
      check('업로드 등록: 번호는 정상 2건만 저장, 자릿수 오류 1건은 저장 안 됨, 취소 행은 대상이 아님',
        done.rrn.counts.saved === 2 && done.rrn.counts.invalid === 1 && rrnReadMeta_().length === 2 && done.rrn.counts.skipped_ineligible === 1, JSON.stringify(done.rrn.counts));
      check('업로드 등록: 번호가 하이픈 형태로 임시 파일에 저장된다', rrnVal(enrOf('시험다').enroll_id) === '900101-2234567');
      check('업로드 등록: 응답에 주민번호 값이 없다', JSON.stringify(done).search(/\d{6}-?[1-8]\d{6}/) < 0);
      var bs2 = getBootstrap();
      check('업로드 등록: 상태는 ok(정상)·missing(오류로 저장 안 됨)', bs2.rrnStatus[enrOf('시험다').enroll_id] === 'ok' && bs2.rrnStatus[enrOf('시험라').enroll_id] === 'missing');
      var mrow = readTab_('Uploads').filter(function (u) { return u.upload_id === done.upload_id; })[0];
      check('업로드 기록(manifest)에 이름·연락처·직업·번호가 없다', !!mrow && String(mrow.manifest).search(/시험[가나다라마바사]|0100000|900101|시험직업/) < 0);
      var upAudit = JSON.stringify(readTab_('AuditLog').filter(function (a) { return a.action === 'application_upload'; }));
      check('감사 기록: application_upload 가 남고 이름·번호가 없다', upAudit.indexOf('application_upload') >= 0 && upAudit.search(/시험[가나다라마바사]|0100000|900101/) < 0);
      check('업로드 뒤 개인정보 점검 0개', scanForRrn().total === 0);
      var again = previewApplications({ rows: upRows, programId: 'w' }).summary;
      check('같은 파일을 다시 올리면 신규 0, 이미 등록됨 4 (중복 등록 없음)', again.new === 0 && again.cancelled_new === 0 && again.existing === 4, JSON.stringify(again));
      check('업로드 목록에 보인다', listUploads().items.some(function (u) { return u.upload_id === done.upload_id && !u.undone_at; }));

      // 주민번호 고치기(F16): 오류로 저장되지 않은 시험라의 번호를 앱에서 입력한다
      check('주민번호 고치기: setRrn 으로 입력하면 저장된다', setRrn(enrOf('시험라').enroll_id, '910101-1234567').status === 'ok' && rrnReadMeta_().length === 3);

      // 되돌리기: 그 뒤에 사람이 고친 칸(시험나 직업)은 건드리지 않는다
      updatePerson('p_b', { job: '나중에 고친 직업' });
      var pu = previewUndoUpload(done.upload_id);
      check('되돌리기 미리보기: 참여 기록 4·사람 3·주민번호 3, 고친 칸은 건드리지 않음', pu.counts.enrollments === 4 && pu.counts.people === 3 && pu.counts.rrn === 3 && pu.counts.skippedCells >= 1, JSON.stringify(pu.counts));
      check('되돌리기 미리보기: 저장하지 않는다', JSON.stringify(cnt()) === JSON.stringify(c1));
      undoUpload(done.upload_id);
      var c2 = cnt();
      check('되돌리기: 만든 사람·참여 기록이 모두 사라진다', c2.p === c0.p && c2.e === c0.e, JSON.stringify(c2));
      check('되돌리기: 주민번호가 모두 지워진다', rrnReadMeta_().length === 0);
      var pa = readTab_('People').filter(function (p) { return p.person_id === 'p_b'; })[0];
      check('되돌리기: 채운 칸은 원래대로(초상권 빈칸), 나중에 고친 칸(직업)은 그대로', pa.consent_portrait === '' && pa.job === '나중에 고친 직업');
      check('되돌리기: 회차 메모가 원래대로', sess93().note === '');
      check('되돌리기: 업로드 기록에 되돌림 표시, 목록에서도 보인다', listUploads().items.some(function (u) { return u.upload_id === done.upload_id && !!u.undone_at; }));
      expectError('되돌리기: 이미 되돌린 업로드는 다시 되돌릴 수 없다', 'INVALID', function () { undoUpload(done.upload_id); });
      expectError('되돌리기: 없는 업로드는 NOT_FOUND', 'NOT_FOUND', function () { undoUpload('u_none'); });
      check('되돌리기 뒤 개인정보 점검 0개 / 감사 기록 application_undo', scanForRrn().total === 0 && readTab_('AuditLog').some(function (a) { return a.action === 'application_undo'; }));
      withLock_(function () { deleteRowsByKeysUnlocked_('Sessions', ['w93']); });
    }

    // 기존 엑셀 이관 (가짜 데이터, 프로그램 g로 시험해서 실제 회차와 겹치지 않게 한다)
    withLock_(function () { setConfigUnlocked_('legacy_imported', ''); setConfigUnlocked_('legacy_import_manifest', ''); });
    var HEAD = ['', '신청자명', '주민번호', '연락처', '메일', '성별', '출생연도', '1차 안내메일', '자차', '고속', '시외', '참가비 이체', '최종 안내메일'];
    var RR = function (name, phone, o) {      // 주민번호 칸은 화면이 지운 것처럼 비워 둔다
      o = o || {};
      return ['', name, '', phone, name + '@example.com', '여', 1995, 'ㅇ', o.car || '', o.exp || '', '', o.pay === undefined ? 'ㅇ' : o.pay, o.m2 === false ? '' : 'ㅇ'];
    };
    var fake = [
      ['', '1회차 | 10/6(화)-8(목)'], HEAD,
      RR('가나다', '010-1111-0001', { car: 'ㅇ' }), RR('나다라', '010-1111-0002', { pay: '', m2: false }),
      RR('다라마', '010-1111-0003', { pay: 'ㅇ 25000원 환불' }), RR('라마바', '010-1111-0004', { pay: 'ㅇ 50000원 환불' }),
      ['', '2회차 | 10/12(월)-14(수)'], HEAD, RR('가나다', '01011110001'), RR('바사아', '010-1111-0006')
    ];
    var payload = { rows: fake, opts: { program_id: 'g', year: 2026, fee: 50000, cap: 7 } };
    var base = { s: readTab_('Sessions').length, p: readTab_('People').length, e: readTab_('Enrollments').length };

    var pv = previewLegacyImport(payload);
    check('이관 미리보기: 오류 없음, 회차 2·사람 5·참여 6', pv.ok && pv.counts.sessions === 2 && pv.counts.people === 5 && pv.counts.enrollments === 6, JSON.stringify(pv.counts));
    check('이관 미리보기: 저장하지 않는다', readTab_('Sessions').length === base.s && readTab_('Enrollments').length === base.e);
    check('이관 미리보기: 이름·연락처를 돌려주지 않는다', !/가나다|나다라|다라마|라마바|바사아|010-1111/.test(JSON.stringify(pv)));
    expectError('이관: 주민번호 열이 지워지지 않은 채 오면 서버가 거부', 'INVALID', function () {
      var bad = JSON.parse(JSON.stringify(payload)); bad.rows[2][2] = '900101-1234567'; commitLegacyImport(bad);
    });
    expectError('이관: 다른 칸에 주민번호 모양이 섞여 와도 거부', 'INVALID', function () {
      var bad = JSON.parse(JSON.stringify(payload)); bad.rows[2][4] = '9001011234567'; previewLegacyImport(bad);
    });

    var cm = commitLegacyImport(payload);
    check('이관 실행: 회차 2·사람 5·참여 6이 저장된다',
      readTab_('Sessions').length === base.s + 2 && readTab_('People').length === base.p + 5 && readTab_('Enrollments').length === base.e + 6,
      readTab_('Sessions').length + '/' + readTab_('People').length + '/' + readTab_('Enrollments').length);
    check('이관 실행: 백업 파일이 만들어진다', !!(cm.backup && cm.backup.id));
    if (cm.backup && cm.backup.id) DriveApp.getFileById(cm.backup.id).setTrashed(true);
    check('이관 실행: 완료 표시와 되돌리기 기록이 Config에 남는다', readConfig_().legacy_imported === 'Y' && !!readConfig_().legacy_import_manifest);
    expectError('이관: 이미 이관했으면 거부', 'INVALID', function () { commitLegacyImport(payload); });

    var impEnr = readTab_('Enrollments').filter(function (e) { return e.session_id === 'g1' || e.session_id === 'g2'; });
    var cancelled = impEnr.filter(function (e) { return e.cancel_reason; });
    check('이관 규칙: 취소 2건(입금 없음, 전액 환불)', cancelled.length === 2 && cancelled.map(function (e) { return e.cancel_reason; }).sort().join('|') === '입금 미확인(이관 시 취소 처리)|전액 환불(이관)',
      cancelled.map(function (e) { return e.cancel_reason; }).join('|'));
    var partial = impEnr.filter(function (e) { return e.refund_amount === 25000; })[0];
    check('이관 규칙: 25,000원 환불은 참석·보험 완료·취소 아님', !!partial && partial.attend === '참석' && !partial.cancel_reason && partial.ins_at === today);
    check('이관 규칙: 취소가 아닌 사람 입금액은 50,000원', impEnr.filter(function (e) { return !e.cancel_reason; }).every(function (e) { return e.pay_amount === 50000; }));
    var impPeople = readTab_('People').filter(function (p) { return /^(가나다|나다라|다라마|라마바|바사아)$/.test(p.name); });
    check('이관 규칙: 같은 사람은 한 명으로 합쳐진다(가나다는 2개 회차)',
      impPeople.length === 5 && impEnr.filter(function (e) { return e.person_id === impPeople.filter(function (p) { return p.name === '가나다'; })[0].person_id; }).length === 2);
    check('이관 규칙: 동의 항목은 미확인(빈칸)', impPeople.every(function (p) { return p.consent_retain === '' && p.consent_portrait === ''; }));
    var firstActive = impEnr.filter(function (e) { return !e.cancel_reason; })[0];
    check('이관한 기록도 일반 API로 수정된다(setStep)', setStep(firstActive.enroll_id, 'attend', '참석').attend === '참석');

    // 이관 뒤에 새로 생긴 기록이 있으면 되돌리지 못한다
    withLock_(function () { appendObjects_(openDb_(), SCHEMA, 'Enrollments', [{ enroll_id: 'e_extra', session_id: 'g1', person_id: 'p_a', pass: '합격', updated_at: old, updated_by: 'seed' }]); });
    expectError('이관 되돌리기: 이관 뒤 추가된 참여 기록이 있으면 거부', 'INVALID', function () { undoLegacyImport(); });
    withLock_(function () { deleteRowsByKeysUnlocked_('Enrollments', ['e_extra']); });
    var undone = undoLegacyImport();
    check('이관 되돌리기: 이관분만 지운다(회차 2·사람 5·참여 6)', undone.sessions === 2 && undone.people === 5 && undone.enrollments === 6, JSON.stringify(undone));
    check('이관 되돌리기: 이관 전 상태로 돌아간다', readTab_('Sessions').length === base.s && readTab_('People').length === base.p && readTab_('Enrollments').length === base.e);
    check('이관 되돌리기: 완료 표시가 해제된다', readConfig_().legacy_imported !== 'Y');
    expectError('이관 되돌리기: 이미 되돌렸으면 거부', 'INVALID', function () { undoLegacyImport(); });

    // 운영진 관리 (시트 쪽만 시험한다. 드라이브 공유는 시험용 계정으로 직접 확인한다)
    var me = currentEmail_();
    var s0 = readTab_('Staff').length;
    withLock_(function () { staffAddRow_('selftest.member@example.com', '시험 운영진', me); });
    check('운영진 추가: Staff 탭에 활성 member로 등록된다',
      readTab_('Staff').some(function (r) { return r.email === 'selftest.member@example.com' && r.active === 'Y' && r.role === 'member'; }) && readTab_('Staff').length === s0 + 1);
    check('운영진 확인: 추가한 사람은 운영진으로 인식된다', !!findActiveStaff(readTab_('Staff'), 'SelfTest.Member@Example.com '));
    expectError('운영진 추가: 이미 있는 사람은 중복', 'DUPLICATE', function () { withLock_(function () { staffAddRow_('selftest.member@example.com', '또', me); }); });
    expectError('운영진 삭제: 소유자(본인)는 삭제 불가', 'INVALID', function () { withLock_(function () { staffRemoveRow_(me, me); }); });
    expectError('운영진 삭제: 목록에 없는 사람은 거부', 'INVALID', function () { withLock_(function () { staffRemoveRow_('nobody@example.com', me); }); });
    withLock_(function () { staffRemoveRow_('selftest.member@example.com', me); });
    check('운영진 삭제: 비활성이 되어 접속이 막힌다(행은 남음)', !findActiveStaff(readTab_('Staff'), 'selftest.member@example.com') && readTab_('Staff').length === s0 + 1);
    var re = withLock_(function () { return staffAddRow_('selftest.member@example.com', '시험 운영진(복귀)', me); });
    check('운영진 다시 추가: 새 행을 만들지 않고 다시 활성이 된다', re.reactivated === true && readTab_('Staff').length === s0 + 1 && !!findActiveStaff(readTab_('Staff'), 'selftest.member@example.com'));
    check('운영진 관리: 공유 대상에 운영 DB·주민번호 파일이 있다 (백업 폴더는 없다)',
      sharingTargets_().map(function (t) { return t.key; }).slice(0, 2).join(',') === 'db,rrn' && sharingTargets_().every(function (t) { return t.key !== 'backup'; }));

    // 감사 기록
    var audits = readTab_('AuditLog');
    var detailText = JSON.stringify(audits);
    check('감사 기록이 남는다', audits.length >= 10, String(audits.length));
    check('감사 기록에 개인정보 값(이름, 연락처, 메모)이 없다', !/시험가|시험나|010-0000|알레르기|디자이너|가나다|나다라|다라마|라마바|바사아|010-1111/.test(detailText));
    check('감사 기록에 주민번호 값이 없고, 입력은 rrn_set 으로 남는다', !/950101|960101|900101|9501012/.test(detailText) && /rrn_set/.test(detailText));
    check('감사 기록에 이관 실행·되돌리기가 남는다', /legacy_import/.test(detailText) && /legacy_undo/.test(detailText));

    // 백업 (복사본의 AuditLog에만 기록됨)
    var bk = backupNow();
    check('backupNow: 백업 폴더에 복사본이 만들어진다', !!bk.id);
    DriveApp.getFileById(bk.id).setTrashed(true);
  } catch (e) {
    check('시험 도중 예상하지 못한 오류', false, String(e && e.message ? e.message : e));
  } finally {
    DB_CACHE_ = null;
    RRN_CACHE_ = null;
    copy.setTrashed(true);
    if (tmpRrnId) { try { DriveApp.getFileById(tmpRrnId).setTrashed(true); } catch (e2) { /* 이미 지워졌으면 넘어간다 */ } }
  }

  // 시험이 실제 주민번호 파일을 건드리지 않았는지 확인 (R7)
  try {
    var realRrnAfter = SpreadsheetApp.openById(propOrThrow_('RRN_ID')).getSheetByName('RRN').getLastRow();
    check('실제 주민번호 파일은 건드리지 않았다 (행 수 그대로)', realRrnBefore >= 0 && realRrnAfter === realRrnBefore, realRrnBefore + ' → ' + realRrnAfter);
  } catch (e3) {
    check('실제 주민번호 파일은 건드리지 않았다 (행 수 그대로)', false, String(e3 && e3.message ? e3.message : e3));
  }

  lines.push('');
  lines.push(failed === 0 ? '모두 통과 (' + lines.filter(function (l) { return l.indexOf('통과:') === 0; }).length + '개). 임시 복사본은 휴지통으로 보냈어요.'
                          : '실패 ' + failed + '개. 위 "실패" 줄을 확인하세요.');
  Logger.log(lines.join('\n'));
  return { failed: failed, lines: lines };
}
