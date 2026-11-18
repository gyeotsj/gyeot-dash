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
  var check = function (name, cond, extra) {
    lines.push((cond ? '통과: ' : '실패: ') + name + (cond || !extra ? '' : '  → ' + extra));
    if (!cond) failed++;
  };
  var expectError = function (name, code, fn) {
    try { fn(); check(name, false, '오류가 나야 하는데 통과함'); }
    catch (e) { check(name, String(e.message).indexOf('[' + code + ']') === 0, e.message); }
  };

  try {
    DB_CACHE_ = SpreadsheetApp.openById(copy.getId());   // 이후 모든 읽기·쓰기는 복사본으로 간다
    var db = openDb_();
    var today = todayKst();
    var old = '2026-01-01 00:00:00';

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
    check('getBootstrap: 회차 2, 사람 2, 참여 기록 3', boot.sessions.length === 2 && boot.people.length === 2 && boot.enrollments.length === 3,
      boot.sessions.length + '/' + boot.people.length + '/' + boot.enrollments.length);
    check('getBootstrap: 소유자는 운영진 목록을 받는다', Array.isArray(boot.staff) && boot.me.role === 'owner');
    check('getBootstrap: 주민번호 관련 열이 없다', JSON.stringify(boot).search(/rrn|주민/i) < 0);

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

    // 감사 기록
    var audits = readTab_('AuditLog');
    var detailText = JSON.stringify(audits);
    check('감사 기록이 남는다', audits.length >= 10, String(audits.length));
    check('감사 기록에 개인정보 값(이름, 연락처, 메모)이 없다', !/시험가|시험나|010-0000|알레르기|디자이너/.test(detailText));

    // 백업 (복사본의 AuditLog에만 기록됨)
    var bk = backupNow();
    check('backupNow: 백업 폴더에 복사본이 만들어진다', !!bk.id);
    DriveApp.getFileById(bk.id).setTrashed(true);
  } catch (e) {
    check('시험 도중 예상하지 못한 오류', false, String(e && e.message ? e.message : e));
  } finally {
    DB_CACHE_ = null;
    copy.setTrashed(true);
  }

  lines.push('');
  lines.push(failed === 0 ? '모두 통과 (' + lines.filter(function (l) { return l.indexOf('통과:') === 0; }).length + '개). 임시 복사본은 휴지통으로 보냈어요.'
                          : '실패 ' + failed + '개. 위 "실패" 줄을 확인하세요.');
  Logger.log(lines.join('\n'));
  return { failed: failed, lines: lines };
}
