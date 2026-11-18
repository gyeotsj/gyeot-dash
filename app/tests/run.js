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
  normalizeEmail, findActiveStaff, digitsOnly, looksLikeRrn, containsRrn,
  rowsToObjects, objectToRow, validateHeader, schemaProblems, formatKst, makeId,
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

console.log('시간·ID');
test('한국 시간으로 표시한다 (UTC+9)', () => {
  assert.strictEqual(L.formatKst(new Date(Date.UTC(2026, 9, 9, 15, 30, 0))), '2026-10-10 00:30:00');
  assert.strictEqual(L.formatKst(new Date(Date.UTC(2026, 0, 1, 0, 0, 5))), '2026-01-01 09:00:05');
});
test('ID는 접두어로 시작하고 매번 다르다', () => {
  const a = L.makeId('e_'), b = L.makeId('e_');
  assert.ok(a.startsWith('e_') && a !== b);
});

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
