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

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
