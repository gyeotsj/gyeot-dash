/**
 * Schema.gs, Lib.gs의 순수 계산 함수 테스트.
 * 실행: node app/tests/run.js  (프로젝트 폴더 c:\gyeot 에서)
 * 구글 서비스를 쓰지 않으므로 인터넷이나 로그인 없이 돌아간다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const appDir = path.join(__dirname, '..');
const src = ['Schema.gs', 'Lib.gs'].map(f => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n');
const ctx = vm.createContext({ console });
vm.runInContext(src, ctx);
const get = expr => vm.runInContext(expr, ctx);

const L = get(`({
  normalizeEmail, findActiveStaff, digitsOnly, looksLikeRrn, containsRrn, escapeHtml,
  rowsToObjects, objectToRow, validateHeader, schemaProblems, formatKst, makeId,
  todayKst, isValidDate, normalizePhone, validateValue, validatePatch, hasConflict, stepPatch,
  normalizeCancel, isDuplicatePerson, validateSession, plainRow, apiError, firstError, FIELD_LABELS,
  validateStaffInput, planStaffRemoval, isEmailIn,
  validateRrn, rrnMatchesProfile, rrnStatusFor, parseApplicationRound, parseApplicationDate, applicationConsent, parseApplicationSheet,
  mergeConsent, buildApplicationPlan, planRrnWrites, buildInsuranceRows, addMonths, rrnPurgeCandidates, validateTemplate, validateProgramForm,
  RRN_CODE_LABELS, APP_HEADERS, APP_REQUIRED,
  parseSessionTitle, mapLegacyColumns, parseLegacySheet, legacyPhone, parseLegacyPay, legacyTransport, buildLegacyPlan, LEGACY_HEADERS, sanitizeLegacyRows,
  ENROLLMENT_EDITABLE, PERSON_EDITABLE, STEP_DEFS, SESSION_RULES,
  SCHEMA, RRN_SCHEMA, STAGES, PROGRAM_IDS, SEED_PROGRAMS, SEED_CONFIG, SEED_TEMPLATES, OWNER_EMAIL
})`);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); }
}

console.log('이메일');
test('대소문자와 공백을 무시한다', () => {
  assert.strictEqual(L.normalizeEmail('  Gyeot.SJ@Gmail.com '), 'gyeot.sj@gmail.com');
});
test('비어 있거나 null이면 빈 글자', () => {
  assert.strictEqual(L.normalizeEmail(null), '');
  assert.strictEqual(L.normalizeEmail(undefined), '');
});

console.log('운영진 확인');
const staff = [
  { email: 'Owner@Example.com', role: 'owner', active: 'Y' },
  { email: 'a@example.com', role: 'member', active: 'Y' },
  { email: 'gone@example.com', role: 'member', active: 'N' }
];
test('활성 운영진은 대소문자와 상관없이 찾는다', () => {
  assert.strictEqual(L.findActiveStaff(staff, ' OWNER@example.com ').role, 'owner');
});
test('비활성 운영진은 거부한다', () => {
  assert.strictEqual(L.findActiveStaff(staff, 'gone@example.com'), null);
});
test('목록에 없는 사람과 빈 이메일은 거부한다', () => {
  assert.strictEqual(L.findActiveStaff(staff, 'x@example.com'), null);
  assert.strictEqual(L.findActiveStaff(staff, ''), null);
});

console.log('전화번호');
test('숫자만 남긴다', () => {
  assert.strictEqual(L.digitsOnly('010-1234-5678'), '01012345678');
  assert.strictEqual(L.digitsOnly(' 010 1234 5678 '), '01012345678');
});

console.log('주민번호 모양 검사');
['900101-1234567', '900101 - 2345678', '9001011234567', '주민번호는 900101-1234567 입니다', '000101-4123456'].forEach(s =>
  test('걸러야 함: ' + s, () => assert.strictEqual(L.looksLikeRrn(s), true)));
['010-1234-5678', '01012345678', '2026-10-09', '2026-10-09 15:30:00', '010-1234-5678 / 02-123-4567', '일해보기 3회차', '', null].forEach(s =>
  test('통과해야 함: ' + s, () => assert.strictEqual(L.looksLikeRrn(s), false)));
test('객체·배열 안쪽까지 검사한다', () => {
  assert.strictEqual(L.containsRrn({ name: '홍길동', memo: { note: ['x', '900101-1234567'] } }), true);
  assert.strictEqual(L.containsRrn({ name: '홍길동', phone: '010-1234-5678', memo: '잘 부탁드려요' }), false);
});

console.log('시트 변환');
const cols = ['a', 'b', 'c'];
test('빈 행은 건너뛰고 객체로 바꾼다', () => {
  const out = L.rowsToObjects(cols, [[1, 'x', ''], ['', '', ''], [2, '', 'z']]);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out[1])), { a: 2, b: '', c: 'z' });
});
test('객체를 열 순서대로 행으로 바꾼다', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.objectToRow(cols, { c: 3, a: 1 }))), [1, '', 3]);
});
test('헤더가 같으면 통과', () => {
  assert.strictEqual(L.validateHeader(cols, ['a', 'b', 'c']).ok, true);
  assert.strictEqual(L.validateHeader(cols, ['a', 'b', 'c', '', '']).ok, true);
});
test('헤더에서 빠진 열과 남는 열을 알려 준다', () => {
  const r = L.validateHeader(cols, ['a', 'c', 'zzz']);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.missing)), ['b']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.extra)), ['zzz']);
});
test('열 순서가 바뀌면 통과하지 않는다', () => {
  assert.strictEqual(L.validateHeader(cols, ['b', 'a', 'c']).ok, false);
});

console.log('열 정의(Schema)');
test('운영 DB 탭 11개가 모두 있다', () => {
  const expected = ['Programs', 'Sessions', 'People', 'Enrollments', 'SatMatches', 'Staff',
    'MessageLog', 'Templates', 'AuditLog', 'Config', 'Stats'];
  assert.deepStrictEqual(Object.keys(L.SCHEMA).sort(), expected.slice().sort());
});
test('열 정의에 오류가 없다 (중복 열, 없는 키 열)', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.schemaProblems(L.SCHEMA))), []);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.schemaProblems(L.RRN_SCHEMA))), []);
});
test('주민번호 열은 운영 DB 어디에도 없다', () => {
  Object.keys(L.SCHEMA).forEach(tab => {
    L.SCHEMA[tab].cols.forEach(c => assert.ok(!/rrn|주민/i.test(c), tab + '.' + c));
  });
});
test('주민번호 파일은 RRN 탭 하나이고 이름·연락처 열이 없다', () => {
  assert.deepStrictEqual(Object.keys(L.RRN_SCHEMA), ['RRN']);
  const c = L.RRN_SCHEMA.RRN.cols;
  assert.ok(!c.includes('name') && !c.includes('phone'));
});
test('전화번호 열은 텍스트 서식이다', () => {
  assert.ok(L.SCHEMA.People.text.includes('phone'));
});
test('Enrollments에 PRD의 모든 단계 열이 있다', () => {
  ['pass', 'transport', 'm1_at', 'pay_at', 'ins_at', 'm2_at', 'attend', 'cancel_reason', 'refund_amount']
    .forEach(c => assert.ok(L.SCHEMA.Enrollments.cols.includes(c), c));
});

console.log('초기 데이터');
test('프로그램 3개(w, l, g)', () => {
  assert.deepStrictEqual(Array.from(L.SEED_PROGRAMS, p => p.program_id), ['w', 'l', 'g']);
});
test('기본 문구 4개는 올바른 단계·프로그램·방식을 쓴다', () => {
  assert.strictEqual(L.SEED_TEMPLATES.length, 4);
  L.SEED_TEMPLATES.forEach(t => {
    assert.ok(L.STAGES.includes(t.stage), t.tpl_id + ' stage');
    assert.ok(t.program_id === 'all' || L.PROGRAM_IDS.includes(t.program_id), t.tpl_id + ' program');
    assert.ok(['sms', 'mail'].includes(t.channel), t.tpl_id + ' channel');
    assert.ok(t.body.length > 10, t.tpl_id + ' body');
    Object.keys(t).forEach(k => assert.ok(L.SCHEMA.Templates.cols.includes(k), t.tpl_id + ' 열 ' + k));
  });
});
test('기본 문구에는 개인정보나 주민번호 모양이 없다', () => {
  assert.strictEqual(L.containsRrn(JSON.parse(JSON.stringify(L.SEED_TEMPLATES))), false);
});
test('기본 설정값: 환불 3일, 보관 3년, 주민번호 3개월', () => {
  assert.strictEqual(L.SEED_CONFIG.refund_days, '3');
  assert.strictEqual(L.SEED_CONFIG.retention_years, '3');
  assert.strictEqual(L.SEED_CONFIG.rrn_sweep_months, '3');
});
test('소유자 이메일이 설정돼 있다', () => {
  assert.strictEqual(L.normalizeEmail(L.OWNER_EMAIL), 'gyeot.sj@gmail.com');
});

console.log('화면 문자열');
test('HTML 특수문자를 무력화한다', () => {
  assert.strictEqual(L.escapeHtml('<script>alert("x")</script> & \''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;');
  assert.strictEqual(L.escapeHtml(null), '');
});

console.log('시간·ID');
test('한국 시간으로 표시한다 (UTC+9)', () => {
  assert.strictEqual(L.formatKst(new Date(Date.UTC(2026, 9, 9, 15, 30, 0))), '2026-10-10 00:30:00');
  assert.strictEqual(L.formatKst(new Date(Date.UTC(2026, 0, 1, 0, 0, 5))), '2026-01-01 09:00:05');
});
test('ID는 접두어로 시작하고 매번 다르다', () => {
  const a = L.makeId('e_'), b = L.makeId('e_');
  assert.ok(a.startsWith('e_') && a !== b);
});

/* ===================== 1단계: 쓰기 검증 ===================== */
const J = x => JSON.parse(JSON.stringify(x));

console.log('날짜·전화번호');
test('실제 있는 날짜만 통과', () => {
  ['2026-10-09', '2024-02-29'].forEach(s => assert.strictEqual(L.isValidDate(s), true, s));
  ['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-9', '20261009', '', null, '2026-10-09 10:00'].forEach(s => assert.strictEqual(L.isValidDate(s), false, String(s)));
});
test('전화번호를 010-1234-5678 형태로 정리', () => {
  assert.strictEqual(L.normalizePhone('01012345678'), '010-1234-5678');
  assert.strictEqual(L.normalizePhone(' 010 1234 5678 '), '010-1234-5678');
  assert.strictEqual(L.normalizePhone('0212345678'), '02-1234-5678');
  assert.strictEqual(L.normalizePhone('0311234567'), '031-123-4567');
});
test('자릿수가 맞지 않으면 null', () => {
  assert.strictEqual(L.normalizePhone('1234'), null);
  assert.strictEqual(L.normalizePhone('010123456789012'), null);
  assert.strictEqual(L.normalizePhone(''), null);
});
test('오늘 날짜는 한국 시간 기준', () => {
  assert.strictEqual(L.todayKst(new Date(Date.UTC(2026, 10, 18, 15, 30, 0))), '2026-11-19');
});

console.log('값 검사');
test('이동수단은 정해진 값만', () => {
  ['', '자차', '고속터미널', '시외터미널'].forEach(v => assert.strictEqual(L.validateValue(L.ENROLLMENT_EDITABLE.transport, v).ok, true, v));
  assert.strictEqual(L.validateValue(L.ENROLLMENT_EDITABLE.transport, '기차').ok, false);
});
test('숫자: 빈칸 허용, 음수·글자 거부, 정수로 변환', () => {
  const r = L.ENROLLMENT_EDITABLE.pay_amount;
  assert.strictEqual(L.validateValue(r, '').value, '');
  assert.strictEqual(L.validateValue(r, '50000').value, 50000);
  assert.strictEqual(L.validateValue(r, 25000).value, 25000);
  ['-1', '5만원', '1.5', '99999999999'].forEach(v => assert.strictEqual(L.validateValue(r, v).ok, false, v));
});
test('이름은 필수이고 앞뒤 공백을 지운다', () => {
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.name, '  홍길동 ').value, '홍길동');
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.name, '   ').ok, false);
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.name, 'ㄱ'.repeat(41)).ok, false);
});
test('이메일: 빈칸 허용, 형식 검사', () => {
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.email, '').ok, true);
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.email, 'a@b.co').ok, true);
  assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.email, 'a@b').ok, false);
});
test('동의 값은 Y / N / 빈칸(미확인)만', () => {
  ['', 'Y', 'N'].forEach(v => assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.consent_retain, v).ok, true));
  ['동의', 'y', 'yes'].forEach(v => assert.strictEqual(L.validateValue(L.PERSON_EDITABLE.consent_retain, v).ok, false, v));
});

console.log('수정 요청 검사 (화이트리스트)');
test('허용된 항목만 통과하고 값이 정리된다', () => {
  const r = L.validatePatch(L.PERSON_EDITABLE, { name: ' 홍길동 ', phone: '01012345678', job: '디자이너' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(J(r.clean), { name: '홍길동', phone: '010-1234-5678', job: '디자이너' });
});
test('허용되지 않은 열은 거부 (updated_by, person_id, 성별 등)', () => {
  ['updated_by', 'person_id', 'updated_at', 'gender', 'birth_year', 'created_at'].forEach(k => {
    const r = L.validatePatch(L.PERSON_EDITABLE, { [k]: 'x' });
    assert.strictEqual(r.ok, false, k);
    assert.ok(r.errors[k], k);
  });
  ['enroll_id', 'session_id', 'updated_by', 'pass', 'm1_at', 'attend'].forEach(k => {
    assert.strictEqual(L.validatePatch(L.ENROLLMENT_EDITABLE, { [k]: 'x' }).ok, false, k);
  });
});
test('빈 요청은 거부', () => {
  assert.strictEqual(L.validatePatch(L.PERSON_EDITABLE, {}).ok, false);
  assert.strictEqual(L.validatePatch(L.PERSON_EDITABLE, null).ok, false);
});
test('값 하나라도 틀리면 전체 거부 (일부만 저장하지 않음)', () => {
  const r = L.validatePatch(L.ENROLLMENT_EDITABLE, { transport: '자차', pay_amount: '많이' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.pay_amount && !r.errors.transport);
});
test('어느 칸이든 주민번호 모양이면 거부', () => {
  assert.strictEqual(L.validatePatch(L.ENROLLMENT_EDITABLE, { memo: '제 번호는 900101-1234567 입니다' }).ok, false);
  assert.strictEqual(L.validatePatch(L.ENROLLMENT_EDITABLE, { cancel_reason: '9001011234567' }).ok, false);
  assert.strictEqual(L.validatePatch(L.PERSON_EDITABLE, { job: '900101 - 2345678' }).ok, false);
  assert.strictEqual(L.validatePatch(L.ENROLLMENT_EDITABLE, { memo: '010-1234-5678로 연락 주세요' }).ok, true);
});
test('HTML이 들어 있어도 저장은 글자 그대로 한다 (이스케이프는 화면에서)', () => {
  const r = L.validatePatch(L.ENROLLMENT_EDITABLE, { memo: '<img src=x onerror=alert(1)>' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.clean.memo, '<img src=x onerror=alert(1)>');
});

console.log('단계 체크');
test('날짜 단계: 켜면 오늘, 끄면 빈칸', () => {
  assert.deepStrictEqual(J(L.stepPatch('pay', true, '2026-11-18')), { pay_at: '2026-11-18' });
  assert.deepStrictEqual(J(L.stepPatch('ins', false, '2026-11-18')), { ins_at: '' });
  assert.deepStrictEqual(J(L.stepPatch('m1', 'true', '2026-11-18')), { m1_at: '2026-11-18' });
});
test('참석: 참석 / 불참 / 빈칸만', () => {
  assert.deepStrictEqual(J(L.stepPatch('attend', true, 'x')), { attend: '참석' });
  assert.deepStrictEqual(J(L.stepPatch('attend', '불참', 'x')), { attend: '불참' });
  assert.deepStrictEqual(J(L.stepPatch('attend', '', 'x')), { attend: '' });
  assert.deepStrictEqual(J(L.stepPatch('attend', false, 'x')), { attend: '' });
  assert.throws(() => L.stepPatch('attend', '노쇼', 'x'));
});
test('알 수 없는 단계는 오류', () => {
  assert.throws(() => L.stepPatch('pass', true, 'x'));
  assert.throws(() => L.stepPatch('updated_by', true, 'x'));
});

console.log('취소 처리');
test('사유가 있으면 취소일을 오늘로, 이미 있으면 유지', () => {
  assert.strictEqual(L.normalizeCancel({ cancel_reason: '개인 사정' }, { cancelled_at: '' }, '2026-11-18').cancelled_at, '2026-11-18');
  assert.strictEqual(L.normalizeCancel({ cancel_reason: '변경' }, { cancelled_at: '2026-10-01' }, '2026-11-18').cancelled_at, '2026-10-01');
});
test('사유를 비우면(취소 해제) 취소일도 비운다', () => {
  assert.strictEqual(L.normalizeCancel({ cancel_reason: '' }, { cancelled_at: '2026-10-01' }, '2026-11-18').cancelled_at, '');
});
test('취소와 관계없는 수정은 취소일을 건드리지 않는다', () => {
  const r = L.normalizeCancel({ transport: '자차' }, { cancelled_at: '2026-10-01' }, '2026-11-18');
  assert.ok(!('cancelled_at' in r));
});

console.log('동시 수정·중복');
test('수정 시각이 다르면 충돌', () => {
  assert.strictEqual(L.hasConflict('2026-11-18 10:00:00', '2026-11-18 10:00:00'), false);
  assert.strictEqual(L.hasConflict('2026-11-18 10:05:00', '2026-11-18 10:00:00'), true);
  assert.strictEqual(L.hasConflict('2026-11-18 10:05:00', undefined), false);
  assert.strictEqual(L.hasConflict('', ''), false);
});
test('같은 이름+전화번호를 가진 다른 사람이 있으면 중복', () => {
  const people = [{ person_id: 'p1', name: '홍길동', phone: '010-1234-5678' }, { person_id: 'p2', name: '김하늘', phone: '010-1111-2222' }];
  assert.strictEqual(L.isDuplicatePerson(people, 'p2', '홍길동', '01012345678'), true);
  assert.strictEqual(L.isDuplicatePerson(people, 'p1', '홍길동', '010-1234-5678'), false);
  assert.strictEqual(L.isDuplicatePerson(people, 'p2', '홍길동', '010-9999-9999'), false);
});

console.log('회차 입력');
test('새 회차: 규칙에 맞으면 session_id가 만들어진다', () => {
  const r = L.validateSession({ program_id: 'w', n: '6', start: '2026-12-07', end: '2026-12-09', fee: '50000', cap: '7', note: '' }, null);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.clean.session_id, 'w6');
  assert.strictEqual(r.clean.fee, 50000);
  assert.strictEqual(r.clean.cap, 7);
});
test('종료일이 시작일보다 빠르면 거부', () => {
  const r = L.validateSession({ program_id: 'w', n: 1, start: '2026-12-09', end: '2026-12-07', fee: 0, cap: 7 }, null);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.end);
});
test('프로그램·번호·정원·참가비 오류를 알려 준다', () => {
  const r = L.validateSession({ program_id: 'x', n: 0, start: '2026-12-07', end: '2026-12-09', fee: '-1', cap: 0 }, null);
  assert.strictEqual(r.ok, false);
  ['program_id', 'n', 'fee', 'cap'].forEach(k => assert.ok(r.errors[k], k));
});
test('기존 회차 수정은 프로그램·번호를 바꾸지 않는다', () => {
  const r = L.validateSession({ program_id: 'l', n: 9, start: '2026-12-08', end: '2026-12-10', fee: 60000, cap: 8 }, { session_id: 'w2', start: '2026-12-07', end: '2026-12-09' });
  assert.strictEqual(r.ok, true);
  assert.ok(!('program_id' in r.clean) && !('n' in r.clean) && !('session_id' in r.clean));
});

console.log('API 보조');
test('구글이 바꾼 Date 값을 글자로 되돌린다', () => {
  // 날짜 객체는 코드가 실행되는 공간(vm) 안에서 만들어야 instanceof Date가 맞게 동작한다
  const o = get('plainRow({ a: new Date(Date.UTC(2026, 9, 9, 15, 0, 0)), b: 3, c: "글" })');
  assert.strictEqual(o.a, '2026-10-10 00:00:00');
  assert.strictEqual(o.b, 3);
});
test('오류 문구에 코드가 붙는다', () => {
  assert.strictEqual(L.apiError('CONFLICT', '먼저 수정됨').message, '[CONFLICT] 먼저 수정됨');
});
test('검증 오류 문구는 항목 이름을 붙여 보여 준다', () => {
  assert.strictEqual(L.firstError({ pay_amount: '숫자만 입력해 주세요' }), '입금액: 숫자만 입력해 주세요');
  assert.strictEqual(L.firstError({}), '입력을 확인해 주세요');
});
test('수정 가능한 모든 항목에 한글 이름이 있다', () => {
  [L.ENROLLMENT_EDITABLE, L.PERSON_EDITABLE, L.SESSION_RULES].forEach(rules => Object.keys(rules).forEach(k => assert.ok(L.FIELD_LABELS[k], k)));
});
test('수정 가능한 열은 모두 실제 열 정의에 있다', () => {
  Object.keys(L.ENROLLMENT_EDITABLE).forEach(k => assert.ok(L.SCHEMA.Enrollments.cols.includes(k), 'Enrollments.' + k));
  Object.keys(L.PERSON_EDITABLE).forEach(k => assert.ok(L.SCHEMA.People.cols.includes(k), 'People.' + k));
  Object.keys(L.STEP_DEFS).forEach(k => assert.ok(L.SCHEMA.Enrollments.cols.includes(L.STEP_DEFS[k].col), 'step ' + k));
  Object.keys(L.SESSION_RULES).forEach(k => assert.ok(L.SCHEMA.Sessions.cols.includes(k), 'Sessions.' + k));
});
test('수정 가능한 열에 updated_by·키·완료일이 없다', () => {
  ['enroll_id', 'person_id', 'session_id', 'updated_at', 'updated_by', 'm1_at', 'pay_at', 'ins_at', 'm2_at', 'attend', 'pass'].forEach(k => {
    assert.ok(!(k in L.ENROLLMENT_EDITABLE), k);
  });
  ['person_id', 'created_at', 'updated_at', 'gender', 'birth_year'].forEach(k => assert.ok(!(k in L.PERSON_EDITABLE), k));
});

/* ===================== 1단계: 기존 엑셀 이관 ===================== */
console.log('이관: 회차 제목·칸 해석');
test('회차 제목에서 번호와 날짜를 읽는다', () => {
  assert.deepStrictEqual(J(L.parseSessionTitle('1회차 | 10/6(화)-8(목)', 2026)), { n: 1, start: '2026-10-06', end: '2026-10-08' });
  assert.deepStrictEqual(J(L.parseSessionTitle('4회차 | 10/22(목)-24(토)', 2026)), { n: 4, start: '2026-10-22', end: '2026-10-24' });
});
test('달이 넘어가는 회차도 읽는다', () => {
  assert.deepStrictEqual(J(L.parseSessionTitle('7회차 | 10/30(금)-11/1(일)', 2026)), { n: 7, start: '2026-10-30', end: '2026-11-01' });
});
test('못 읽는 제목은 null', () => {
  ['일해보기', '3회차', '3회차 | 날짜 미정', '1회차 | 13/40(월)-41(화)', '', null].forEach(s => assert.strictEqual(L.parseSessionTitle(s, 2026), null, String(s)));
});
test('입금 칸 해석', () => {
  assert.deepStrictEqual(J(L.parseLegacyPay('')), { paid: false, refund: 0 });
  assert.deepStrictEqual(J(L.parseLegacyPay('ㅇ')), { paid: true, refund: 0 });
  assert.deepStrictEqual(J(L.parseLegacyPay('ㅇ 25000원 환불')), { paid: true, refund: 25000 });
  assert.deepStrictEqual(J(L.parseLegacyPay('ㅇ 50,000원 환불')), { paid: true, refund: 50000 });
  assert.deepStrictEqual(J(L.parseLegacyPay('ㅇ 환불 25000원')), { paid: true, refund: 25000 });
});
test('이동수단: 하나만 표시되면 변환, 없거나 둘 이상이면 빈칸', () => {
  assert.strictEqual(L.legacyTransport(true, false, false).value, '자차');
  assert.strictEqual(L.legacyTransport(false, true, false).value, '고속터미널');
  assert.strictEqual(L.legacyTransport(false, false, true).value, '시외터미널');
  assert.strictEqual(L.legacyTransport(false, false, false).value, '');
  assert.strictEqual(L.legacyTransport(true, true, false).value, '');
  assert.strictEqual(L.legacyTransport(true, true, false).count, 2);
});
test('엑셀이 앞자리 0을 지운 전화번호도 되살린다', () => {
  assert.strictEqual(L.legacyPhone('010-1234-5678'), '010-1234-5678');
  assert.strictEqual(L.legacyPhone(1012345678), '010-1234-5678');
  assert.strictEqual(L.legacyPhone('01012345678'), '010-1234-5678');
  assert.strictEqual(L.legacyPhone('abc'), null);
});

/* 실제 엑셀과 같은 모양의 가짜 시트 (A열은 비어 있고 B열부터 시작. 주민번호는 가짜 값) */
const HEAD = ['', '신청자명', '주민번호', '연락처', '메일', '성별', '출생연도', '1차 안내메일', '자차', '고속', '시외', '참가비 이체', '최종 안내메일'];
const FAKE_RRN = '900101-1234567';
const R = (name, phone, o = {}) => ['', name, FAKE_RRN, phone, o.mail || (name + '@example.com'), o.g || '여', o.b || 1995, o.m1 === false ? '' : 'ㅇ', o.car || '', o.exp || '', o.int || '', o.pay === undefined ? 'ㅇ' : o.pay, o.m2 === false ? '' : 'ㅇ'];
const fakeSheet = () => [
  ['', '', '', '', '', '', '', '', '메모'],                                  // 표 밖의 값
  ['', '1회차 | 10/6(화)-8(목)'],
  HEAD,
  R('가나다', '010-1111-0001', { car: 'ㅇ' }),                                // 참여, 자차
  R('나다라', '010-1111-0002', { pay: '', m2: false, exp: 'ㅇ' }),             // 입금 없음 → 취소
  R('다라마', '010-1111-0003', { pay: 'ㅇ 25000원 환불', int: 'ㅇ' }),         // 부분 환불 → 참석
  R('라마바', '010-1111-0004', { pay: 'ㅇ 50000원 환불', exp: 'ㅇ' }),         // 전액 환불 → 취소
  R('마바사(마바아)', '010-1111-0005', {}),                                    // 괄호 이름, 이동수단 없음
  ['', '', '', '', 'x@example.com', '', 1990],                                // 이름 없는 행
  ['', '2회차 | 10/12(월)-14(수)'],
  HEAD,
  R('가나다', '01011110001', { g: '남', car: 'ㅇ', exp: 'ㅇ' }),               // 1회차와 같은 사람, 이동수단 둘 이상
  R('바사아', '1011110006', { b: 2001 })                                      // 앞자리 0이 지워진 전화번호
];
const OPTS = { program_id: 'w', year: 2026, fee: 50000, cap: 7, today: '2026-11-18', now: '2026-11-18 12:00:00' };
let seq = 0;
const plan = () => { seq = 0; return L.buildLegacyPlan(L.parseLegacySheet(fakeSheet()), Object.assign({ makeId: p => p + (++seq) }, OPTS)); };

console.log('이관: 시트 읽기');
test('회차 2개와 행을 읽는다 (이름 없는 행 제외)', () => {
  const p = L.parseLegacySheet(fakeSheet());
  assert.strictEqual(p.sessions.length, 2);
  assert.strictEqual(p.sessions[0].rows.length, 5);
  assert.strictEqual(p.sessions[1].rows.length, 2);
});
test('표 밖의 값과 이름 없는 행은 경고만 하고 건너뛴다 (개인정보 없이 위치만)', () => {
  const p = L.parseLegacySheet(fakeSheet());
  assert.deepStrictEqual(Array.from(p.warnings, w => w.code).sort(), ['NO_NAME', 'STRAY']);
  assert.ok(p.warnings.every(w => /\d+행/.test(w.msg)));
});
test('★ 주민번호는 읽은 결과 어디에도 없다', () => {
  const s = JSON.stringify(L.parseLegacySheet(fakeSheet()));
  assert.ok(!s.includes('900101'), '가짜 주민번호가 결과에 있음');
  assert.ok(!/rrn|주민/i.test(s));
});
test('헤더에 열이 빠지면 그 회차는 읽지 않고 알려 준다', () => {
  const rows = [['', '1회차 | 10/6(화)-8(목)'], ['', '신청자명', '주민번호', '연락처'], ['', '가나다', FAKE_RRN, '010-1111-0001']];
  const p = L.parseLegacySheet(rows);
  assert.ok(p.sessions[0].missing.length > 0);
  assert.strictEqual(p.sessions[0].rows.length, 0);
  assert.strictEqual(L.buildLegacyPlan(p, OPTS).ok, false);
});

console.log('이관: 규칙 적용');
test('회차: 일해보기 2026, 참가비 50,000원, 정원 7명', () => {
  const pl = plan();
  assert.deepStrictEqual(Array.from(pl.sessions, s => s.session_id), ['w1', 'w2']);
  assert.deepStrictEqual(J(pl.sessions[0]), { session_id: 'w1', program_id: 'w', n: 1, start: '2026-10-06', end: '2026-10-08', fee: 50000, cap: 7, note: '기존 엑셀 이관' });
});
test('같은 사람(이름+전화번호)은 한 명으로 합치고 참여 기록만 늘린다', () => {
  const pl = plan();
  assert.strictEqual(pl.people.length, 6);          // 7행 중 1명 중복
  assert.strictEqual(pl.enrollments.length, 7);
  const pid = pl.people.find(p => p.name === '가나다').person_id;
  assert.strictEqual(pl.enrollments.filter(e => e.person_id === pid).length, 2);
});
test('입금 없는 사람은 취소 처리 (사유·취소일, 보험 없음)', () => {
  const e = plan().enrollments[1];
  assert.strictEqual(e.cancel_reason, '입금 미확인(이관 시 취소 처리)');
  assert.strictEqual(e.cancelled_at, '2026-11-18');
  assert.strictEqual(e.pay_at, '');
  assert.strictEqual(e.ins_at, '');
});
test('50,000원 환불은 취소 처리 (입금·환불액 기록)', () => {
  const e = plan().enrollments[3];
  assert.strictEqual(e.cancel_reason, '전액 환불(이관)');
  assert.strictEqual(e.pay_at, '2026-11-18');
  assert.strictEqual(e.pay_amount, 50000);
  assert.strictEqual(e.refund_amount, 50000);
  assert.strictEqual(e.ins_at, '');
});
test('25,000원 환불은 참석 후 부분 환불 (취소 아님, 참석, 보험 완료)', () => {
  const e = plan().enrollments[2];
  assert.strictEqual(e.cancel_reason, '');
  assert.strictEqual(e.attend, '참석');
  assert.strictEqual(e.refund_amount, 25000);
  assert.strictEqual(e.ins_at, '2026-11-18');
});
test('일반 참여자: 입금액 50,000원, 안내·보험 완료, 참석은 빈칸, 완료일은 이관일', () => {
  const e = plan().enrollments[0];
  assert.strictEqual(e.pay_amount, 50000);
  assert.deepStrictEqual([e.m1_at, e.pay_at, e.m2_at, e.ins_at], ['2026-11-18', '2026-11-18', '2026-11-18', '2026-11-18']);
  assert.strictEqual(e.attend, '');
  assert.strictEqual(e.pass, '합격');
  assert.strictEqual(e.transport, '자차');
  assert.strictEqual(e.updated_by, 'legacy-import');
});
test('이동수단: 표시 없으면 빈칸, 둘 이상이면 빈칸+경고', () => {
  const pl = plan();
  assert.strictEqual(pl.enrollments[4].transport, '');
  assert.strictEqual(pl.enrollments[5].transport, '');
  assert.ok(pl.warnings.some(w => w.includes('이동수단이 둘 이상')));
});
test('동의 항목은 미확인(빈칸), 직업·거주지도 빈칸', () => {
  const p = plan().people[0];
  assert.strictEqual(p.consent_retain, '');
  assert.strictEqual(p.consent_portrait, '');
  assert.strictEqual(p.job, '');
});
test('괄호가 있는 이름은 앞부분만 이름으로, 괄호 내용은 남긴 말에 보관하고 경고', () => {
  const pl = plan();
  assert.ok(pl.people.some(p => p.name === '마바사'));
  assert.ok(!pl.people.some(p => p.name.includes('(')));
  assert.ok(pl.enrollments[4].memo.includes('마바아'));
  assert.ok(pl.warnings.some(w => w.includes('괄호')));
});
test('앞자리 0이 지워진 전화번호를 되살린다', () => {
  assert.strictEqual(plan().people.find(p => p.name === '바사아').phone, '010-1111-0006');
});
test('요약: 취소를 뺀 참여 기준으로 센다', () => {
  const s = plan().summary[0];
  assert.deepStrictEqual(
    [s.total, s.cancelled, s.active, s.paid, s.m1, s.m2, s.ins, s.attend, s.refunded],
    [5, 2, 3, 3, 3, 3, 3, 1, 1]);
  assert.deepStrictEqual([s.car, s.exp, s.int, s.blankTransport], [1, 0, 1, 1]);
});
test('경고와 오류 문구에 이름·연락처가 들어가지 않는다', () => {
  const pl = plan();
  const text = JSON.stringify([pl.warnings, pl.errors]);
  ['가나다', '나다라', '다라마', '라마바', '마바사', '바사아', '010-1111'].forEach(s => assert.ok(!text.includes(s), s));
});
test('연락처를 못 읽으면 이관을 막는다', () => {
  const rows = fakeSheet(); rows[3][3] = '전화 없음';
  const pl = L.buildLegacyPlan(L.parseLegacySheet(rows), OPTS);
  assert.strictEqual(pl.ok, false);
  assert.ok(pl.errors.some(e => e.includes('연락처')));
});
test('입력에 주민번호 모양이 섞여 있으면 이관을 막는다', () => {
  const rows = fakeSheet(); rows[3][4] = '900101-1234567';   // 메일 칸에 실수로 들어간 경우
  const pl = L.buildLegacyPlan(L.parseLegacySheet(rows), OPTS);
  assert.strictEqual(pl.ok, false);
  assert.ok(pl.errors.some(e => e.includes('주민번호')));
});
test('같은 회차 번호가 두 번 나오면 막는다', () => {
  const rows = fakeSheet(); rows[8][1] = '1회차 | 10/12(월)-14(수)';
  assert.strictEqual(L.buildLegacyPlan(L.parseLegacySheet(rows), OPTS).ok, false);
});
test('정상 데이터는 오류 없이 통과', () => {
  assert.deepStrictEqual(J(plan().errors), []);
  assert.strictEqual(plan().ok, true);
});

console.log('이관: 서버가 받은 데이터 정리');
test('★ 주민번호 열이 지워지지 않은 채 오면 서버가 거부한다', () => {
  const r = L.sanitizeLegacyRows(J(fakeSheet()));      // 가짜 시트의 주민번호 칸에는 값이 있다
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('주민번호'));
});
test('주민번호 열을 비운 데이터는 통과하고 같은 결과로 계획이 만들어진다', () => {
  const blanked = fakeSheet().map(row => row.map((c, i) => (i === 2 ? '' : c)));
  const r = L.sanitizeLegacyRows(J(blanked));
  assert.strictEqual(r.ok, true);
  seq = 0;
  const viaServer = L.buildLegacyPlan(L.parseLegacySheet(r.rows), Object.assign({ makeId: p => p + (++seq) }, OPTS));
  assert.deepStrictEqual(J(viaServer.summary), J(plan().summary));
  assert.strictEqual(viaServer.ok, true);
});
test('모양이 이상하거나 너무 크면 거부', () => {
  assert.strictEqual(L.sanitizeLegacyRows(null).ok, false);
  assert.strictEqual(L.sanitizeLegacyRows({}).ok, false);
  assert.strictEqual(L.sanitizeLegacyRows(['x']).ok, false);
  assert.strictEqual(L.sanitizeLegacyRows(new Array(2001).fill([])).ok, false);
  assert.strictEqual(L.sanitizeLegacyRows([new Array(31).fill('a')]).ok, false);
});
test('객체 같은 이상한 칸은 빈칸으로, 긴 글자는 잘라낸다', () => {
  const r = L.sanitizeLegacyRows([[{ a: 1 }, 'x'.repeat(500), 5, true, null]]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(J(r.rows[0].slice(0, 1).concat(r.rows[0].slice(2))), ['', 5, true, '']);
  assert.strictEqual(r.rows[0][1].length, 200);
});
test('다른 칸(메일 등)에 주민번호가 섞여 있어도 거부', () => {
  const rows = fakeSheet().map(row => row.map((c, i) => (i === 2 ? '' : c)));
  rows[3][4] = '9001011234567';
  assert.strictEqual(L.sanitizeLegacyRows(J(rows)).ok, false);
});
/* ===================== 1단계: 접근 통제 (서버 함수마다 접속자 확인) ===================== */
console.log('접근 통제: 모든 서버 함수는 맨 앞에서 접속자를 확인한다');
const SERVER_FILES = ['Api.gs', 'Legacy.gs', 'Staff.gs', 'Code.gs', 'Setup.gs', 'SelfTest.gs'];
/** 화면이 부를 수 있는 서버 함수(이름 끝에 _ 가 없는 함수)와 그 함수의 첫 실행문을 읽는다 */
function publicFunctions() {
  const out = [];
  SERVER_FILES.forEach(f => {
    const src = fs.readFileSync(path.join(appDir, f), 'utf8');
    const re = /^function\s+([A-Za-z0-9]+)\s*\([^)]*\)\s*\{/gm;
    let m;
    while ((m = re.exec(src))) {
      const rest = src.slice(m.index + m[0].length);
      const end = rest.search(/\n(?:function|\/\*\*)\s/);
      const body = end >= 0 ? rest.slice(0, end) : rest;
      const first = body.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('//') && !s.startsWith('/*') && !s.startsWith('*'));
      out.push({ file: f, name: m[1], first: first || '', body });
    }
  });
  return out;
}
const PUBLIC = publicFunctions();
const NO_GUARD_OK = { doGet: '진입점(내부에서 접속자·운영진 확인)', include: '화면 틀 파일을 끼워 넣는 도우미(데이터 없음)', setup: '본문에서 소유자 이메일을 직접 확인' };
const OWNER_ONLY = ['backupNow', 'previewLegacyImport', 'commitLegacyImport', 'undoLegacyImport', 'listStaff', 'addStaff', 'removeStaff', 'fixStaffSharing', 'getSystemStatus', 'runSelfTest'];

test('서버 함수 목록을 읽었다', () => {
  assert.ok(PUBLIC.length >= 20, '읽은 함수 수 ' + PUBLIC.length);
});
test('★ 예외 3개(doGet, include, setup)를 뺀 모든 서버 함수는 첫 실행문이 requireStaff_/requireOwner_ 이다', () => {
  const bad = PUBLIC.filter(f => !NO_GUARD_OK[f.name] && !/require(Staff|Owner)_\(\)/.test(f.first));
  assert.deepStrictEqual(bad.map(f => f.file + ':' + f.name), []);
});
test('★ 소유자 전용 함수는 모두 requireOwner_ 로 시작한다', () => {
  OWNER_ONLY.forEach(n => {
    const f = PUBLIC.find(x => x.name === n);
    assert.ok(f, n + ' 함수를 찾지 못함');
    assert.ok(/requireOwner_\(\)/.test(f.first), n + ' 의 첫 실행문: ' + f.first);
  });
});
test('setup 은 소유자 이메일이 아니면 중단한다', () => {
  const f = PUBLIC.find(x => x.name === 'setup');
  assert.ok(/OWNER_EMAIL/.test(f.body) && /throw/.test(f.body));
});
test('새로 추가된 서버 함수가 목록에 빠지지 않도록, 예외·소유자 전용이 아닌 함수는 일반 운영진용으로 센다', () => {
  const normal = PUBLIC.filter(f => !NO_GUARD_OK[f.name] && !OWNER_ONLY.includes(f.name)).map(f => f.name).sort();
  assert.deepStrictEqual(normal, ['bulkSetStep', 'deleteSession', 'getBootstrap', 'saveSession', 'setStep', 'updateEnrollment', 'updatePerson'].sort());
});

console.log('접근 통제: 접속자별 동작 (구글 없이 가짜 접속자로 시험)');
const guardCtx = vm.createContext({ console });
vm.runInContext(['Schema.gs', 'Lib.gs', 'Api.gs'].map(f => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n'), guardCtx);
let ME = '';
const STAFF_ROWS = [
  { email: 'owner@example.com', name: '소유자', role: 'owner', active: 'Y' },
  { email: 'member@example.com', name: '운영진', role: 'member', active: 'Y' },
  { email: 'gone@example.com', name: '삭제됨', role: 'member', active: 'N' }];
guardCtx.currentEmail_ = () => ME;
guardCtx.readTab_ = tab => (tab === 'Staff' ? STAFF_ROWS : []);
const asUser = (email, fn) => { ME = email; return vm.runInContext(fn, guardCtx); };
const code = e => (/\[([A-Z_]+)\]/.exec(e.message) || [])[1];
test('로그인하지 않은 접속은 LOGIN_REQUIRED', () => {
  assert.throws(() => asUser('', 'requireStaff_()'), e => code(e) === 'LOGIN_REQUIRED');
});
test('운영진 목록에 없는 사람은 NOT_STAFF', () => {
  assert.throws(() => asUser('stranger@example.com', 'requireStaff_()'), e => code(e) === 'NOT_STAFF');
});
test('★ 삭제된(비활성) 운영진은 NOT_STAFF — 삭제하면 즉시 막힌다', () => {
  assert.throws(() => asUser('gone@example.com', 'requireStaff_()'), e => code(e) === 'NOT_STAFF');
  assert.throws(() => asUser('GONE@Example.com ', 'requireStaff_()'), e => code(e) === 'NOT_STAFF');
});
test('활성 운영진은 일반 기능은 되지만 소유자 전용은 OWNER_ONLY', () => {
  assert.strictEqual(asUser('member@example.com', 'requireStaff_().owner'), false);
  assert.throws(() => asUser('member@example.com', 'requireOwner_()'), e => code(e) === 'OWNER_ONLY');
  assert.throws(() => asUser(' Member@Example.com ', 'requireOwner_()'), e => code(e) === 'OWNER_ONLY');
});
test('소유자는 일반·소유자 전용 모두 통과', () => {
  assert.strictEqual(asUser('owner@example.com', 'requireStaff_().owner'), true);
  assert.doesNotThrow(() => asUser('OWNER@example.com', 'requireOwner_()'));
});

/* ===================== 1단계: 운영진 관리 ===================== */
console.log('운영진 관리: 입력 검사');
test('이메일을 소문자로 정리하고 이름이 없으면 이메일 앞부분을 쓴다', () => {
  const r = L.validateStaffInput('  Kim.Staff@Gmail.com ', '');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.email, 'kim.staff@gmail.com');
  assert.strictEqual(r.name, 'kim.staff');
});
test('이름이 있으면 앞뒤 공백을 지운 이름을 쓴다', () => {
  assert.strictEqual(L.validateStaffInput('a@b.co', '  운영진 4 ').name, '운영진 4');
});
test('이메일 형식이 틀리거나 이름이 너무 길면 거부', () => {
  ['', 'abc', 'a@b', 'a b@c.com', null].forEach(e => assert.strictEqual(L.validateStaffInput(e, 'x').ok, false, String(e)));
  assert.strictEqual(L.validateStaffInput('a@b.co', 'ㄱ'.repeat(41)).ok, false);
  assert.strictEqual(L.validateStaffInput('a@b.co', '900101-1234567').ok, false);
});

console.log('운영진 관리: 삭제 가능 여부');
const staffRows = [
  { email: 'Owner@Example.com', role: 'owner', active: 'Y' },
  { email: 'a@example.com', role: 'member', active: 'Y' },
  { email: 'gone@example.com', role: 'member', active: 'N' }];
test('일반 운영진은 삭제할 수 있다 (대소문자 무시)', () => {
  assert.strictEqual(L.planStaffRemoval(staffRows, ' A@Example.com ', 'owner@example.com').ok, true);
});
test('본인과 소유자는 삭제할 수 없다', () => {
  assert.strictEqual(L.planStaffRemoval(staffRows, 'owner@example.com', 'owner@example.com').ok, false);
  const other = L.planStaffRemoval(staffRows, 'owner@example.com', 'a@example.com');
  assert.strictEqual(other.ok, false);
  assert.ok(other.error.includes('소유자'));
});
test('목록에 없거나 이미 삭제된 사람은 거부', () => {
  assert.strictEqual(L.planStaffRemoval(staffRows, 'x@example.com', 'owner@example.com').ok, false);
  assert.strictEqual(L.planStaffRemoval(staffRows, 'gone@example.com', 'owner@example.com').ok, false);
});
test('공유 목록 확인은 대소문자와 공백을 무시한다', () => {
  assert.strictEqual(L.isEmailIn(['A@Example.com', 'b@example.com'], ' a@example.com '), true);
  assert.strictEqual(L.isEmailIn(['b@example.com'], 'a@example.com'), false);
  assert.strictEqual(L.isEmailIn([], ''), false);
  assert.strictEqual(L.isEmailIn(null, 'a@b.co'), false);
});

/* ===================== 1단계: 화면 계산(Logic.html) ===================== */
const logicSrc = fs.readFileSync(path.join(appDir, 'Logic.html'), 'utf8').replace(/<\/?script>/g, '');
const lctx = vm.createContext({ console });
vm.runInContext(logicSrc, lctx);
const G = vm.runInContext(`({ esc, digits, diffDays, addDays, fmtMD, fmtRange, sessionState, refundDeadline, sortSessions, nextSessionNumber,
  isCancelled, activeOf, cancelledOf, stepDone, countDone, nextAttend, pickupCounts, consentLabel, historyOf, dashKpi,
  looksLikeRrn, blankRrnColumns, rowsHaveRrn, trimRows, validateRrn, rrnMatchesProfile, splitRrnColumn, todoList, RRN_CODE_LABELS })`, lctx);

console.log('화면: 글자·날짜');
test('esc: HTML 특수문자를 무력화 (이름에 스크립트를 넣어도 실행되지 않는다)', () => {
  assert.strictEqual(G.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(G.esc('"a" & \'b\''), '&quot;a&quot; &amp; &#39;b&#39;');
  assert.strictEqual(G.esc(null), '');
  assert.strictEqual(G.esc(0), '0');
});
test('날짜 계산', () => {
  assert.strictEqual(G.diffDays('2026-10-12', '2026-10-09'), 3);
  assert.strictEqual(G.diffDays('2026-10-01', '2026-10-09'), -8);
  assert.strictEqual(G.addDays('2026-10-12', -3), '2026-10-09');
  assert.strictEqual(G.addDays('2026-10-30', 3), '2026-11-02');
  assert.strictEqual(G.addDays('2026-12-30', 3), '2027-01-02');
});
test('요일과 범위 표시', () => {
  assert.strictEqual(G.fmtMD('2026-10-06'), '10/6(화)');
  assert.strictEqual(G.fmtRange('2026-10-06', '2026-10-08'), '10/6(화) – 8(목)');
  assert.strictEqual(G.fmtRange('2026-10-30', '2026-11-01'), '10/30(금) – 11/1(일)');
  assert.strictEqual(G.fmtMD('이상한'), '');
});

console.log('화면: 회차');
const sA = { session_id: 'w1', program_id: 'w', n: 1, start: '2026-10-06', end: '2026-10-08' };
test('회차 상태: 시작 전 / 진행 중 / 종료', () => {
  assert.deepStrictEqual(J(G.sessionState(sA, '2026-10-01')), { days: 5, done: false, ongoing: false, started: false });
  assert.deepStrictEqual(J(G.sessionState(sA, '2026-10-07')), { days: -1, done: false, ongoing: true, started: true });
  assert.deepStrictEqual(J(G.sessionState(sA, '2026-10-08')), { days: -2, done: false, ongoing: true, started: true });
  assert.deepStrictEqual(J(G.sessionState(sA, '2026-10-09')), { days: -3, done: true, ongoing: false, started: true });
});
test('환불 가능 기한은 시작 3일 전', () => {
  assert.strictEqual(G.refundDeadline(sA, 3), '2026-10-03');
  assert.strictEqual(G.refundDeadline({ start: '2026-10-12' }, 3), '2026-10-09');
});
test('정렬: 진행 예정은 가까운 순, 종료는 최근 순', () => {
  const list = [
    { session_id: 'a', start: '2026-09-01', end: '2026-09-03' }, { session_id: 'b', start: '2026-12-10', end: '2026-12-12' },
    { session_id: 'c', start: '2026-10-05', end: '2026-10-07' }, { session_id: 'd', start: '2026-11-25', end: '2026-11-27' }];
  assert.deepStrictEqual(Array.from(G.sortSessions(list, '2026-11-18'), s => s.session_id), ['d', 'b', 'c', 'a']);
});
test('다음 회차 번호는 그 프로그램의 가장 큰 번호 + 1', () => {
  const ss = [{ program_id: 'w', n: 1 }, { program_id: 'w', n: 5 }, { program_id: 'l', n: 9 }];
  assert.strictEqual(G.nextSessionNumber(ss, 'w'), 6);
  assert.strictEqual(G.nextSessionNumber(ss, 'g'), 1);
});

console.log('화면: 참여 기록');
const enr = [
  { enroll_id: '1', session_id: 'w1', person_id: 'p1', transport: '자차', pay_at: '2026-11-18', ins_at: '2026-11-18', m1_at: '2026-11-18', m2_at: '', attend: '참석', cancel_reason: '' },
  { enroll_id: '2', session_id: 'w1', person_id: 'p2', transport: '고속터미널', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '', cancel_reason: '' },
  { enroll_id: '3', session_id: 'w1', person_id: 'p3', transport: '시외터미널', pay_at: '2026-11-18', ins_at: '', m1_at: '', m2_at: '', attend: '불참', cancel_reason: '개인 사정' },
  { enroll_id: '4', session_id: 'w1', person_id: 'p4', transport: '', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '불참', cancel_reason: '' },
  { enroll_id: '5', session_id: 'w2', person_id: 'p1', transport: '', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '', cancel_reason: '' }];
test('취소를 뺀 참여자만 센다', () => {
  assert.strictEqual(G.activeOf(enr, 'w1').length, 3);
  assert.strictEqual(G.cancelledOf(enr, 'w1').length, 1);
});
test('단계 완료 판정: 날짜가 있으면 완료, 참석은 참석일 때만', () => {
  assert.strictEqual(G.stepDone(enr[0], 'pay'), true);
  assert.strictEqual(G.stepDone(enr[1], 'pay'), false);
  assert.strictEqual(G.stepDone(enr[0], 'attend'), true);
  assert.strictEqual(G.stepDone(enr[3], 'attend'), false);   // 불참은 완료가 아니다
  assert.strictEqual(G.countDone(G.activeOf(enr, 'w1'), 'pay'), 1);
});
test('참석 칸은 빈칸 → 참석 → 불참 → 빈칸으로 돈다', () => {
  assert.strictEqual(G.nextAttend(''), '참석');
  assert.strictEqual(G.nextAttend(null), '참석');
  assert.strictEqual(G.nextAttend('참석'), '불참');
  assert.strictEqual(G.nextAttend('불참'), '');
});
test('이동수단 집계: 취소 제외, 픽업은 고속+시외', () => {
  assert.deepStrictEqual(J(G.pickupCounts(G.activeOf(enr, 'w1'))), { car: 1, exp: 1, int: 0, blank: 1, pickup: 1 });
});
test('동의 표시: 빈칸은 미확인', () => {
  assert.deepStrictEqual(['Y', 'N', '', undefined].map(G.consentLabel), ['동의', '미동의', '미확인', '미확인']);
});
test('참여 이력은 최근 회차가 먼저', () => {
  const boot = { sessions: [sA, { session_id: 'w2', start: '2026-10-12', end: '2026-10-14' }], enrollments: enr };
  assert.deepStrictEqual(Array.from(G.historyOf(boot, 'p1'), h => h.enr.session_id), ['w2', 'w1']);
});

console.log('화면: 대시보드 요약');
test('종료된 회차만 있으면 예정 카드는 비고, 참석 정리만 계산한다', () => {
  const k = G.dashKpi({ today: '2026-11-18', sessions: [sA], enrollments: enr.filter(e => e.session_id === 'w1') });
  assert.strictEqual(k.upcoming, null); assert.strictEqual(k.pay, null); assert.strictEqual(k.ins, null);
  assert.deepStrictEqual(J(k.attend), { done: 2, total: 3 });   // 참석 1 + 불참 1 / 참여 3 (취소 제외)
});
test('진행 예정 회차가 있으면 인원·입금·보험을 계산한다', () => {
  const sess = [{ session_id: 'w9', program_id: 'w', n: 9, start: '2026-11-25', end: '2026-11-27' }];
  const e = [
    { enroll_id: 'a', session_id: 'w9', pay_at: '2026-11-01', ins_at: '', cancel_reason: '' },
    { enroll_id: 'b', session_id: 'w9', pay_at: '', ins_at: '', cancel_reason: '' },
    { enroll_id: 'c', session_id: 'w9', pay_at: '2026-11-01', ins_at: '2026-11-02', cancel_reason: '' },
    { enroll_id: 'd', session_id: 'w9', pay_at: '', ins_at: '', cancel_reason: '사정' }];
  const k = G.dashKpi({ today: '2026-11-18', sessions: sess, enrollments: e });
  assert.deepStrictEqual(J(k.upcoming), { people: 3, sessions: 1 });
  assert.deepStrictEqual(J(k.pay), { done: 2, total: 3 });
  assert.deepStrictEqual(J(k.ins), { done: 1, total: 3 });
});
test('14일 넘게 남은 회차는 인원·보험 카드에서 제외, 21일 안이면 입금에는 포함', () => {
  const sess = [{ session_id: 'w9', start: '2026-12-05', end: '2026-12-07' }];   // 17일 뒤
  const e = [{ enroll_id: 'a', session_id: 'w9', pay_at: '', ins_at: '', cancel_reason: '' }];
  const k = G.dashKpi({ today: '2026-11-18', sessions: sess, enrollments: e });
  assert.strictEqual(k.upcoming, null); assert.strictEqual(k.ins, null);
  assert.deepStrictEqual(J(k.pay), { done: 0, total: 1 });
});

console.log('화면: 이관 시 주민번호 보호');
test('★ 주민번호 열(헤더 이름 기준)을 통째로 비운다', () => {
  const rows = J(fakeSheet());
  const r = G.blankRrnColumns(rows);
  assert.strictEqual(r.count, 1);
  assert.ok(!JSON.stringify(r.rows).includes('900101'), '가짜 주민번호가 남아 있음');
  assert.strictEqual(G.rowsHaveRrn(r.rows), false);
  assert.strictEqual(r.rows[3][1], '가나다');          // 다른 열은 그대로
  assert.strictEqual(r.rows.length, rows.length);
});
test('비운 데이터는 서버 검사도 통과하고 같은 결과로 이관 계획이 만들어진다', () => {
  const r = G.blankRrnColumns(J(fakeSheet()));
  const s = L.sanitizeLegacyRows(J(r.rows));
  assert.strictEqual(s.ok, true);
  seq = 0;
  const pl = L.buildLegacyPlan(L.parseLegacySheet(s.rows), Object.assign({ makeId: p => p + (++seq) }, OPTS));
  assert.strictEqual(pl.ok, true);
  assert.deepStrictEqual(J(pl.summary), J(plan().summary));
});
test('다른 칸에 주민번호가 있으면 감지해서 전송을 막는다', () => {
  const rows = J(fakeSheet()); rows[3][4] = '900101-1234567';
  assert.strictEqual(G.rowsHaveRrn(G.blankRrnColumns(rows).rows), true);
});
test('"주민번호(필수)" 같은 헤더도 찾고, 긴 메모는 헤더로 오해하지 않는다', () => {
  const rows = [['', '이름', '주민번호(필수)'], ['', 'a', '900101-1234567'], ['', '주민번호 입력 시 하이픈 없이 써 주세요. 이 문장은 길어서 헤더가 아니에요.', 'x']];
  const r = G.blankRrnColumns(rows);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.rows[1][2], '');
  assert.strictEqual(r.rows[2][1], rows[2][1]);
});
test('★ 화면의 주민번호 검사와 서버 검사가 같은 결과를 낸다', () => {
  const corpus = ['900101-1234567', '900101 - 2345678', '9001011234567', '주민번호는 900101-1234567 입니다', '000101-4123456',
    '010-1234-5678', '01012345678', '2026-10-09', '2026-10-09 15:30:00', '일해보기 3회차', '', null, '123456-9234567', '12345678901234'];
  corpus.forEach(s => assert.strictEqual(G.looksLikeRrn(s), L.looksLikeRrn(s), String(s)));
});
test('뒤쪽 빈 행을 잘라낸다', () => {
  const rows = [['a'], ['', ''], ['b', ''], [''], []];
  assert.strictEqual(G.trimRows(rows).length, 3);
  assert.strictEqual(G.trimRows([[''], []]).length, 0);
});

/* ===================== 2단계: 주민번호 규칙 ===================== */
console.log('2단계: 주민번호 형식 검사');
test('정상 번호는 하이픈 형태로 정리된다 (하이픈 유무·공백 무관)', () => {
  ['900101-1234567', '9001011234567', ' 900101 - 1234567 ', '900101 1234567'].forEach(s => {
    const v = L.validateRrn(s);
    assert.strictEqual(v.ok, true, s);
    assert.strictEqual(v.rrn, '900101-1234567');
    assert.strictEqual(v.birthYear, 1990);
    assert.strictEqual(v.male, true);
  });
});
test('세기 자리: 1·2·5·6은 1900년대, 3·4·7·8은 2000년대, 홀수는 남', () => {
  assert.strictEqual(L.validateRrn('010101-3234567').birthYear, 2001);
  assert.strictEqual(L.validateRrn('010101-4234567').male, false);
  assert.strictEqual(L.validateRrn('900101-5234567').birthYear, 1990);
  assert.strictEqual(L.validateRrn('010101-7234567').birthYear, 2001);
});
test('★ 실제 신청 파일에서 본 오류 유형을 모두 잡는다 (값을 담지 않고 코드만)', () => {
  const cases = [['', 'EMPTY'], [null, 'EMPTY'], ['19900101', 'LENGTH'], ['12345678', 'LENGTH'], ['9001011', 'LENGTH'], ['900101123456', 'LENGTH'],
    ['901301-1234567', 'BIRTHDATE'], ['900230-1234567', 'BIRTHDATE'], ['900101-9234567', 'GENDER_DIGIT'], ['900101-0234567', 'GENDER_DIGIT'], ['abc', 'EMPTY']];
  cases.forEach(([raw, code]) => {
    const v = L.validateRrn(raw);
    assert.strictEqual(v.ok, false, String(raw));
    assert.strictEqual(v.code, code, String(raw));
    assert.ok(!('rrn' in v), '실패 결과에 번호가 들어 있음');
  });
});
test('숫자 칸으로 읽혀 앞의 0이 지워진 12자리 숫자는 되살린다 (문자열은 되살리지 않는다)', () => {
  const v = L.validateRrn(101013234567);               // 0101013234567
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.rrn, '010101-3234567');
  assert.strictEqual(v.restored, true);
  assert.strictEqual(L.validateRrn('101013234567').ok, false);
  assert.strictEqual(L.validateRrn(9001011234567).rrn, '900101-1234567');
});
test('체크섬은 검사하지 않는다 (맞지 않는 번호도 형식이 맞으면 통과)', () => {
  assert.strictEqual(L.validateRrn('900101-1111111').ok, true);
});

console.log('2단계: 성별·출생연도 대조');
test('일치하면 통과', () => {
  assert.strictEqual(L.rrnMatchesProfile('900101-1234567', '남', 1990).ok, true);
  assert.strictEqual(L.rrnMatchesProfile('950101-2234567', '여', '1995').ok, true);
});
test('성별이 다르면 GENDER_MISMATCH, 출생연도가 다르면 BIRTH_MISMATCH, 둘 다면 둘 다', () => {
  assert.strictEqual(L.rrnMatchesProfile('900101-2234567', '남', 1990).code, 'GENDER_MISMATCH');
  assert.strictEqual(L.rrnMatchesProfile('900101-1234567', '남', 1991).code, 'BIRTH_MISMATCH');
  assert.deepStrictEqual(J(L.rrnMatchesProfile('900101-1234567', '여', 1991).codes), ['BIRTH_MISMATCH', 'GENDER_MISMATCH']);
});
test('성별·출생연도를 모르면 그 항목은 대조하지 않는다', () => {
  assert.strictEqual(L.rrnMatchesProfile('900101-1234567', '', '').ok, true);
  assert.strictEqual(L.rrnMatchesProfile('900101-1234567', '남', '').ok, true);
});
test('형식이 틀리면 형식 사유가 먼저', () => {
  assert.strictEqual(L.rrnMatchesProfile('9001011', '남', 1990).code, 'LENGTH');
});
test('저장된 번호의 상태: 없음 / 보관 중 / 확인 필요 (값을 돌려주지 않는다)', () => {
  const p = { gender: '남', birth_year: 1990 };
  assert.strictEqual(L.rrnStatusFor(null, p), 'missing');
  assert.strictEqual(L.rrnStatusFor('', p), 'missing');
  assert.strictEqual(L.rrnStatusFor('900101-1234567', p), 'ok');
  assert.strictEqual(L.rrnStatusFor('900101-2234567', p), 'check');
  assert.strictEqual(L.rrnStatusFor('9001011', p), 'check');
});
test('사유 코드마다 한글 설명이 있다', () => {
  ['EMPTY', 'LENGTH', 'BIRTHDATE', 'GENDER_DIGIT', 'BIRTH_MISMATCH', 'GENDER_MISMATCH'].forEach(c => assert.ok(L.RRN_CODE_LABELS[c], c));
});
test('★ 화면의 주민번호 규칙과 서버 규칙이 같은 결과를 낸다', () => {
  const corpus = ['900101-1234567', '9001011234567', ' 900101 - 1234567 ', '19900101', '9001011', '900101123456', '901301-1234567', '900101-9234567',
    '', null, 'abc', 101013234567, 9001011234567, '101013234567', '010101-3234567', '900230-1234567', '000229-3234567'];
  corpus.forEach(s => assert.deepStrictEqual(J(G.validateRrn(s)), J(L.validateRrn(s)), String(s)));
  [['900101-1234567', '남', 1990], ['900101-2234567', '남', 1990], ['900101-1234567', '여', 1991], ['9001011', '남', 1990], ['900101-1234567', '', '']]
    .forEach(([r, g, b]) => assert.deepStrictEqual(J(G.rrnMatchesProfile(r, g, b)), J(L.rrnMatchesProfile(r, g, b)), r));
  assert.deepStrictEqual(J(G.RRN_CODE_LABELS), J(L.RRN_CODE_LABELS));
});

/* ===================== 2단계: 신청 엑셀 읽기·판정 ===================== */
console.log('2단계: 신청 엑셀 읽기');
test('회차 칸: 테마가 있는 실제 형식과 요일이 있는 형식, 간격 불규칙을 모두 읽는다', () => {
  assert.deepStrictEqual(J(L.parseApplicationRound('3회차 | 예술의 곁 | 10/19-21')), { n: 3, theme: '예술의 곁', startMD: '10-19', endMD: '10-21' });
  assert.deepStrictEqual(J(L.parseApplicationRound('5회차  | 자연의 곁 | 10/26-28')), { n: 5, theme: '자연의 곁', startMD: '10-26', endMD: '10-28' });
  assert.deepStrictEqual(J(L.parseApplicationRound('3회차 | 10/19(월)-21(수)')), { n: 3, theme: null, startMD: '10-19', endMD: '10-21' });
  assert.deepStrictEqual(J(L.parseApplicationRound('7회차 | 마을의 곁 | 10/30-11/1')), { n: 7, theme: '마을의 곁', startMD: '10-30', endMD: '11-01' });
  assert.deepStrictEqual(J(L.parseApplicationRound('2회차')), { n: 2, theme: null, startMD: null, endMD: null });
});
test('회차 칸이 비었거나 번호가 없으면 null', () => {
  ['', null, '날짜 미정', '예술의 곁 | 10/19-21'].forEach(s => assert.strictEqual(L.parseApplicationRound(s), null, String(s)));
});
test('신청일: 시각의 시가 한 자리여도 날짜를 읽는다', () => {
  assert.strictEqual(L.parseApplicationDate('2026-11-10 9:30'), '2026-11-10');
  assert.strictEqual(L.parseApplicationDate('2026-11-10 09:30'), '2026-11-10');
  assert.strictEqual(L.parseApplicationDate('2026-11-10'), '2026-11-10');
  assert.strictEqual(L.parseApplicationDate('2026-13-40'), '');
  assert.strictEqual(L.parseApplicationDate(''), '');
});
test('동의 칸: 동의 / 미동의 / 빈칸 / 읽을 수 없음', () => {
  assert.deepStrictEqual(['동의', '미동의', '', ' 동의 ', '네'].map(L.applicationConsent), ['Y', 'N', '', 'Y', null]);
});

/* 실제 신청 파일과 같은 열 이름·같은 글자 모양의 가짜 시트 */
const AHEAD = ['번호', '이름', '연락처', '성별', '출생연도', '직업', '거주지', '이메일', '여행자 보험 가입을 위해 주민번호 전체를 작성해주세요.',
  '프로그램 상세 시간표 및 참가비 안내는 신청하신 메일로 보내드릴 예정입니다. 합격문자를 받으시면 꼭 메일을 확인해 주세요. ', '신청하시는 회차를 선택해주세요',
  '이외에 곁마을 운영진에게 하고싶은 말, 혹은 질문이 있다면 자유롭게 남겨주세요. ', '기타답변', '초상권동의', '추가보유동의', '신청일', '합격여부', '참석 여부', '취소사유'];
const A = (o = {}) => [o.hp || '1001', o.name || '가짜갑', o.phone || '01011110001', o.g || '여', o.b || '1990', o.job || '', o.area || '서울', o.mail || 'a@example.com',
  o.rrn === undefined ? '900101-2234567' : o.rrn, o.notice === undefined ? '예' : o.notice, o.round === undefined ? '9회차 | 마을의 곁 | 12/7-9' : o.round,
  o.memo || '', o.memo2 || '', o.portrait || '동의', o.retain || '동의', o.applied || '2026-11-10 9:30', o.pass || '합격', o.attend || '', o.cancel || ''];
const APP_TODAY = '2026-11-19';
const SESSIONS = [
  { session_id: 'w1', program_id: 'w', n: 1, start: '2026-10-06', end: '2026-10-08', note: '기존 엑셀 이관' },
  { session_id: 'w2', program_id: 'w', n: 2, start: '2026-10-12', end: '2026-10-14', note: '기존 엑셀 이관' },
  { session_id: 'w3', program_id: 'w', n: 3, start: '2026-10-19', end: '2026-10-21', note: '' },
  { session_id: 'w9', program_id: 'w', n: 9, start: '2026-12-07', end: '2026-12-09', note: '' },
  { session_id: 'l1', program_id: 'l', n: 1, start: '2026-12-07', end: '2026-12-11', note: '' }];
const mkExisting = () => ({
  sessions: J(SESSIONS),
  people: [
    { person_id: 'p1', name: '기존갑', phone: '010-2222-0001', email: '', gender: '여', birth_year: 1990, job: '', area: '', consent_retain: '', consent_portrait: '', updated_at: 'x' },
    { person_id: 'p2', name: '기존을', phone: '010-2222-0002', email: 'old@example.com', gender: '남', birth_year: 1991, job: '디자이너', area: '부산', consent_retain: 'Y', consent_portrait: 'Y', updated_at: 'x' },
    { person_id: 'p3', name: '기존병', phone: '010-2222-0003', email: '', gender: '여', birth_year: 1992, job: '', area: '', consent_retain: 'N', consent_portrait: '', updated_at: 'x' }],
  enrollments: [
    { enroll_id: 'e1', session_id: 'w1', person_id: 'p1', hp_no: '', applied_at: '', notice_ack: '', memo: '', attend: '', cancel_reason: '', pass: '합격' },
    { enroll_id: 'e2', session_id: 'w1', person_id: 'p2', hp_no: '5', applied_at: '2026-09-01', notice_ack: 'Y', memo: '원래 메모', attend: '참석', cancel_reason: '', pass: '합격' },
    { enroll_id: 'e3', session_id: 'w1', person_id: 'p3', hp_no: '', applied_at: '', notice_ack: '', memo: '', attend: '', cancel_reason: '', pass: '합격' }]
});
const parseAndPlan = (rows, opts = {}, existing = mkExisting()) => {
  const parsed = L.parseApplicationSheet([AHEAD].concat(rows));
  let n = 0;
  return { parsed, plan: L.buildApplicationPlan(parsed, existing, Object.assign({ program_id: 'w', today: APP_TODAY, now: APP_TODAY + ' 12:00:00', actor: 'staff@example.com', makeId: p => p + (++n) }, opts)) };
};

test('시트를 열 이름으로 읽는다 (BOM·긴 머리글·주민번호 열 제외)', () => {
  const head = AHEAD.slice(); head[0] = '﻿번호';
  const p = L.parseApplicationSheet([head, A({ name: '가짜갑', memo: '질문 있어요', memo2: '추가 의견' })]);
  assert.deepStrictEqual(J(p.missing), []);
  assert.strictEqual(p.rows.length, 1);
  assert.strictEqual(p.rows[0].name, '가짜갑');
  assert.strictEqual(p.rows[0].memo, '질문 있어요 / 추가 의견');
  assert.strictEqual(p.rows[0].round.theme, '마을의 곁');
  assert.strictEqual(p.rows[0].applied, '2026-11-10');
  assert.strictEqual(p.rows[0].retain, 'Y');
  assert.strictEqual(p.rows[0].rowNo, 2);
});
test('★ 읽은 결과에 주민번호가 없다 (이 함수는 주민번호 열을 읽지 않는다)', () => {
  const p = L.parseApplicationSheet([AHEAD, A({ rrn: '900101-1234567' }), A({ name: '가짜을', rrn: '9001011234567' })]);
  assert.ok(!JSON.stringify(p).includes('900101'), '읽은 결과에 주민번호가 있음');
});
test('필수 열이 없으면 못 찾은 열을 알린다', () => {
  const p = L.parseApplicationSheet([['이름', '연락처'], ['가짜갑', '01011110001']]);
  assert.ok(p.missing.length > 3 && p.missing.includes('합격여부'));
  assert.strictEqual(L.buildApplicationPlan(p, mkExisting(), { program_id: 'w', today: APP_TODAY }).ok, false);
  assert.deepStrictEqual(J(L.parseApplicationSheet([['a', 'b']]).missing), ['이름']);
});
test('이름이 없는 행은 경고만 하고 건너뛴다 (위치만 표시)', () => {
  const p = L.parseApplicationSheet([AHEAD, A({ name: '' }).map((v, i) => (i === 1 ? '' : v))]);
  assert.strictEqual(p.rows.length, 0);
  assert.ok(p.warnings[0].msg.includes('2행'));
});

console.log('2단계: 신청 판정');
test('신규: 종료 전 회차의 합격 신규는 새 사람·새 참여 기록, 주민번호 저장 대상', () => {
  const { plan } = parseAndPlan([A({ name: '신규갑', phone: '01099990001' })]);
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.rows[0].decision, 'new');
  assert.strictEqual(plan.rows[0].session_id, 'w9');
  assert.strictEqual(plan.rows[0].method, 'exact');
  assert.strictEqual(plan.rows[0].rrnEligible, true);
  assert.strictEqual(plan.newPeople.length, 1);
  assert.strictEqual(plan.newPeople[0].phone, '010-9999-0001');
  assert.strictEqual(plan.newEnrollments[0].pass, '합격');
  assert.strictEqual(plan.newEnrollments[0].applied_at, '2026-11-10');
  assert.strictEqual(plan.newEnrollments[0].notice_ack, 'Y');
  assert.strictEqual(plan.newEnrollments[0].updated_by, 'staff@example.com');
});
test('불합격은 제외, 합격여부를 못 읽으면 오류', () => {
  const { plan } = parseAndPlan([A({ name: '탈락갑', pass: '불합격' }), A({ name: '이상갑', pass: '대기' })]);
  assert.strictEqual(plan.rows[0].decision, 'rejected');
  assert.strictEqual(plan.rows[1].decision, 'error');
  assert.strictEqual(plan.newPeople.length, 0);
});
test('회차 칸이 비었거나 맞는 회차가 없으면 "회차 확인 필요"', () => {
  const { plan } = parseAndPlan([A({ name: '빈칸갑', round: '' }), A({ name: '없음갑', round: '8회차 | 마을의 곁 | 12/1-3' })]);
  assert.deepStrictEqual(J(plan.rows.map(r => r.decision)), ['needs_session', 'needs_session']);
  assert.strictEqual(plan.summary.needs_session, 2);
});
test('프로그램은 업로드할 때 고른 것만 본다. 날짜가 크게 다르면 번호가 같아도 연결하지 않는다', () => {
  const { plan } = parseAndPlan([A({ name: '살아갑', round: '1회차 | 마을의 곁 | 12/7-11' })], { program_id: 'w' });
  assert.strictEqual(plan.rows[0].decision, 'needs_session');
  const { plan: p2 } = parseAndPlan([A({ name: '살아갑', round: '1회차 | 마을의 곁 | 12/7-11' })], { program_id: 'l' });
  assert.strictEqual(p2.rows[0].session_id, 'l1');
});
test('날짜가 달라도 회차 번호가 하나로 정해지면 연결하고 경고한다', () => {
  const { plan } = parseAndPlan([A({ name: '날짜갑', round: '2회차 | 마을의 곁 | 10/13-15' })]);
  assert.strictEqual(plan.rows[0].session_id, 'w2');
  assert.strictEqual(plan.rows[0].method, 'number');
  assert.ok(plan.warnings.some(w => w.includes('날짜가 달라요')));
});
test('수동으로 지정한 회차를 쓴다 (회차 칸이 비어 있어도)', () => {
  const { plan } = parseAndPlan([A({ name: '지정갑', round: '' })], { sessionMap: { 2: 'w9' } });
  assert.strictEqual(plan.rows[0].decision, 'new');
  assert.strictEqual(plan.rows[0].method, 'manual');
  assert.strictEqual(plan.rows[0].session_id, 'w9');
});
test('이미 등록된 사람: 새로 만들지 않고 빈 칸만 채운다', () => {
  const { plan } = parseAndPlan([A({ name: '기존갑', phone: '01022220001', round: '1회차 | 마을의 곁 | 10/6-8', job: '기획자', area: '서울', mail: 'p1@example.com', memo: '질문', hp: '77' })]);
  assert.strictEqual(plan.rows[0].decision, 'existing');
  assert.strictEqual(plan.newPeople.length, 0);
  assert.strictEqual(plan.newEnrollments.length, 0);
  assert.strictEqual(plan.rows[0].rrnEligible, false);
  const f = x => plan.fills.find(y => y.field === x);
  assert.strictEqual(f('job').to, '기획자');
  assert.strictEqual(f('area').to, '서울');
  assert.strictEqual(f('email').to, 'p1@example.com');
  assert.strictEqual(f('applied_at').to, '2026-11-10');
  assert.strictEqual(f('memo').to, '질문');
  assert.strictEqual(f('hp_no').to, '77');
  assert.strictEqual(f('consent_retain').to, 'Y');
  assert.strictEqual(f('consent_portrait').to, 'Y');
  assert.ok(plan.fills.every(x => x.from === ''));
});
test('이미 값이 있는 칸은 덮어쓰지 않는다', () => {
  const { plan } = parseAndPlan([A({ name: '기존을', phone: '01022220002', round: '1회차 | 마을의 곁 | 10/6-8', job: '개발자', area: '서울', mail: 'new@example.com', memo: '새 메모', hp: '99' })]);
  const fields = plan.fills.map(x => x.field);
  ['job', 'area', 'email', 'memo', 'hp_no', 'applied_at', 'notice_ack'].forEach(f => assert.ok(!fields.includes(f), f + ' 이(가) 덮어써짐'));
});
test('★ 동의가 다르면 더 제한적인 쪽: 동의→미동의는 바뀌고, 미동의→동의는 미동의를 유지, 둘 다 경고', () => {
  const { plan } = parseAndPlan([
    A({ name: '기존을', phone: '01022220002', round: '1회차 | 마을의 곁 | 10/6-8', portrait: '미동의', retain: '미동의' }),
    A({ name: '기존병', phone: '01022220003', round: '1회차 | 마을의 곁 | 10/6-8', retain: '동의' })]);
  const to = (id, f) => (plan.fills.find(x => x.id === id && x.field === f) || {}).to;
  assert.strictEqual(to('p2', 'consent_retain'), 'N');
  assert.strictEqual(to('p2', 'consent_portrait'), 'N');
  assert.strictEqual(plan.fills.find(x => x.id === 'p2' && x.field === 'consent_retain').from, 'Y');
  assert.strictEqual(to('p3', 'consent_retain'), undefined);       // 저장된 미동의를 유지
  assert.ok(plan.warnings.filter(w => w.includes('더 제한적인')).length >= 3);
  assert.strictEqual(plan.summary.consentChanged, 2);
});
test('동의 병합 규칙', () => {
  assert.deepStrictEqual(J(L.mergeConsent('', 'Y')), { value: 'Y', conflict: false });
  assert.deepStrictEqual(J(L.mergeConsent('Y', '')), { value: 'Y', conflict: false });
  assert.deepStrictEqual(J(L.mergeConsent('Y', 'Y')), { value: 'Y', conflict: false });
  assert.deepStrictEqual(J(L.mergeConsent('Y', 'N')), { value: 'N', conflict: true });
  assert.deepStrictEqual(J(L.mergeConsent('N', 'Y')), { value: 'N', conflict: true });
  assert.deepStrictEqual(J(L.mergeConsent('', '')), { value: '', conflict: false });
});
test('취소사유가 있는 새 신청은 취소 상태로 등록하고 주민번호는 저장하지 않는다', () => {
  const { plan } = parseAndPlan([A({ name: '취소갑', phone: '01099990009', cancel: '개인 사정' })]);
  assert.strictEqual(plan.rows[0].decision, 'cancelled_new');
  assert.strictEqual(plan.newEnrollments[0].cancel_reason, '개인 사정');
  assert.strictEqual(plan.newEnrollments[0].cancelled_at, APP_TODAY);
  assert.strictEqual(plan.rows[0].rrnEligible, false);
});
test('이미 등록된 사람에게 취소사유가 있어도 바꾸지 않고 경고만 한다', () => {
  const { plan } = parseAndPlan([A({ name: '기존갑', phone: '01022220001', round: '1회차 | 마을의 곁 | 10/6-8', cancel: '사정' })]);
  assert.strictEqual(plan.rows[0].decision, 'existing');
  assert.ok(plan.warnings.some(w => w.includes('취소사유')));
  assert.ok(!plan.fills.some(x => x.field === 'cancel_reason'));
});
test('같은 파일 안에서 같은 사람이 같은 회차에 또 나오면 건너뛴다', () => {
  const { plan } = parseAndPlan([A({ name: '중복갑', phone: '01099990002' }), A({ name: '중복갑', phone: '010-9999-0002' })]);
  assert.deepStrictEqual(J(plan.rows.map(r => r.decision)), ['new', 'duplicate_in_file']);
  assert.strictEqual(plan.newEnrollments.length, 1);
});
test('같은 사람이 다른 회차에 신청하면 사람은 하나, 참여 기록은 둘', () => {
  const { plan } = parseAndPlan([A({ name: '여럿갑', phone: '01099990003', round: '9회차 | 마을의 곁 | 12/7-9' }), A({ name: '여럿갑', phone: '01099990003', round: '3회차 | 예술의 곁 | 10/19-21' })]);
  assert.strictEqual(plan.newPeople.length, 1);
  assert.strictEqual(plan.newEnrollments.length, 2);
  assert.deepStrictEqual(J(plan.rows.map(r => r.rrnEligible)), [true, false]);    // 이미 끝난 3회차는 저장 대상이 아님
});
test('★ 이미 끝난 회차의 신규는 주민번호 저장 대상이 아니다 (R4)', () => {
  const { plan } = parseAndPlan([A({ name: '지난갑', phone: '01099990004', round: '3회차 | 예술의 곁 | 10/19-21' })]);
  assert.strictEqual(plan.rows[0].decision, 'new');
  assert.strictEqual(plan.rows[0].rrnEligible, false);
});
test('읽을 수 없는 연락처·이름은 그 행만 오류, 나머지는 계속', () => {
  const { plan } = parseAndPlan([A({ name: '전화갑', phone: '없음' }), A({ name: '정상갑', phone: '01099990005' })]);
  assert.deepStrictEqual(J(plan.rows.map(r => r.decision)), ['error', 'new']);
  assert.strictEqual(plan.ok, true);
});
test('앞자리 0이 지워진 연락처도 읽는다', () => {
  const { plan } = parseAndPlan([A({ name: '전화을', phone: '1099990006' })]);
  assert.strictEqual(plan.newPeople[0].phone, '010-9999-0006');
});
test('★ 회차 칸의 테마 이름을 회차 메모(비고)에 적는다. 이미 있으면 다시 적지 않는다', () => {
  const { plan } = parseAndPlan([A({ name: '테마갑', phone: '01099990007', round: '3회차 | 예술의 곁 | 10/19-21' }), A({ name: '테마을', phone: '01099990008', round: '3회차 | 예술의 곁 | 10/19-21' })]);
  assert.strictEqual(plan.sessionNotes.length, 1);
  assert.deepStrictEqual(J(plan.sessionNotes[0]), { session_id: 'w3', from: '', to: '테마: 예술의 곁' });
  const ex = mkExisting(); ex.sessions[0].note = '기존 엑셀 이관 · 테마: 마을의 곁';
  const again = parseAndPlan([A({ name: '테마병', phone: '01099990010', round: '1회차 | 마을의 곁 | 10/6-8' })], {}, ex).plan;
  assert.strictEqual(again.sessionNotes.length, 0);
  const append = parseAndPlan([A({ name: '테마정', phone: '01099990011', round: '2회차 | 마을의 곁 | 10/12-14' })]).plan;
  assert.strictEqual(append.sessionNotes[0].to, '기존 엑셀 이관 · 테마: 마을의 곁');
});
test('★ 참석 여부는 옵션을 켰을 때, 이미 시작한 회차의 빈 칸에만, 참석·불참만 반영한다 (한 번만)', () => {
  const rows = [
    A({ name: '기존갑', phone: '01022220001', round: '1회차 | 마을의 곁 | 10/6-8', attend: '참석' }),     // 시작함 · 빈 칸 → 반영
    A({ name: '기존을', phone: '01022220002', round: '1회차 | 마을의 곁 | 10/6-8', attend: '불참' }),     // 이미 '참석' → 덮어쓰지 않음
    A({ name: '기존병', phone: '01022220003', round: '1회차 | 마을의 곁 | 10/6-8', attend: '미확인' }),   // 미확인 → 무시
    A({ name: '미래갑', phone: '01099990012', attend: '참석' })];                                         // 아직 시작 전 회차 → 무시
  const on = parseAndPlan(rows, { applyAttend: true }).plan;
  const att = on.fills.filter(x => x.field === 'attend');
  assert.deepStrictEqual(J(att.map(x => [x.id, x.to])), [['e1', '참석']]);
  assert.strictEqual(on.newEnrollments[0].attend, '');
  assert.strictEqual(on.summary.attendFilled, 1);
  const off = parseAndPlan(rows, { applyAttend: false }).plan;
  assert.strictEqual(off.fills.filter(x => x.field === 'attend').length, 0);
});
test('★ 경고·오류·요약·판정 어디에도 이름·연락처·주민번호가 없다', () => {
  const { plan } = parseAndPlan([
    A({ name: '신규갑', phone: '01099990001', rrn: '900101-1234567' }), A({ name: '탈락갑', phone: '01099990002', pass: '불합격' }),
    A({ name: '전화갑', phone: '없음' }), A({ name: '날짜갑', phone: '01099990003', round: '2회차 | 마을의 곁 | 10/13-15' }),
    A({ name: '기존을', phone: '01022220002', round: '1회차 | 마을의 곁 | 10/6-8', portrait: '미동의' })]);
  const text = JSON.stringify([plan.errors, plan.warnings, plan.summary, plan.rows]);
  ['신규갑', '탈락갑', '전화갑', '날짜갑', '기존을', '01099990001', '010-9999', '900101', '1234567'].forEach(s => assert.ok(!text.includes(s), s));
});
test('행이 500개를 넘으면 막는다', () => {
  const rows = []; for (let i = 0; i < 501; i++) rows.push(A({ name: '행' + i, phone: '0109999' + String(1000 + i) }));
  assert.strictEqual(parseAndPlan(rows).plan.ok, false);
});
test('실제 신청 파일의 모양을 본뜬 36행도 문제없이 판정한다 (합격 33·불합격 3·회차 빈칸 3)', () => {
  const rows = [];
  const rounds = ['1회차 | 마을의 곁 | 10/6-8', '2회차 | 마을의 곁 | 10/12-14', '3회차 | 예술의 곁 | 10/19-21'];
  for (let i = 0; i < 33; i++) rows.push(A({ name: '실제형' + i, phone: '010' + String(30000000 + i), round: i < 30 ? rounds[i % 3] : '' }));
  for (let i = 0; i < 3; i++) rows.push(A({ name: '탈락형' + i, phone: '010' + String(40000000 + i), pass: '불합격', round: rounds[i] }));
  const { plan } = parseAndPlan(rows);
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.summary.total, 36);
  assert.strictEqual(plan.summary.rejected, 3);
  assert.strictEqual(plan.summary.needs_session, 3);
  assert.strictEqual(plan.summary.new, 30);
});

console.log('2단계: 주민번호 저장 목록 (등록 때)');
const rrnPlan = () => parseAndPlan([
  A({ name: '저장갑', phone: '01099991001', g: '남', b: '1990' }),                                  // 행2: 남, 1990
  A({ name: '틀림갑', phone: '01099991002', g: '남', b: '1990' }),                                  // 행3
  A({ name: '불일치', phone: '01099991003', g: '남', b: '1990' }),                                  // 행4
  A({ name: '빠짐갑', phone: '01099991004' }),                                                       // 행5
  A({ name: '지난갑', phone: '01099991005', round: '3회차 | 예술의 곁 | 10/19-21' }),               // 행6: 종료된 회차
  A({ name: '탈락갑', phone: '01099991006', pass: '불합격' }),                                       // 행7
  A({ name: '취소갑', phone: '01099991007', cancel: '사정' })]).plan;                                // 행8
test('★ 저장 대상(합격·신규·종료 전)에만 저장되고, 형식 오류·대조 불일치·번호 없음은 저장되지 않는다', () => {
  const plan = rrnPlan();
  const out = L.planRrnWrites(plan, [
    { rowNo: 2, rrn: '900101-1234567' }, { rowNo: 3, rrn: '9001011' }, { rowNo: 4, rrn: '900101-2234567' },
    { rowNo: 6, rrn: '900101-1234567' }, { rowNo: 7, rrn: '900101-1234567' }, { rowNo: 8, rrn: '900101-1234567' }], SESSIONS);
  const st = Object.fromEntries(out.status.map(s => [s.rowNo, s.state]));
  assert.deepStrictEqual(st, { 2: 'saved', 3: 'invalid', 4: 'mismatch', 5: 'missing', 6: 'skipped_ineligible', 8: 'skipped_ineligible' });
  assert.strictEqual(out.writes.length, 1);
  assert.strictEqual(out.writes[0].rowNo, 2);
  assert.strictEqual(out.writes[0].rrn, '900101-1234567');
  assert.strictEqual(out.writes[0].session_end, '2026-12-09');
  assert.deepStrictEqual(J(out.counts), { saved: 1, skipped_ineligible: 2, invalid: 1, mismatch: 1, missing: 1 });
});
test('대조에 걸린 번호도 "그대로 저장"을 선택하면 저장된다. 형식 오류는 선택해도 저장되지 않는다', () => {
  const plan = rrnPlan();
  const out = L.planRrnWrites(plan, [{ rowNo: 4, rrn: '900101-2234567', confirmMismatch: true }, { rowNo: 3, rrn: '9001011', confirmMismatch: true }], SESSIONS);
  assert.strictEqual(out.status.find(s => s.rowNo === 4).state, 'saved');
  assert.strictEqual(out.status.find(s => s.rowNo === 3).state, 'invalid');
  assert.strictEqual(out.writes.length, 1);
});
test('숫자 칸의 앞 0이 지워진 번호도 되살려 저장한다', () => {
  const plan = parseAndPlan([A({ name: '영갑', phone: '01099991010', g: '남', b: '2001', rrn: '' })]).plan;
  const out = L.planRrnWrites(plan, [{ rowNo: 2, rrn: 101013234567 }], SESSIONS);
  assert.strictEqual(out.writes[0].rrn, '010101-3234567');
});
test('★ 결과 상태·집계에는 번호 값이 없다 (writes 만 값을 가진다)', () => {
  const plan = rrnPlan();
  const out = L.planRrnWrites(plan, [{ rowNo: 2, rrn: '900101-1234567' }, { rowNo: 3, rrn: '9001011' }], SESSIONS);
  assert.ok(!JSON.stringify([out.status, out.counts]).match(/\d{6}|\d{7}/));
});
test('존재하지 않는 행 번호의 번호는 무시한다', () => {
  const out = L.planRrnWrites(rrnPlan(), [{ rowNo: 99, rrn: '900101-1234567' }], SESSIONS);
  assert.strictEqual(out.writes.length, 0);
});

console.log('2단계: 보험 명단');
const INS_ENR = [
  { enroll_id: 'a', session_id: 'w9', person_id: 'pa', pass: '합격', cancel_reason: '' },
  { enroll_id: 'b', session_id: 'w9', person_id: 'pb', pass: '합격', cancel_reason: '' },
  { enroll_id: 'c', session_id: 'w9', person_id: 'pc', pass: '합격', cancel_reason: '사정' },
  { enroll_id: 'd', session_id: 'w1', person_id: 'pd', pass: '합격', cancel_reason: '' }];
const INS_PEOPLE = [{ person_id: 'pa', name: '갑' }, { person_id: 'pb', name: '을' }, { person_id: 'pc', name: '병' }, { person_id: 'pd', name: '정' }];
test('그 회차의 합격·취소 아님·번호 있음만 명단에, 번호가 없는 사람은 이름만 따로', () => {
  const r = L.buildInsuranceRows(INS_ENR, INS_PEOPLE, [{ enroll_id: 'a', rrn: '900101-1234567' }, { enroll_id: 'c', rrn: '900101-1234567' }, { enroll_id: 'd', rrn: '900101-1234567' }], 'w9');
  assert.deepStrictEqual(J(r.list.map(x => [x.name, x.rrn])), [['갑', '900101-1234567']]);
  assert.deepStrictEqual(J(r.excluded.map(x => x.name)), ['을']);
});
test('명단은 입력한 순서(참여 기록 순서)를 따른다', () => {
  const r = L.buildInsuranceRows(INS_ENR, INS_PEOPLE, [{ enroll_id: 'b', rrn: '950101-2234567' }, { enroll_id: 'a', rrn: '900101-1234567' }], 'w9');
  assert.deepStrictEqual(J(r.list.map(x => x.name)), ['갑', '을']);
});

console.log('2단계: 자동 정리 날짜');
test('개월 더하기: 말일 보정과 해 넘김', () => {
  assert.strictEqual(L.addMonths('2026-10-28', 3), '2027-01-28');
  assert.strictEqual(L.addMonths('2026-11-30', 3), '2027-02-28');
  assert.strictEqual(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(L.addMonths('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(L.addMonths('2026-12-15', 1), '2027-01-15');
  assert.strictEqual(L.addMonths('날짜 아님', 3), '');
});
test('★ 회차 종료 3개월이 "지난" 번호만 정리 대상 (당일까지는 보관)', () => {
  const rows = [{ enroll_id: 'x', session_end: '2026-10-28' }];
  assert.deepStrictEqual(L.rrnPurgeCandidates(rows, '2027-01-27', 3), []);
  assert.deepStrictEqual(L.rrnPurgeCandidates(rows, '2027-01-28', 3), []);
  assert.deepStrictEqual(L.rrnPurgeCandidates(rows, '2027-01-29', 3), ['x']);
});
test('종료일이 비었거나 이상한 행은 정리 대상으로 잡지 않는다', () => {
  assert.deepStrictEqual(L.rrnPurgeCandidates([{ enroll_id: 'y', session_end: '' }, { enroll_id: 'z', session_end: 'x' }], '2030-01-01', 3), []);
});

console.log('2단계: 문구·프로그램 설정 검증');
test('문구는 이름·단계·프로그램·방식·본문이 규칙에 맞아야 저장된다', () => {
  const ok = L.validateTemplate({ name: ' 입금 요청 ', stage: 'pay', program_id: 'w', channel: 'sms', body: '[곁마을] {이름}님 입금 부탁드려요' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.clean.name, '입금 요청');
  assert.strictEqual(L.validateTemplate({ name: '공통', stage: 'm1', program_id: 'all', channel: 'mail', body: 'x' }).ok, true);
  ['stage', 'program_id', 'channel'].forEach(k => {
    const t = { name: 'a', stage: 'pay', program_id: 'w', channel: 'sms', body: 'x' }; t[k] = '잘못';
    assert.strictEqual(L.validateTemplate(t).ok, false, k);
  });
  assert.strictEqual(L.validateTemplate({ name: '', stage: 'pay', program_id: 'w', channel: 'sms', body: 'x' }).ok, false);
  assert.strictEqual(L.validateTemplate({ name: 'a', stage: 'pay', program_id: 'w', channel: 'sms', body: '' }).ok, false);
  assert.strictEqual(L.validateTemplate({ name: 'a', stage: 'pay', program_id: 'w', channel: 'sms', body: 'x'.repeat(2001) }).ok, false);
  assert.strictEqual(L.validateTemplate(null).ok, false);
});
test('★ 문구 본문에 주민번호 모양이 있으면 저장하지 않는다', () => {
  const r = L.validateTemplate({ name: 'a', stage: 'pay', program_id: 'w', channel: 'sms', body: '번호는 900101-1234567 입니다' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.body);
});
test('만족도 폼 링크: 비우기·http(s)만 허용', () => {
  assert.deepStrictEqual(J(L.validateProgramForm('')), { ok: true, value: '' });
  assert.strictEqual(L.validateProgramForm(' https://forms.gle/abc123 ').value, 'https://forms.gle/abc123');
  assert.strictEqual(L.validateProgramForm('http://example.com/x').ok, true);
  ['forms.gle/abc', 'javascript:alert(1)', 'ftp://x.com', 'https://a b.com', 'https://' + 'a'.repeat(300) + '.com'].forEach(u => assert.strictEqual(L.validateProgramForm(u).ok, false, u));
});

/* ===================== 2단계: 화면 계산 (주민번호 열 분리, 할 일) ===================== */
console.log('2단계: 화면 — 주민번호 열 분리');
test('★ 머리글의 "주민번호" 열을 떼어내 값은 따로 모으고, 행에서는 비운다 (행 번호·열 순서 유지)', () => {
  const rows = J([AHEAD, A({ name: '분리갑', rrn: '900101-1234567' }), A({ name: '분리을', rrn: 9001011234567 }), A({ name: '빈칸갑', rrn: '' })]);
  const r = G.splitRrnColumn(rows);
  assert.strictEqual(r.count, 1);
  assert.deepStrictEqual(J(r.rrns.map(x => x.rowNo)), [2, 3]);
  assert.strictEqual(r.rrns[0].raw, '900101-1234567');
  assert.strictEqual(r.rows.length, rows.length);
  assert.strictEqual(r.rows[1].length, rows[1].length);
  assert.ok(!JSON.stringify(r.rows).includes('900101'));
  assert.strictEqual(G.rowsHaveRrn(r.rows), false);
  assert.strictEqual(r.rows[1][1], '분리갑');
});
test('남긴 말에 "주민번호"라는 말이 있어도 그 열을 주민번호 열로 오해하지 않는다', () => {
  const rows = J([AHEAD, A({ name: '말갑', memo: '주민번호는 다시 보낼게요', rrn: '900101-1234567' })]);
  const r = G.splitRrnColumn(rows);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.rows[1][11], '주민번호는 다시 보낼게요');
});
test('머리글 행이 없으면 아무것도 떼지 않는다', () => {
  const r = G.splitRrnColumn([['a', 'b'], ['900101-1234567', 'x']]);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.rrns.length, 0);
});
test('떼어낸 행은 서버가 그대로 읽을 수 있고, 행 번호가 일치한다', () => {
  const rows = J([AHEAD, A({ name: '일치갑', rrn: '900101-1234567' })]);
  const r = G.splitRrnColumn(rows);
  const parsed = L.parseApplicationSheet(r.rows);
  assert.strictEqual(parsed.rows[0].rowNo, r.rrns[0].rowNo);
  assert.strictEqual(L.sanitizeLegacyRows(J(r.rows)).ok, true);
});
test('주민번호 열을 못 떼어내 값이 남아 있으면 서버가 거부한다 (이중 안전장치)', () => {
  assert.strictEqual(L.sanitizeLegacyRows(J([AHEAD, A({ name: '남음갑', rrn: '900101-1234567' })])).ok, false);
});

console.log('2단계: 화면 — 할 일');
const TD = (o) => Object.assign({ today: '2026-11-19', config: { refund_days: 3 }, sessions: [], enrollments: [] }, o);
const E = (id, sid, o = {}) => Object.assign({ enroll_id: id, session_id: sid, pass: '합격', cancel_reason: '', m1_at: '', pay_at: '', ins_at: '', m2_at: '', attend: '' }, o);
test('곧 시작하는 회차: 주민번호 → 보험 → 입금 → 환불 기한 → 1차 안내 순으로 우선순위를 낸다', () => {
  const boot = TD({
    sessions: [{ session_id: 'w9', program_id: 'w', n: 9, start: '2026-11-22', end: '2026-11-24' }],
    enrollments: [E('a', 'w9', { ins_at: '2026-11-10', pay_at: '2026-11-10', m1_at: '2026-11-10' }), E('b', 'w9'), E('c', 'w9')],
    rrnStatus: { a: 'ok', b: 'missing', c: 'check' }
  });
  const t = G.todoList(boot);
  assert.deepStrictEqual(Array.from(t, x => x.kind), ['rrn', 'ins', 'pay', 'refund', 'm1']);
  assert.deepStrictEqual(Array.from(t, x => x.n), [2, 2, 2, 3, 2]);
  assert.strictEqual(t[0].sev, 'bad');
  assert.strictEqual(t[3].sev, 'warn');
});
test('주민번호 상태 정보가 없으면 주민번호 항목은 만들지 않는다', () => {
  const t = G.todoList(TD({ sessions: [{ session_id: 'w9', start: '2026-11-22', end: '2026-11-24' }], enrollments: [E('b', 'w9')] }));
  assert.ok(!t.some(x => x.kind === 'rrn'));
});
test('취소·불합격은 할 일에서 빠지고, 멀리 있는 회차는 해당 기준 밖이면 나오지 않는다', () => {
  const boot = TD({
    sessions: [{ session_id: 'w9', start: '2026-11-24', end: '2026-11-26' }, { session_id: 'w10', start: '2027-01-10', end: '2027-01-12' }],
    enrollments: [E('a', 'w9', { cancel_reason: '사정' }), E('b', 'w9', { ins_at: 'x', pay_at: 'x', m1_at: 'x' }), E('c', 'w10')],
    rrnStatus: { b: 'ok', c: 'missing' }
  });
  assert.deepStrictEqual(J(G.todoList(boot)), []);
});
test('종료된 회차: 30일 안이면 참석 정리, 14일 안이면 참석자 중 만족도 미응답', () => {
  const sessions = [{ session_id: 'w1', start: '2026-11-10', end: '2026-11-12' }];       // 7일 전에 종료
  const boot = TD({ sessions, enrollments: [E('a', 'w1', { attend: '참석', sat_at: '' }), E('b', 'w1', { attend: '참석', sat_at: '2026-11-13' }), E('c', 'w1', { attend: '' }), E('d', 'w1', { attend: '불참', sat_at: '' })] });
  const t = G.todoList(boot);
  assert.deepStrictEqual(Array.from(t, x => [x.kind, x.n]).sort(), [['attend', 1], ['sat', 1]]);
  const old = TD({ sessions: [{ session_id: 'w0', start: '2026-09-01', end: '2026-09-03' }], enrollments: [E('a', 'w0', { attend: '' })] });
  assert.deepStrictEqual(J(G.todoList(old)), []);                                          // 50일이 지난 회차는 알리지 않는다
});
test('만족도 열(sat_at)이 아직 없는 데이터에서는 만족도 항목을 만들지 않는다', () => {
  const boot = TD({ sessions: [{ session_id: 'w1', start: '2026-11-10', end: '2026-11-12' }], enrollments: [E('a', 'w1', { attend: '참석' })] });
  assert.ok(!G.todoList(boot).some(x => x.kind === 'sat'));
});

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
