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
  parseSheetId, validateProgramInput, satColumns, parseSatRound, matchResponses, oneEdit_, purgeCandidates, buildPurgeStats, mergeStatsRow,
  planSchemaMigration, rrnOrphanIds, hoursBetween, sweepStatus, buildInsuranceList, messageTargets, validateMessageLog, MESSAGE_FILTERS, sanitizeApplicationPayload, hashText_, collapseFills, buildUploadManifest, planUndo,
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
test('운영 DB 탭 12개가 모두 있다', () => {
  const expected = ['Programs', 'Sessions', 'People', 'Enrollments', 'SatMatches', 'Staff',
    'MessageLog', 'Templates', 'AuditLog', 'Config', 'Uploads', 'Stats'];
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
const SERVER_FILES = ['Api.gs', 'Legacy.gs', 'Staff.gs', 'Code.gs', 'Setup.gs', 'SelfTest.gs', 'Rrn.gs', 'Applications.gs', 'Insurance.gs', 'Messages.gs', 'Triggers.gs', 'Satisfaction.gs', 'Privacy.gs'];
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
const NO_GUARD_OK = { doGet: '진입점(내부에서 접속자·운영진 확인)', include: '화면 틀 파일을 끼워 넣는 도우미(데이터 없음)', setup: '본문에서 소유자 이메일을 직접 확인', sweepRrn: '소유자의 시간 트리거가 부르는 함수 (맨 앞에서 실행 계정이 소유자인지 확인)' };
const OWNER_ONLY = ['backupNow', 'previewLegacyImport', 'commitLegacyImport', 'undoLegacyImport', 'listStaff', 'addStaff', 'removeStaff', 'fixStaffSharing', 'getSystemStatus', 'runSelfTest', 'scanForRrn', 'migrateSchema', 'purgeExpired'];

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
test('★ sweepRrn 은 맨 앞에서 실행 계정이 소유자인지 확인하고 아니면 던진다 (운영진이 화면에서 부를 수 없다)', () => {
  const f = PUBLIC.find(x => x.name === 'sweepRrn');
  assert.ok(f, 'sweepRrn 을 찾지 못함');
  assert.ok(/effectiveEmail_\(\)\s*!==\s*normalizeEmail\(OWNER_EMAIL\)/.test(f.first), '첫 실행문: ' + f.first);
  assert.ok(/throw/.test(f.first));
});
test('setup 은 소유자 이메일이 아니면 중단한다', () => {
  const f = PUBLIC.find(x => x.name === 'setup');
  assert.ok(/OWNER_EMAIL/.test(f.body) && /throw/.test(f.body));
});
test('새로 추가된 서버 함수가 목록에 빠지지 않도록, 예외·소유자 전용이 아닌 함수는 일반 운영진용으로 센다', () => {
  const normal = PUBLIC.filter(f => !NO_GUARD_OK[f.name] && !OWNER_ONLY.includes(f.name)).map(f => f.name).sort();
  assert.deepStrictEqual(normal, ['applySatisfaction', 'bulkSetStep', 'commitApplications', 'completeInsurance', 'deleteSession', 'deleteTemplate', 'getBootstrap', 'getInsuranceList', 'listUploads', 'logMessage', 'previewApplications', 'previewPurge', 'previewSatisfaction', 'previewUndoUpload', 'saveProgram', 'saveSession', 'saveTemplate', 'setRrn', 'setStep', 'undoUpload', 'unlinkResponse', 'updateEnrollment', 'updatePerson'].sort());
});

console.log('구글이 파일을 읽는 순서 (이름 순서) 로 불러도 멈추지 않는다');
test('★ 모든 .gs 를 이름 순서(Lib → Rrn → Schema …)로 하나씩 불러도 오류가 없다 (최상위에서 Schema 값을 쓰면 STAGES is not defined)', () => {
  const ctx = vm.createContext({ console });
  fs.readdirSync(appDir).filter(f => f.endsWith('.gs')).sort().forEach(f => {
    try { vm.runInContext(fs.readFileSync(path.join(appDir, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { assert.fail(f + ' 를 읽다가 멈춤: ' + e.message); }
  });
  assert.ok(vm.runInContext('typeof validateTemplate === "function" && typeof rrnCols_ === "function"', ctx));
});

console.log('주민번호: 코드를 읽어 새는 길이 없는지 검사 (R1·R2)');
/** 모든 .gs 파일을 최상위 함수 단위로 쪼갠다: [{file, name, body}] */
function allFunctions() {
  const out = [];
  fs.readdirSync(appDir).filter(f => f.endsWith('.gs')).forEach(f => {
    const src = fs.readFileSync(path.join(appDir, f), 'utf8');
    const re = /^function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/gm;
    const hits = []; let m;
    while ((m = re.exec(src))) hits.push({ name: m[1], at: m.index });
    hits.forEach((h, i) => out.push({ file: f, name: h.name, body: src.slice(h.at, i + 1 < hits.length ? hits[i + 1].at : src.length) }));
  });
  return out;
}
const ALL_FN = allFunctions();
const callersOf = fn => ALL_FN.filter(f => f.name !== fn && f.body.indexOf(fn + '(') >= 0 && f.file !== 'SelfTest.gs').map(f => f.name).sort();
test('번호 값을 읽는 rrnReadAll_ 은 rrnStatusMap_·getInsuranceList 에서만 부른다', () => {
  assert.ok(ALL_FN.some(f => f.name === 'rrnReadAll_'));
  callersOf('rrnReadAll_').forEach(n => assert.ok(['rrnStatusMap_', 'getInsuranceList'].includes(n), '허용되지 않은 호출: ' + n));
});
test('번호를 쓰는 rrnUpsertUnlocked_ 는 setRrn·commitApplications 에서만 부른다', () => {
  callersOf('rrnUpsertUnlocked_').forEach(n => assert.ok(['setRrn', 'commitApplications'].includes(n), '허용되지 않은 호출: ' + n));
});
test('getBootstrap 은 주민번호 값을 읽지 않고 상태 계산만 부른다', () => {
  const f = ALL_FN.find(x => x.name === 'getBootstrap');
  assert.ok(!/rrnReadAll_|rrnReadMeta_/.test(f.body) && /rrnStatusMap_/.test(f.body));
});
test('audit_·console·Logger·apiError·new Error 한 줄에 번호 변수(rrn)가 들어가지 않는다', () => {
  const bad = [];
  fs.readdirSync(appDir).filter(f => f.endsWith('.gs') && f !== 'SelfTest.gs').forEach(f => {
    fs.readFileSync(path.join(appDir, f), 'utf8').split('\n').forEach((line, i) => {
      if (!/audit_\(|console\.|Logger\.|apiError\(|new Error\(/.test(line)) return;
      const noStr = line.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
      if (/\b(rrn|rrns)\b/.test(noStr)) bad.push(f + ':' + (i + 1));
    });
  });
  assert.deepStrictEqual(bad, []);
});
test('운영 DB 정의(SCHEMA)에는 주민번호를 담는 열이 없다', () => {
  Object.keys(L.SCHEMA || {}).forEach(tab => (L.SCHEMA[tab].cols || []).forEach(c => assert.ok(!/rrn/i.test(c), tab + '.' + c)));
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
  looksLikeRrn, blankRrnColumns, rowsHaveRrn, trimRows, validateRrn, rrnMatchesProfile, splitRrnColumn, todoList, RRN_CODE_LABELS, classifyRrn, rrnCodeText, buildRrnPayload, DECISION_TEXT, FILL_LABELS, satKpi, STEP_COLS, todoTitle, urgentTodoCount, messageTargets, fillTemplate, pickSavedTemplate, filterLibrary, smsBytes, smsKind, STAGE_INFO, FILTER_TEXT })`, lctx);

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

console.log('2단계: 만족도 응답 열과 스키마 확장');
test('만족도 열 sat_at 은 참여 기록의 맨 끝 열이고 글자 서식이다 (기존 열 순서를 바꾸지 않았다)', () => {
  const cols = L.SCHEMA.Enrollments.cols;
  assert.strictEqual(cols[cols.length - 1], 'sat_at');
  assert.strictEqual(cols[cols.length - 2], 'updated_by');
  assert.ok(L.SCHEMA.Enrollments.text.includes('sat_at'));
});
test('만족도 단계: 체크하면 오늘 날짜, 끄면 빈칸, 시도 때 이상한 값은 거부', () => {
  assert.deepStrictEqual(J(L.stepPatch('sat', true, '2026-11-20')), { sat_at: '2026-11-20' });
  assert.deepStrictEqual(J(L.stepPatch('sat', false, '2026-11-20')), { sat_at: '' });
});
test('만족도 열은 직접 고칠 수 없다 (updateEnrollment 허용 목록에 없다)', () => {
  assert.strictEqual(L.validatePatch(L.ENROLLMENT_EDITABLE, { sat_at: '2026-01-01' }).ok, false);
});
test('스키마 확장 계획: 머리글이 정의의 앞부분이면 빠진 뒤쪽 열만 덧붙인다', () => {
  const cols = L.SCHEMA.Enrollments.cols;
  const old = cols.slice(0, -1);
  const p = L.planSchemaMigration(cols, old.concat(['', '']));
  assert.deepStrictEqual(J(p), { ok: true, add: ['sat_at'], problem: '' });
  assert.deepStrictEqual(J(L.planSchemaMigration(cols, cols)).add, []);
});
test('스키마 확장 계획: 열 이름·순서가 다르거나 정의에 없는 열이 있거나 머리글이 비면 건드리지 않는다', () => {
  const cols = L.SCHEMA.Enrollments.cols;
  const swapped = cols.slice(0, -1); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.strictEqual(L.planSchemaMigration(cols, swapped).ok, false);
  assert.strictEqual(L.planSchemaMigration(cols, cols.concat(['여분'])).ok, false);
  assert.strictEqual(L.planSchemaMigration(cols, ['', '']).ok, false);
  assert.strictEqual(L.planSchemaMigration(cols, ['', '']).add.length, 0);
});

test('★ 연락처는 같은데 이름이 다른 사람이 이미 있으면 새 사람으로 만들되 경고하고 사유를 붙인다 (이름·연락처는 문구에 없다)', () => {
  const { plan } = parseAndPlan([A({ name: '기존갑갑', phone: '010-2222-0001', round: '1회차 | 10/6-8' })]);
  assert.strictEqual(plan.rows[0].decision, 'new');
  assert.ok(/같은 연락처/.test(plan.rows[0].reason));
  assert.ok(plan.warnings.some(w => /같은 연락처/.test(w) && /표의 2행/.test(w)));
  assert.ok(!JSON.stringify(plan.warnings).includes('기존갑갑') && !JSON.stringify(plan.warnings).includes('2222'));
});
test('이름과 연락처가 모두 같으면 경고가 없다 / 아예 새 사람이면 경고가 없다', () => {
  const a = parseAndPlan([A({ name: '기존갑', phone: '010-2222-0001', round: '1회차 | 10/6-8' })]).plan;
  assert.ok(!a.warnings.some(w => /같은 연락처/.test(w)) && a.rows[0].decision === 'existing');
  const b = parseAndPlan([A({ name: '완전새사람', phone: '010-9999-8888', round: '9회차 | 마을의 곁 | 12/7-9' })]).plan;
  assert.ok(!b.warnings.some(w => /같은 연락처/.test(w)) && !b.rows[0].reason);
});
console.log('2단계: 업로드 요청 검사·채운 칸 정리·되돌리기 계획');
const goodPayload = (over = {}) => Object.assign({ rows: [AHEAD, A({ rrn: '' })], programId: 'w', sessionMap: { 3: 'w3', x: 'bad' }, applyAttend: true, rrns: [{ rowNo: 2, rrn: '900101-2234567', confirmMismatch: false }] }, over);
test('해시: 같은 글자는 같고 다른 글자는 다르다 (값을 되돌릴 수는 없는 짧은 지문)', () => {
  assert.strictEqual(L.hashText_('프리랜서'), L.hashText_('프리랜서'));
  assert.notStrictEqual(L.hashText_('프리랜서'), L.hashText_('프리랜서 '));
  assert.strictEqual(L.hashText_('').length, 8);
  assert.strictEqual(L.hashText_(1990), L.hashText_('1990'));
});
test('업로드 요청: 정상 요청은 통과하고 행 번호가 아닌 키는 버린다', () => {
  const r = L.sanitizeApplicationPayload(goodPayload());
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(J(r.value.sessionMap), { 3: 'w3' });
  assert.strictEqual(r.value.rrns.length, 1);
  assert.strictEqual(r.value.applyAttend, true);
});
test('★ 업로드 요청: 본문 행에 주민번호 모양이 있으면 거부 (rrns 칸은 허용)', () => {
  const r = L.sanitizeApplicationPayload(goodPayload({ rows: [AHEAD, A({ rrn: '900101-2234567' })] }));
  assert.strictEqual(r.ok, false);
  assert.ok(!JSON.stringify(r).includes('900101'), '오류에 번호가 있음');
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rows: [AHEAD, A({ memo: '번호는 9001012234567 입니다' })] })).ok, false);
});
test('업로드 요청: 프로그램·형식·행 수 검사', () => {
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ programId: 'z' })).ok, false);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rows: 'x' })).ok, false);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rows: new Array(601).fill([]) })).ok, false);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rrns: 'x' })).ok, false);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rrns: [{ rowNo: 0, rrn: '1' }] })).ok, false);
  assert.strictEqual(L.sanitizeApplicationPayload(null).ok, false);
});
test('업로드 요청: 참석 옵션은 기본 켜짐, 끄면 꺼짐. 확인 선택은 true 일 때만', () => {
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ applyAttend: undefined })).value.applyAttend, true);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ applyAttend: false })).value.applyAttend, false);
  assert.strictEqual(L.sanitizeApplicationPayload(goodPayload({ rrns: [{ rowNo: 2, rrn: 'x', confirmMismatch: 'yes' }] })).value.rrns[0].confirmMismatch, false);
});
test('채움 합치기: 같은 칸이 두 번 나오면 하나로, 동의는 더 제한적인 값으로', () => {
  const f = (field, from, to) => ({ table: 'People', id: 'p1', field, from, to });
  const c = L.collapseFills([f('consent_retain', '', 'Y'), f('consent_retain', '', 'N'), f('job', '', '가'), f('job', '', '나')]);
  const by = {}; c.forEach(x => { by[x.field] = x; });
  assert.strictEqual(by.consent_retain.to, 'N');
  assert.strictEqual(by.job.to, '가');
  assert.strictEqual(c.length, 2);
  assert.strictEqual(L.collapseFills([f('job', '가', '가')]).length, 0);
});

/** 계획을 메모리 안에서 실제 적용한 것처럼 만든다 (서버가 시트에 쓰는 일과 같은 효과) */
function applyPlanInMemory(plan, existing) {
  const cur = J(existing);
  plan.newPeople.forEach(p => cur.people.push(J(p)));
  plan.newEnrollments.forEach(e => cur.enrollments.push(J(e)));
  const fills = L.collapseFills(plan.fills);
  fills.forEach(f => {
    const row = (f.table === 'People' ? cur.people : cur.enrollments).find(x => x[f.table === 'People' ? 'person_id' : 'enroll_id'] === f.id);
    row[f.field] = f.to;
  });
  plan.sessionNotes.forEach(n => { cur.sessions.find(s => s.session_id === n.session_id).note = n.to; });
  return { cur, fills };
}
const undoRows = () => [
  A({ name: '기존갑', phone: '01022220001', round: '1회차 | 10/6-8', job: '프리랜서', hp: '77' }),
  A({ name: '신규갑', phone: '01033330001', round: '9회차 | 마을의 곁 | 12/7-9' })];
test('되돌리기 기록에는 ID와 해시만 있고 이름·연락처·직업이 없다', () => {
  const { plan } = parseAndPlan(undoRows());
  const fills = L.collapseFills(plan.fills);
  const m = L.buildUploadManifest(plan, fills, ['e1']);
  const text = JSON.stringify(m);
  ['기존갑', '신규갑', '01033330001', '010-3333-0001', '프리랜서', '900101'].forEach(s => assert.ok(!text.includes(s), s));
  assert.ok(m.f.length >= 2 && m.e.length === 1 && m.p.length === 1);
  assert.ok(m.f.every(x => x.length === 5 && /^[0-9a-f]{8}$/.test(x[4])));
});
test('★ 되돌리기: 만든 참여 기록·사람을 지우고, 채운 칸은 원래대로, 회차 메모도 원래대로', () => {
  const ex = mkExisting();
  const { plan } = parseAndPlan(undoRows(), {}, ex);
  assert.strictEqual(plan.newEnrollments.length, 1);
  const { cur, fills } = applyPlanInMemory(plan, ex);
  const m = L.buildUploadManifest(plan, fills, [plan.newEnrollments[0].enroll_id]);
  const u = L.planUndo(J(m), cur);
  assert.deepStrictEqual(J(u.delEnroll), [plan.newEnrollments[0].enroll_id]);
  assert.deepStrictEqual(J(u.delPeople), [plan.newPeople[0].person_id]);
  assert.strictEqual(u.skippedCells, 0);
  const cells = u.restores.map(r => r.field).sort();
  assert.ok(cells.includes('job') && cells.includes('hp_no') && cells.includes('consent_retain'), cells.join());
  assert.ok(u.restores.every(r => r.from === '' ), '채우기 전은 모두 빈칸');
  assert.strictEqual(u.noteRestores.length, 1);
  assert.strictEqual(u.noteRestores[0].from, '');
  assert.ok(u.rrnIds.includes(plan.newEnrollments[0].enroll_id));
  assert.strictEqual(u.counts.enrollments, 1); assert.strictEqual(u.counts.people, 1);
});
test('★ 되돌리기: 그 뒤에 사람이 고친 칸은 건드리지 않고 센다', () => {
  const ex = mkExisting();
  const { plan } = parseAndPlan(undoRows(), {}, ex);
  const { cur, fills } = applyPlanInMemory(plan, ex);
  cur.people.find(p => p.person_id === 'p1').job = '나중에 고친 직업';
  const u = L.planUndo(J(L.buildUploadManifest(plan, fills, [])), cur);
  assert.ok(!u.restores.some(r => r.field === 'job'));
  assert.strictEqual(u.skippedCells, 1);
});
test('되돌리기: 새 사람이 다른 참여 기록에도 있으면 사람은 남긴다', () => {
  const ex = mkExisting();
  const { plan } = parseAndPlan(undoRows(), {}, ex);
  const { cur, fills } = applyPlanInMemory(plan, ex);
  cur.enrollments.push({ enroll_id: 'later', session_id: 'w3', person_id: plan.newPeople[0].person_id });
  const u = L.planUndo(J(L.buildUploadManifest(plan, fills, [])), cur);
  assert.deepStrictEqual(J(u.delPeople), []);
  assert.strictEqual(u.keptPeople, 1);
  assert.strictEqual(u.delEnroll.length, 1);
});
test('되돌리기: 지워지는 참여 기록에 나중에 입력한 주민번호도 정리 대상에 든다 / 두 번 해도 안전', () => {
  const ex = mkExisting();
  const { plan } = parseAndPlan(undoRows(), {}, ex);
  const { cur, fills } = applyPlanInMemory(plan, ex);
  const m = J(L.buildUploadManifest(plan, fills, []));
  const u = L.planUndo(m, cur);
  assert.ok(u.rrnIds.includes(plan.newEnrollments[0].enroll_id));
  // 이미 지운 뒤 다시 계획하면 지울 것이 없다
  const after = { people: cur.people.filter(p => !u.delPeople.includes(p.person_id)), enrollments: cur.enrollments.filter(e => !u.delEnroll.includes(e.enroll_id)), sessions: cur.sessions };
  const again = L.planUndo(m, after);
  assert.strictEqual(again.counts.enrollments, 0); assert.strictEqual(again.counts.people, 0);
});
test('되돌리기: 동의 칸은 채우기 전 값(Y/N)으로 돌아간다', () => {
  const ex = mkExisting();   // p3: 추가 보유 N, 초상권 빈칸
  const { plan } = parseAndPlan([A({ name: '기존병', phone: '01022220003', round: '1회차 | 아무 | 10/6-8', portrait: '동의', retain: '동의' })], {}, ex);
  const { cur, fills } = applyPlanInMemory(plan, ex);
  const p3 = cur.people.find(p => p.person_id === 'p3');
  assert.strictEqual(p3.consent_retain, 'N');         // 더 제한적인 쪽(N) 유지
  assert.strictEqual(p3.consent_portrait, 'Y');       // 빈칸이었으니 업로드 값
  const u = L.planUndo(J(L.buildUploadManifest(plan, fills, [])), cur);
  const r = u.restores.find(x => x.field === 'consent_portrait');
  assert.ok(r && r.from === '');
  assert.ok(!u.restores.some(x => x.field === 'consent_retain'));
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

test('명단 화면용: 이미 보험 완료한 사람은 빼고 센다, 신청서와 안 맞는 번호는 "확인 필요"로 제외, 번호 없음은 "missing"', () => {
  const people = [{ person_id: 'pa', name: '갑', gender: '여', birth_year: 1990 }, { person_id: 'pb', name: '을', gender: '남', birth_year: 1991 },
    { person_id: 'pc', name: '병', gender: '남', birth_year: 1992 }, { person_id: 'pd', name: '정', gender: '여', birth_year: 1993 }];
  const enr = [
    { enroll_id: 'a', session_id: 'w9', person_id: 'pa', pass: '합격', cancel_reason: '', ins_at: '' },
    { enroll_id: 'b', session_id: 'w9', person_id: 'pb', pass: '합격', cancel_reason: '', ins_at: '' },
    { enroll_id: 'c', session_id: 'w9', person_id: 'pc', pass: '합격', cancel_reason: '', ins_at: '' },
    { enroll_id: 'd', session_id: 'w9', person_id: 'pd', pass: '합격', cancel_reason: '', ins_at: '2026-11-01' }];
  const r = J(L.buildInsuranceList(enr, people, [{ enroll_id: 'a', rrn: '900101-2234567' }, { enroll_id: 'b', rrn: '910101-2234567' }], 'w9'));
  assert.deepStrictEqual(r.list.map(x => x.name), ['갑']);
  assert.deepStrictEqual(r.excluded.map(x => [x.name, x.reason]), [['을', 'check'], ['병', 'missing']]);
  assert.strictEqual(r.done, 1);
  assert.ok(!JSON.stringify(r.excluded).includes('910101'), '제외 목록에 번호가 있음');
});

console.log('2단계: 자동 정리 보조 규칙');
test('정리 누락: 참여 기록이 없거나 취소됐거나 보험 완료한 것만', () => {
  const enr = [
    { enroll_id: 'ok', cancel_reason: '', ins_at: '', pass: '합격' }, { enroll_id: 'cx', cancel_reason: '사정', ins_at: '', pass: '합격' },
    { enroll_id: 'in', cancel_reason: '', ins_at: '2026-11-01', pass: '합격' }, { enroll_id: 'rj', cancel_reason: '', ins_at: '', pass: '불합격' }];
  const rows = ['ok', 'cx', 'in', 'rj', 'gone'].map(id => ({ enroll_id: id }));
  assert.deepStrictEqual(J(L.rrnOrphanIds(rows, enr)), ['cx', 'in', 'rj', 'gone']);
  assert.deepStrictEqual(J(L.rrnOrphanIds([], enr)), []);
});
test('시간 차이: 시 단위, 읽을 수 없으면 NaN', () => {
  assert.strictEqual(L.hoursBetween('2026-11-18 09:00:00', '2026-11-19 21:00:00'), 36);
  assert.strictEqual(L.hoursBetween('2026-11-19 21:00:00', '2026-11-19 21:30:00'), 0.5);
  assert.ok(isNaN(L.hoursBetween('', '2026-11-19 21:00:00')));
});
test('★ 자동 정리 상태: 한 번도 안 돌았거나 36시간 넘게 기록이 없으면 경고', () => {
  const now = '2026-11-20 10:00:00';
  assert.strictEqual(L.sweepStatus('', now).stale, true);
  assert.strictEqual(L.sweepStatus('2026-11-20 03:00:00', now).stale, false);
  assert.strictEqual(L.sweepStatus('2026-11-18 22:00:00', now).stale, false);   // 36시간 딱
  assert.strictEqual(L.sweepStatus('2026-11-18 21:59:59', now).stale, true);    // 36시간 넘음
  assert.ok(/멈춰/.test(L.sweepStatus('2026-11-10 10:00:00', now).message));
  assert.strictEqual(L.sweepStatus('이상한 값', now).stale, true);
});

console.log('3단계: 만족도 응답 확인 규칙');
test('기수 칸 해석: "3기 | 10/19~21", "3기", "3회차", 날짜 없는 것, 못 읽는 것', () => {
  assert.deepStrictEqual(J(L.parseSatRound('3기 | 10/19~21')), { n: 3, startMD: '10-19', endMD: '10-21' });
  assert.deepStrictEqual(J(L.parseSatRound('5기 | 10/26~28')), { n: 5, startMD: '10-26', endMD: '10-28' });
  assert.deepStrictEqual(J(L.parseSatRound(' 2 기 ')), { n: 2, startMD: null, endMD: null });
  assert.deepStrictEqual(J(L.parseSatRound('3회차 | 10/19(월)-21(수)')), { n: 3, startMD: '10-19', endMD: '10-21' });
  assert.deepStrictEqual(J(L.parseSatRound('10/30~11/1 4기')), { n: 4, startMD: null, endMD: null });
  assert.strictEqual(L.parseSatRound(''), null);
  assert.strictEqual(L.parseSatRound(null), null);
  assert.strictEqual(L.parseSatRound('날짜 미정'), null);
});
test('한 글자 차이 판정', () => {
  assert.strictEqual(L.oneEdit_('박지후', '박지우'), true);
  assert.strictEqual(L.oneEdit_('박지후', '박지'), true);
  assert.strictEqual(L.oneEdit_('박지', '박지후'), true);
  assert.strictEqual(L.oneEdit_('박지후', '박지후'), false);
  assert.strictEqual(L.oneEdit_('박지후', '김서연'), false);
  assert.strictEqual(L.oneEdit_('박지후', '박'), false);
});
const SAT_EX = () => ({
  sessions: [{ session_id: 'w1', program_id: 'w', n: 1, start: '2026-10-06', end: '2026-10-08' }, { session_id: 'w2', program_id: 'w', n: 2, start: '2026-10-12', end: '2026-10-14' },
    { session_id: 'l1', program_id: 'l', n: 1, start: '2026-10-06', end: '2026-10-08' }],
  people: [{ person_id: 'p1', name: '김가나' }, { person_id: 'p2', name: '박지후' }, { person_id: 'p3', name: '이다라' }, { person_id: 'p4', name: '이다라' }, { person_id: 'p5', name: '최마바' }, { person_id: 'p6', name: '정사아' }],
  enrollments: [
    { enroll_id: 'e1', session_id: 'w1', person_id: 'p1', pass: '합격', cancel_reason: '', sat_at: '' }, { enroll_id: 'e2', session_id: 'w1', person_id: 'p2', pass: '합격', cancel_reason: '', sat_at: '' },
    { enroll_id: 'e3', session_id: 'w2', person_id: 'p3', pass: '합격', cancel_reason: '', sat_at: '' }, { enroll_id: 'e4', session_id: 'w2', person_id: 'p4', pass: '합격', cancel_reason: '', sat_at: '' },
    { enroll_id: 'e5', session_id: 'w1', person_id: 'p5', pass: '합격', cancel_reason: '사정', sat_at: '' }, { enroll_id: 'e6', session_id: 'w1', person_id: 'p6', pass: '합격', cancel_reason: '', sat_at: '2026-10-09' }]
});
const SR = (k, name, round) => ({ respKey: k, rowNo: Number(k.replace(/\D/g, '')) || 0, name, roundText: round, at: '2026-10-09 10:00:00' });
const mr = (resps, opts = {}) => J(L.matchResponses(resps, SAT_EX(), Object.assign({ program_id: 'w' }, opts)));
test('★ 응답 연결: 이름이 정확히 같고 그 회차에 한 명이면 auto, 공백·앞뒤 차이는 무시', () => {
  const r = mr([SR('r1', '김가나', '1기 | 10/6~8'), SR('r2', ' 박 지후 ', '1기')]);
  assert.deepStrictEqual(r.rows.map(x => [x.decision, x.enroll_id]), [['auto', 'e1'], ['auto', 'e2']]);
  assert.strictEqual(r.summary.auto, 2);
});
test('응답 연결: 동명이인은 후보를 주고, 한 글자 오타는 비슷한 이름 후보, 없으면 none', () => {
  const r = mr([SR('r1', '이다라', '2기'), SR('r2', '박지우', '1기'), SR('r3', '완전다른', '1기')]);
  assert.strictEqual(r.rows[0].decision, 'homonym'); assert.deepStrictEqual(r.rows[0].candidates.sort(), ['e3', 'e4']);
  assert.strictEqual(r.rows[1].decision, 'similar'); assert.deepStrictEqual(r.rows[1].candidates, ['e2']);
  assert.strictEqual(r.rows[2].decision, 'none');
});
test('응답 연결: 이미 응답 표시된 사람은 already, 같은 사람의 두 번째 응답은 duplicate, 처리한 응답은 synced', () => {
  const r = mr([SR('r1', '정사아', '1기'), SR('r2', '김가나', '1기'), SR('r3', '김가나', '1기'), SR('r4', '박지후', '1기')], { synced: { r4: true } });
  assert.deepStrictEqual(r.rows.map(x => x.decision), ['already', 'auto', 'duplicate', 'synced']);
});
test('응답 연결: 취소된 사람은 후보가 아니고, 기수를 못 읽거나 없는 회차·이름 없음은 따로 분류, 다른 프로그램 회차는 쓰지 않는다', () => {
  const r = mr([SR('r1', '최마바', '1기'), SR('r2', '김가나', ''), SR('r3', '김가나', '9기'), SR('r4', '', '1기')]);
  assert.deepStrictEqual(r.rows.map(x => x.decision), ['none', 'no_round', 'no_round', 'no_name']);
  const l = J(L.matchResponses([SR('r1', '김가나', '1기')], SAT_EX(), { program_id: 'l' }));
  assert.strictEqual(l.rows[0].decision, 'none');   // 살아보기 1회차에는 그 사람이 없다
});
test('★ 응답 연결 결과·요약에는 응답 내용이 없고 이름은 응답 이름 필드로만 오간다', () => {
  const r = L.matchResponses([{ respKey: 'r1', rowNo: 2, name: '김가나', roundText: '1기', at: 'x', answers: '아주 만족했어요', photo: 'secret.jpg' }], SAT_EX(), { program_id: 'w' });
  const text = JSON.stringify(r);
  assert.ok(!text.includes('아주 만족') && !text.includes('secret.jpg') && !text.includes('김가나'));
});

test('응답 시트 주소·ID 해석', () => {
  const id = '1FakeSheetId0000000000000000000000000000000';
  assert.strictEqual(L.parseSheetId('https://docs.google.com/spreadsheets/d/' + id + '/edit?usp=drivesdk'), id);
  assert.strictEqual(L.parseSheetId('  ' + id + ' '), id);
  assert.strictEqual(L.parseSheetId(''), '');
  assert.strictEqual(L.parseSheetId(null), '');
  assert.strictEqual(L.parseSheetId('짧은값'), null);
  assert.strictEqual(L.parseSheetId('https://example.com/abc'), null);
});
test('프로그램 설정 검사: 들어온 항목만 검사하고 잘못된 항목은 막는다', () => {
  const id = '1FakeSheetId0000000000000000000000000000000';
  assert.deepStrictEqual(J(L.validateProgramInput({ form_sheet_id: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' }).clean), { form_sheet_id: id });
  assert.strictEqual(L.validateProgramInput({ form_url: 'javascript:alert(1)' }).ok, false);
  assert.strictEqual(L.validateProgramInput({ form_sheet_id: '잘못' }).ok, false);
  assert.strictEqual(L.validateProgramInput({ form_tab: 'x'.repeat(61) }).ok, false);
  assert.deepStrictEqual(J(L.validateProgramInput({ form_url: '' }).clean), { form_url: '' });
  assert.deepStrictEqual(J(L.validateProgramInput({}).clean), {});
});
test('★ 응답 시트 열 찾기: 이름·기수·응답 시각만 찾고, 응답 내용이 있는 열은 건드리지 않는다', () => {
  const head = ['타임스탬프', '이메일 주소', '1) 참여자 이름', '2) 참여 기수', '7) 어떤 활동이 가장 기억에 남았나요?', '8) 활동 사진을 올려 주세요.', '17) 이번 프로그램에 전반적으로 얼마나 만족하셨나요?'];
  const c = L.satColumns(head);
  assert.deepStrictEqual(J(c), { ok: true, name: 2, round: 3, at: 0, missing: [] });
  assert.deepStrictEqual(J(L.satColumns(['시간', '성함', '회차'])), { ok: false, name: -1, round: 2, at: -1, missing: ['이름 열'] });
  assert.strictEqual(L.satColumns(['타임스탬프', '이름', '기타']).round, -1);
  assert.strictEqual(L.satColumns(['Timestamp', '이름', '회차']).at, 0);
});
console.log('3단계: 개인정보 파기 대상과 익명 통계');
const PG_SESS = [{ session_id: 's1', program_id: 'w', n: 1, start: '2023-10-06', end: '2023-10-08' }, { session_id: 's2', program_id: 'w', n: 2, start: '2025-03-10', end: '2025-03-12' },
  { session_id: 's3', program_id: 'w', n: 3, start: '2026-12-10', end: '2026-12-12' }, { session_id: 's4', program_id: 'l', n: 1, start: '2026-01-05', end: '2026-01-07' }];
const pp = (id, consent, extra = {}) => Object.assign({ person_id: id, name: id, gender: '여', birth_year: 1995, job: '', area: '', consent_retain: consent, created_at: '2023-09-01 00:00:00' }, extra);
const ee = (id, sid, pid, extra = {}) => Object.assign({ enroll_id: id, session_id: sid, person_id: pid, pass: '합격', cancel_reason: '', attend: '참석' }, extra);
test('★ 파기 대상: 미동의는 기준일이 속한 해의 12/31 이후, 동의는 기준일 + 3년 이후, 경계 당일은 대상이 아니다', () => {
  const people = [pp('n_old', 'N'), pp('n_this', 'N'), pp('y_old', 'Y'), pp('y_edge', 'Y'), pp('y_recent', 'Y')];
  const enr = [ee('1', 's1', 'n_old'), ee('2', 's4', 'n_this'), ee('3', 's1', 'y_old'), ee('4', 's2', 'y_edge'), ee('5', 's4', 'y_recent')];
  // n_old: 2023-12-31 지남 → 대상 / n_this: 2026-12-31 아직 → 유지 / y_old: 2026-10-08 지남 → 대상(오늘 2026-11-20)
  // y_edge: 기준 2025-03-12 + 3년 = 2028-03-12 → 유지 / y_recent 유지
  const r = L.purgeCandidates(people, enr, PG_SESS, '2026-11-20', 3);
  assert.deepStrictEqual(J(r.expired.map(x => [x.person_id, x.reason])), [['n_old', 'N'], ['y_old', 'Y']]);
  assert.strictEqual(r.summary.kept, 3);
  // 경계: 기한 당일까지는 보관 (2026-10-08 + 3년 = 2029-10-08)
  const edge = L.purgeCandidates([pp('e', 'Y')], [ee('1', 's1', 'e')], PG_SESS, '2026-10-08', 3);
  assert.strictEqual(edge.expired.length, 0);
  const dueDay = L.purgeCandidates([pp('e', 'Y')], [ee('1', 's1', 'e')], PG_SESS, '2026-10-08', 3);
  assert.strictEqual(dueDay.expired.length, 0);
  assert.strictEqual(L.purgeCandidates([pp('e', 'N')], [ee('1', 's1', 'e')], PG_SESS, '2023-12-31', 3).expired.length, 0);   // 12/31 당일은 아직
  assert.strictEqual(L.purgeCandidates([pp('e', 'N')], [ee('1', 's1', 'e')], PG_SESS, '2024-01-01', 3).expired.length, 1);
});
test('파기 대상: 아직 끝나지 않은 회차에 참여 기록이 있으면 오래된 기록이 있어도 대상이 아니다, 마지막 참여일을 기준으로 한다', () => {
  const people = [pp('a', 'N'), pp('b', 'Y')];
  const enr = [ee('1', 's1', 'a'), ee('2', 's3', 'a'), ee('3', 's1', 'b'), ee('4', 's2', 'b')];
  const r = L.purgeCandidates(people, enr, PG_SESS, '2026-11-20', 3);
  assert.strictEqual(r.summary.active, 1);                                      // a: 다가오는 s3 가 있음
  assert.deepStrictEqual(J(r.expired.map(x => x.person_id)), []);               // b: 마지막 참여 2025-03-12 + 3년 → 아직
});
test('파기 대상: 동의 미확인은 자동 대상이 아니라 검토 목록(기한이 지난 경우만), 참여 기록이 없으면 등록일 기준, 기준이 없으면 따로', () => {
  const people = [pp('u_old', ''), pp('u_new', ''), pp('none_enr', 'N', { created_at: '2023-09-01 00:00:00' }), pp('nobasis', 'N', { created_at: '' })];
  const enr = [ee('1', 's1', 'u_old'), ee('2', 's4', 'u_new')];
  const r = L.purgeCandidates(people, enr, PG_SESS, '2026-11-20', 3);
  assert.deepStrictEqual(J(r.review.map(x => x.person_id)), ['u_old']);
  assert.deepStrictEqual(J(r.expired.map(x => x.person_id)), ['none_enr']);
  assert.deepStrictEqual(J(r.noBasis), ['nobasis']);
});
test('★ 파기 전 익명 통계: 회차별로 모으고 이름·연락처가 없고, 취소·불합격은 세지 않는다', () => {
  const people = [pp('a', 'N', { name: '김가나', phone: '010-1111-2222', birth_year: 2010, job: '학생', area: '서울' }), pp('b', 'N', { name: '이다라', gender: '남', birth_year: 1990, job: '', area: '서울' }), pp('c', 'N', { name: '박마바', birth_year: 1960 })];
  const enr = [ee('1', 's2', 'a'), ee('2', 's2', 'b', { attend: '불참' }), ee('3', 's2', 'c', { cancel_reason: '사정' }), ee('4', 's1', 'a')];
  const rows = L.buildPurgeStats(['a', 'b', 'c'], people, enr, PG_SESS);
  const s2 = rows.find(r => r.session_id === 's2');
  assert.strictEqual(s2.n_applied, 2); assert.strictEqual(s2.n_attend, 1); assert.strictEqual(s2.n_male, 1); assert.strictEqual(s2.n_female, 1);
  assert.strictEqual(s2.n_age_under20, 1); assert.strictEqual(s2.n_age_30s, 1);       // 2025-2010=15, 2025-1990=35
  assert.deepStrictEqual(JSON.parse(s2.jobs_json), { 학생: 1, 미기재: 1 }); assert.deepStrictEqual(JSON.parse(s2.areas_json), { 서울: 2 });
  assert.strictEqual(s2.year, '2025');
  const text = JSON.stringify(rows);
  ['김가나', '이다라', '박마바', '010-1111'].forEach(v => assert.ok(!text.includes(v), v));
  assert.ok(rows.some(r => r.session_id === 's1'));
});
test('익명 통계 합치기: 같은 회차는 숫자와 분포를 더한다', () => {
  const a = { year: '2025', program_id: 'w', session_id: 's2', n_applied: 2, n_attend: 1, n_male: 1, n_female: 1, n_age_under20: 0, n_age_20s: 1, n_age_30s: 1, n_age_40plus: 0, jobs_json: '{"학생":1}', areas_json: '{"서울":2}' };
  const b = { year: '2025', program_id: 'w', session_id: 's2', n_applied: 1, n_attend: 1, n_male: 0, n_female: 1, n_age_under20: 0, n_age_20s: 1, n_age_30s: 0, n_age_40plus: 0, jobs_json: '{"학생":1,"개발자":1}', areas_json: '{"부산":1}' };
  const m = J(L.mergeStatsRow(a, b));
  assert.strictEqual(m.n_applied, 3); assert.strictEqual(m.n_female, 2); assert.strictEqual(m.n_age_20s, 2);
  assert.deepStrictEqual(JSON.parse(m.jobs_json), { 학생: 2, 개발자: 1 }); assert.deepStrictEqual(JSON.parse(m.areas_json), { 서울: 2, 부산: 1 });
  assert.deepStrictEqual(J(L.mergeStatsRow(null, b)), J(b));
});
console.log('2단계: 발송 대상·발송 기록 검사');
const MSG_ENR = [
  { enroll_id: 'a', session_id: 'w9', person_id: 'pa', pass: '합격', cancel_reason: '', pay_at: '2026-11-01', ins_at: '', m1_at: '2026-11-02', m2_at: '', attend: '참석', sat_at: '' },
  { enroll_id: 'b', session_id: 'w9', person_id: 'pb', pass: '합격', cancel_reason: '', pay_at: '', ins_at: '2026-11-03', m1_at: '', m2_at: '2026-11-04', attend: '불참', sat_at: '' },
  { enroll_id: 'c', session_id: 'w9', person_id: 'pc', pass: '합격', cancel_reason: '사정', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '참석', sat_at: '' },
  { enroll_id: 'd', session_id: 'w1', person_id: 'pd', pass: '합격', cancel_reason: '', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '', sat_at: '' },
  { enroll_id: 'e', session_id: 'w9', person_id: 'pe', pass: '합격', cancel_reason: '', pay_at: '', ins_at: '', m1_at: '', m2_at: '', attend: '참석', sat_at: '2026-11-10' }];
const tgt = f => J(L.messageTargets(MSG_ENR, 'w9', f)).map(x => x.enroll_id);
test('발송 대상: 확정 인원 전체(취소·다른 회차 제외)', () => assert.deepStrictEqual(tgt('all'), ['a', 'b', 'e']));
test('발송 대상: 입금 미완료 / 보험 미가입 / 1차 안내 미발송 / 최종 안내 미발송', () => {
  assert.deepStrictEqual(tgt('unpaid'), ['b', 'e']);
  assert.deepStrictEqual(tgt('uninsured'), ['a', 'e']);
  assert.deepStrictEqual(tgt('nom1'), ['b', 'e']);
  assert.deepStrictEqual(tgt('nom2'), ['a', 'e']);
});
test('발송 대상: 만족도 미응답은 참석자 중 응답 안 한 사람만', () => assert.deepStrictEqual(tgt('nosat'), ['a']));
test('발송 대상: 모르는 조건은 아무도 고르지 않는다', () => assert.deepStrictEqual(tgt('everyone'), []));
test('발송 기록 검사: 정상 / 방식·단계·대상 이상 / 주민번호 모양 거부', () => {
  const ok = { channel: 'sms', stage: 'm1', filter: 'nom1', body: '{이름}님' };
  assert.strictEqual(L.validateMessageLog(ok).ok, true);
  assert.strictEqual(L.validateMessageLog(Object.assign({}, ok, { channel: 'kakao' })).ok, false);
  assert.strictEqual(L.validateMessageLog(Object.assign({}, ok, { stage: 'zz' })).ok, false);
  assert.strictEqual(L.validateMessageLog(Object.assign({}, ok, { filter: 'x' })).ok, false);
  assert.strictEqual(L.validateMessageLog(Object.assign({}, ok, { body: '900101-1234567' })).ok, false);
  assert.strictEqual(L.validateMessageLog(Object.assign({}, ok, { body: 'x'.repeat(2001) })).ok, false);
  assert.deepStrictEqual(J(L.MESSAGE_FILTERS), ['all', 'unpaid', 'uninsured', 'nom1', 'nom2', 'nosat']);
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

console.log('2단계: 화면 — 업로드의 번호 분류와 등록 목록');
test('번호 분류: 정상 / 빈칸 / 형식 오류 / 신청서와 다름', () => {
  assert.strictEqual(G.classifyRrn('900101-2234567', '여', 1990).state, 'ok');
  assert.strictEqual(G.classifyRrn('', '여', 1990).state, 'empty');
  assert.strictEqual(G.classifyRrn(null, '여', 1990).state, 'empty');
  assert.strictEqual(G.classifyRrn('90010112345', '여', 1990).state, 'invalid');
  assert.strictEqual(G.classifyRrn('900101-1234567', '여', 1990).state, 'mismatch');
  assert.strictEqual(G.classifyRrn('910101-2234567', '여', 1990).state, 'mismatch');
  assert.deepStrictEqual(J(G.classifyRrn('900101-1234567', '여', 1990).codes), ['GENDER_MISMATCH']);
  assert.strictEqual(G.classifyRrn(9001012234567, '여', 1990).state, 'ok');    // 엑셀이 숫자로 읽은 13자리
  assert.strictEqual(G.classifyRrn(1012234567, '여', 2001).state, 'invalid');   // 앞자리 0이 지워진 짧은 숫자
});
test('번호 분류 결과에는 번호 값이 없다', () => {
  assert.ok(!JSON.stringify(G.classifyRrn('900101-1234567', '여', 1990)).includes('900101'));
  assert.ok(!G.rrnCodeText(['GENDER_MISMATCH', 'BIRTH_MISMATCH']).includes('900101'));
  assert.strictEqual(G.rrnCodeText(['LENGTH']), '자릿수가 맞지 않아요');
});
test('★ 등록 목록: 정상만 싣고, 신청서와 다른 번호는 "그대로 저장"을 고른 것만, 형식 오류·빈칸·대상 아닌 행은 싣지 않는다', () => {
  const rows = [
    { rowNo: 2, rrnEligible: true, gender: '여', birth_year: 1990 }, { rowNo: 3, rrnEligible: true, gender: '남', birth_year: 1991 },
    { rowNo: 4, rrnEligible: true, gender: '여', birth_year: 1992 }, { rowNo: 5, rrnEligible: true, gender: '남', birth_year: 1993 },
    { rowNo: 6, rrnEligible: false, gender: '여', birth_year: 1994 }, { rowNo: 7, rrnEligible: true, gender: '여', birth_year: 1995 }];
  const mem = { 2: '900101-2234567', 3: '910101-2234567', 4: '12345', 6: '940101-2234567', 7: '950101-1234567' };   // 5행은 빈칸
  const r = J(G.buildRrnPayload(rows, mem, { 7: { confirm: true } }));
  assert.deepStrictEqual(r.items.map(x => [x.rowNo, x.confirmMismatch]), [[2, false], [7, true]]);
  assert.deepStrictEqual(r.counts, { ok: 1, forced: 1, mismatch: 1, invalid: 1, empty: 1 });
  assert.ok(!JSON.stringify(r.counts).includes('9001'));
});
test('등록 목록: 화면에서 고쳐 입력한 값이 파일의 값보다 우선한다', () => {
  const rows = [{ rowNo: 2, rrnEligible: true, gender: '여', birth_year: 1990 }];
  const r = J(G.buildRrnPayload(rows, { 2: '12345' }, { 2: { rrn: '9001012234567' } }));
  assert.deepStrictEqual(r.items, [{ rowNo: 2, rrn: '9001012234567', confirmMismatch: false }]);
  const r2 = J(G.buildRrnPayload(rows, { 2: '900101-2234567' }, { 2: { rrn: '900101-1234567' } }));   // 고쳐 입력했지만 여전히 다름 → 그대로 저장 선택이 없으면 안 싣는다
  assert.deepStrictEqual(r2.items, []);
});
test('판정·채움 열 이름 표는 서버의 판정 이름을 모두 덮는다', () => {
  ['new', 'existing', 'rejected', 'cancelled_new', 'needs_session', 'duplicate_in_file', 'error'].forEach(k => assert.ok(G.DECISION_TEXT[k], k));
  ['job', 'area', 'email', 'consent_retain', 'consent_portrait', 'applied_at', 'hp_no', 'memo', 'attend'].forEach(k => assert.ok(G.FILL_LABELS[k], k));
});

console.log('2단계: 화면 코드를 읽어 번호가 새는 길이 없는지 검사 (R1)');
const clientFiles = ['Apply.html', 'Insure.html', 'Send.html', 'Admin.html', 'Client.html', 'Logic.html'].map(f => [f, fs.readFileSync(path.join(appDir, f), 'utf8')]);
test('화면 코드는 브라우저 저장소·쿠키·콘솔 출력·알림창을 쓰지 않는다 (번호가 머무를 곳이 메모리뿐)', () => {
  clientFiles.forEach(([f, src]) => {
    ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console.log', 'console.info', 'console.debug', 'alert(', 'prompt('].forEach(w =>
      assert.ok(!src.includes(w), f + ' 에 ' + w + ' 가 있음'));
  });
});
test('★ 업로드 화면은 번호 입력칸의 값을 HTML 속성(value="…")으로 그리지 않는다', () => {
  const src = clientFiles.find(x => x[0] === 'Apply.html')[1];
  assert.ok(!/value="'\s*\+\s*[^']*\b(mem|inputs|raw|rrn|apEffRaw)/.test(src), 'value 속성에 번호 변수가 쓰임');
  assert.ok(!/textContent\s*=\s*[^;]*\b(mem|raw|apEffRaw)\b/.test(src) && !/innerHTML\s*\+?=\s*[^;]*\b(mem\[|apEffRaw\()/.test(src), '화면 글자에 번호 변수가 쓰임');
});
test('★ 번호 입력칸은 모두 가려진 칸(type="password")으로 그려진다', () => {
  const src = clientFiles.find(x => x[0] === 'Apply.html')[1];
  const inputs = src.match(/<input[^>]*(data-rrn-row|id="rrn-in")[^>]*>/g) || [];
  assert.ok(inputs.length >= 2);
  inputs.forEach(i => assert.ok(/type="password"/.test(i) && /autocomplete="off"/.test(i), i));
});
test('화면에 쓰는 서버 응답·사용자 값은 esc() 를 거친다 (Apply.html 의 문자열 이어 붙이기에서 생값이 들어가는 곳이 없다)', () => {
  const src = clientFiles.find(x => x[0] === 'Apply.html')[1];
  // 따옴표 안에 값을 이어 붙이는 곳(+ x.y +)에서 esc/숫자 변환/미리 만든 html 조각이 아닌 값을 찾는다: 알려진 안전한 식만 허용
  const risky = [];
  // 검토를 마친 이어 붙이기 항목: 숫자(개수·행 번호), 상수 표의 클래스·문구, 이미 esc() 를 거쳐 만든 html 조각, 선택자에 쓰는 우리 쪽 표식. 새 항목이 생기면 이 목록에 넣기 전에 esc() 가 필요한지 확인한다.
  const SAFE_CONCAT = ['s.n', 'up.rowCount', 'up.rrnCols', 'memCount', 'cls', 'label', 'n', 'pv.fillsByField[k]', 'pv.sessionNotes', 's.consentChanged', 'd[1]', 'sess', 'IC.warn', 'rows', 'pv.warnings.length', 'c.forced', 'c.mismatch', 'c.invalid', 'c.empty', 'skip', 'bad.length', 'x.rowNo', 'c.newEnrollments', 'c.newPeople', 's.existing', 'c.filledCells', 'c.sessionNotes', 'rc.saved', 'r.warnings.length', 'c.enrollments', 'c.people', 'c.rrn', 'c.cells', 'c.notes', 'c.skippedCells', 'c.keptPeople', 'r.enrollments', 'r.people', 'r.cells', 'row', 'd.row'];
  (src.match(/'\s*\+\s*([A-Za-z_][\w.\[\]]*)\s*\+\s*'/g) || []).forEach(m => {
    const v = /\+\s*([A-Za-z_][\w.\[\]]*)\s*\+/.exec(m)[1];
    if (!SAFE_CONCAT.includes(v)) risky.push(v);
  });
  assert.deepStrictEqual(risky, []);
});

console.log('2단계: 화면 — 만족도 응답률과 보험 명단 창');
test('만족도 단계 열 매핑: sat → sat_at, 체크하면 완료로 센다', () => {
  assert.strictEqual(G.STEP_COLS.sat, 'sat_at');
  assert.strictEqual(G.stepDone({ sat_at: '2026-11-20' }, 'sat'), true);
  assert.strictEqual(G.stepDone({ sat_at: '' }, 'sat'), false);
});
test('★ 만족도 응답률: 시작한 회차의 참석자(취소 제외)만 분모, 응답 표시한 사람이 분자', () => {
  const boot = {
    today: '2026-11-20',
    sessions: [{ session_id: 'a', start: '2026-11-10', end: '2026-11-12' }, { session_id: 'b', start: '2026-11-30', end: '2026-12-02' }, { session_id: 'c', start: '2026-11-20', end: '2026-11-22' }],
    enrollments: [
      { session_id: 'a', attend: '참석', sat_at: '2026-11-15', cancel_reason: '' }, { session_id: 'a', attend: '참석', sat_at: '', cancel_reason: '' },
      { session_id: 'a', attend: '불참', sat_at: '', cancel_reason: '' }, { session_id: 'a', attend: '', sat_at: '', cancel_reason: '' },
      { session_id: 'a', attend: '참석', sat_at: '', cancel_reason: '취소' },                    // 취소: 제외
      { session_id: 'b', attend: '참석', sat_at: '', cancel_reason: '' },                        // 아직 시작 전: 제외
      { session_id: 'c', attend: '참석', sat_at: '2026-11-21', cancel_reason: '' }]              // 오늘 시작: 포함
  };
  assert.deepStrictEqual(J(G.satKpi(boot)), { done: 2, total: 3 });
  assert.strictEqual(G.satKpi({ today: '2026-11-20', sessions: boot.sessions, enrollments: [] }), null);
  assert.strictEqual(G.satKpi({ today: '2026-11-01', sessions: boot.sessions, enrollments: boot.enrollments }), null);
});
test('★ 보험 명단 창 코드: 번호(INS_ROWS)는 엑셀 만들기에만 쓰고 화면 글자·속성에는 쓰지 않는다', () => {
  const src = clientFiles.find(x => x[0] === 'Insure.html')[1];
  const uses = (src.match(/INS_ROWS/g) || []).length;
  assert.ok(uses >= 4);
  // INS_ROWS 가 나오는 줄 중 html 문자열을 만드는 줄(+ '<' 로 시작하는 이어 붙이기)에는 번호(rrn)를 쓰지 않는다
  src.split('\n').filter(l => /INS_ROWS/.test(l)).forEach(l => assert.ok(!/'<[^']*'\s*\+[^;]*\.rrn/.test(l), l.trim()));
  assert.ok(!/esc\([^)]*\.rrn/.test(src), 'esc(...rrn) 가 있음');
  assert.ok(/INS_ROWS = null/.test(src) && (src.match(/INS_ROWS = null/g) || []).length >= 3, '닫기·완료·열기에서 메모리를 비워야 함');
  assert.ok(/\[r\.name, r\.rrn\]/.test(src), '엑셀은 [이름, 주민번호] 두 칸 (제목 줄 없음)');
});

console.log('2단계: 화면 — 발송 준비 계산');
test('★ 화면의 발송 대상 계산은 서버의 messageTargets 와 같은 결과를 낸다', () => {
  ['all', 'unpaid', 'uninsured', 'nom1', 'nom2', 'nosat', 'everyone'].forEach(f =>
    assert.deepStrictEqual(J(G.messageTargets(MSG_ENR, 'w9', f)).map(x => x.enroll_id), J(L.messageTargets(MSG_ENR, 'w9', f)).map(x => x.enroll_id), f));
});
test('단계·조건·프로그램 이름 표가 서버 규칙과 맞는다', () => {
  assert.deepStrictEqual(Object.keys(G.STAGE_INFO).sort(), J(L.STAGES).sort());
  Object.keys(G.STAGE_INFO).forEach(k => assert.ok(L.MESSAGE_FILTERS.includes(G.STAGE_INFO[k].filter), k));
  assert.deepStrictEqual(Object.keys(G.FILTER_TEXT).sort(), J(L.MESSAGE_FILTERS).sort());
});
test('문구 채우기: 모든 자리표시자를 바꾼다', () => {
  const ctx = { name: '김하늘', program: '일해보기', n: 9, start: '2026-12-07', end: '2026-12-09', fee: 50000, refundDeadline: '2026-12-04', transport: '고속터미널', formUrl: 'https://forms.example.com/x' };
  const r = G.fillTemplate('{이름}님 {프로그램} {회차} {날짜} 참가비 {참가비}원 {환불기한}까지 {이동수단} {폼링크}', ctx);
  assert.strictEqual(r.text, '김하늘님 일해보기 9회차 12/7(월) – 9(수) 참가비 50,000원 12/4(금)까지 고속터미널 https://forms.example.com/x');
  assert.deepStrictEqual(J(r.missing), []);
});
test('문구 채우기: 폼 링크가 비어 있으면 자리표시자를 그대로 두고 알린다, 이동수단이 비면 "미정"', () => {
  const r = G.fillTemplate('{이름}님 {이동수단} {폼링크}', { name: '갑', transport: '', formUrl: '' });
  assert.strictEqual(r.text, '갑님 미정 {폼링크}');
  assert.deepStrictEqual(J(r.missing), ['폼링크']);
  assert.deepStrictEqual(J(G.fillTemplate('안내', { name: '갑' }).missing), []);
});
test('문구 채우기: 같은 자리표시자가 여러 번 나와도 모두 바꾸고, 값에 {…} 가 있어도 다시 바꾸지 않는다', () => {
  const r = G.fillTemplate('{이름} {이름}', { name: '{프로그램}' });
  assert.strictEqual(r.text, '{프로그램} {프로그램}');
});
test('저장한 문구 고르기: 그 프로그램 전용(최근) → 공통(최근) → 없음', () => {
  const T = [
    { tpl_id: 'a', stage: 'm2', program_id: 'all', saved_at: '2026-09-01 00:00:00' }, { tpl_id: 'b', stage: 'm2', program_id: 'w', saved_at: '2026-09-20 00:00:00' },
    { tpl_id: 'c', stage: 'm2', program_id: 'w', saved_at: '2026-10-20 00:00:00' }, { tpl_id: 'd', stage: 'sat', program_id: 'all', saved_at: '2026-09-01 00:00:00' }];
  assert.strictEqual(G.pickSavedTemplate(T, 'm2', 'w').tpl_id, 'c');
  assert.strictEqual(G.pickSavedTemplate(T, 'm2', 'l').tpl_id, 'a');
  assert.strictEqual(G.pickSavedTemplate(T, 'sat', 'g').tpl_id, 'd');
  assert.strictEqual(G.pickSavedTemplate(T, 'pay', 'w'), null);
});
test('저장한 문구 목록 필터: 현재 단계·프로그램+공통 / 전체', () => {
  const T = [{ tpl_id: 'a', stage: 'm2', program_id: 'all' }, { tpl_id: 'b', stage: 'm2', program_id: 'w' }, { tpl_id: 'c', stage: 'm2', program_id: 'g' }, { tpl_id: 'd', stage: 'sat', program_id: 'all' }];
  const ids = (a, b, c, d) => J(G.filterLibrary(T, a, b, c, d)).map(x => x.tpl_id);
  assert.deepStrictEqual(ids('m2', 'w', 'cur', 'cur'), ['a', 'b']);
  assert.deepStrictEqual(ids('m2', 'w', 'every', 'every'), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(ids('m2', 'w', 'sat', 'all'), ['d']);
  assert.deepStrictEqual(ids('m2', 'w', 'cur', 'g'), ['c']);
});
test('문자 종류: 90바이트(한글 45자)까지 단문, 넘으면 장문', () => {
  assert.strictEqual(G.smsBytes('가'.repeat(45)), 90);
  assert.strictEqual(G.smsKind('가'.repeat(45)), 'SMS');
  assert.strictEqual(G.smsKind('가'.repeat(46)), 'LMS');
  assert.strictEqual(G.smsKind('a'.repeat(90)), 'SMS');
  assert.strictEqual(G.smsKind('a'.repeat(91)), 'LMS');
});

console.log('2단계: 화면 — 할 일 문구와 배지');
test('할 일 제목: 종류마다 문장이 있고 인원이 들어간다', () => {
  ['rrn', 'ins', 'pay', 'refund', 'm1', 'attend', 'sat'].forEach(k => assert.ok(G.todoTitle(k, 3).includes('3'), k));
  assert.strictEqual(G.todoTitle('rrn', 2), '주민번호 없음·확인 필요 2명');
});
test('★ 사이드바 배지: 긴급(빨강) 항목 수만 센다 / 보험 가입을 마친 사람은 주민번호 할 일에 세지 않는다', () => {
  const boot = { today: '2026-11-20', config: { refund_days: 3 }, sessions: [{ session_id: 'a', start: '2026-11-25', end: '2026-11-27' }],
    enrollments: [{ enroll_id: 'e1', session_id: 'a', pass: '합격', cancel_reason: '', ins_at: '2026-11-19', pay_at: '2026-11-19' }, { enroll_id: 'e2', session_id: 'a', pass: '합격', cancel_reason: '', ins_at: '', pay_at: '2026-11-19' }], rrnStatus: { e2: 'missing' } };
  const l = G.todoList(boot);
  assert.deepStrictEqual(J(l.filter(x => x.kind === 'rrn').map(x => x.n)), [1]);   // e1 은 보험 완료라 제외
  assert.strictEqual(G.urgentTodoCount(boot), l.filter(x => x.sev === 'bad').length);
  assert.ok(G.urgentTodoCount(boot) >= 1);
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
