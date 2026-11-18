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
  looksLikeRrn, blankRrnColumns, rowsHaveRrn, trimRows })`, lctx);

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

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
