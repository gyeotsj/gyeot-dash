/**
 * 구글 없이 앱 화면을 브라우저에서 띄워 보는 미리보기 파일을 만든다. (가짜 데이터 + 가짜 서버)
 * 실행: node tools/build-preview.js <출력.html> [옵션]
 *   --screen=dash|sess|people|sessions|imp   처음 보여 줄 화면
 *   --imported=0|1       이관 완료 여부 (기본 1)
 *   --sid=w2             회차 상세로 볼 회차
 *   --drawer=3 --edit=1  참여자 상세 패널 (enrollments 배열의 번호), 수정 모드
 *   --sf=new|edit        회차 입력 패널
 *   --imp=ready|preview  이관 화면 상태 (파일 읽음 / 미리보기 결과)
 *   --role=owner|member
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const out = process.argv[2];
const arg = k => { const m = process.argv.find(a => a.startsWith('--' + k + '=')); return m ? m.split('=')[1] : null; };
const app = path.join(__dirname, '..', 'app');
const read = f => fs.readFileSync(path.join(app, f), 'utf8');
const read2 = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* 서버 코드(Lib.gs)를 그대로 써서 가짜 데이터를 만든다 */
const ctx = vm.createContext({ console });
vm.runInContext(read('Schema.gs') + '\n' + read('Lib.gs'), ctx);
const lib = vm.runInContext('({ parseLegacySheet, buildLegacyPlan, sanitizeLegacyRows })', ctx);

const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오'];
const GIV = ['하늘', '서준', '지우', '도윤', '서연', '민재', '예린', '하준', '수아', '지호', '소율', '건우', '나연', '동현', '유진', '시우'];
let ni = 0;
const nextName = () => { const n = SUR[ni % SUR.length] + GIV[(ni * 5) % GIV.length]; ni++; return n; };
const phone = i => '010-' + String(1000 + i * 7).padStart(4, '0') + '-' + String(2000 + i * 13).padStart(4, '0');
const HEAD = ['', '신청자명', '주민번호', '연락처', '메일', '성별', '출생연도', '1차 안내메일', '자차', '고속', '시외', '참가비 이체', '최종 안내메일'];
let pi = 0;
const row = (o = {}) => { const i = pi++; return ['', o.name || nextName(), '', phone(i), 'guest' + i + '@example.com', i % 3 === 1 ? '남' : '여', 1990 + (i * 7) % 16, 'ㅇ', o.car || '', o.exp || '', o.int || '', o.pay === undefined ? 'ㅇ' : o.pay, o.m2 === false ? '' : 'ㅇ']; };
const tr = i => [{ car: 'ㅇ' }, { exp: 'ㅇ' }, { int: 'ㅇ' }, {}][i % 4];
const sheet = [];
const spec = [['1회차 | 10/6(화)-8(목)', 2, 1, 0, 2], ['2회차 | 10/12(월)-14(수)', 5, 0, 0, 3], ['3회차 | 10/19(월)-21(수)', 5, 0, 1, 2], ['4회차 | 10/22(목)-24(토)', 4, 0, 0, 0], ['5회차 | 10/26(월)-28(수)', 5, 0, 0, 3]];
spec.forEach(([title, paid, part, full, unpaid]) => {
  sheet.push(['', title], HEAD);
  for (let i = 0; i < paid; i++) sheet.push(row(Object.assign({ m2: !(title.startsWith('5') && i === 0) }, tr(i))));
  for (let i = 0; i < part; i++) sheet.push(row({ pay: 'ㅇ 25000원 환불', int: 'ㅇ' }));
  for (let i = 0; i < full; i++) sheet.push(row({ pay: 'ㅇ 50000원 환불', exp: 'ㅇ' }));
  for (let i = 0; i < unpaid; i++) sheet.push(row({ pay: '', m2: false, exp: 'ㅇ' }));
});
sheet[sheet.length - 1][1] = '오지호(오지아)';        // 괄호가 있는 이름 예시

const OPTS = { program_id: 'w', year: 2026, fee: 50000, cap: 7, today: '2026-11-18', now: '2026-11-18 12:00:00' };
let seq = 0;
const plan = lib.buildLegacyPlan(lib.parseLegacySheet(sheet), Object.assign({ makeId: p => p + (++seq) }, OPTS));
const clone = o => JSON.parse(JSON.stringify(o));
const previewResult = clone({ ok: plan.ok, errors: plan.errors, warnings: plan.warnings, summary: plan.summary, counts: { sessions: plan.sessions.length, people: plan.people.length, enrollments: plan.enrollments.length }, sessions: plan.sessions, already: false });

/* 앱이 받는 형태(boot)로 만든다 */
const blankEnr = (e) => Object.assign({
  enroll_id: '', session_id: '', person_id: '', hp_no: '', applied_at: '', pass: '합격', notice_ack: '', memo: '', transport: '', m1_at: '', pay_at: '', pay_amount: '',
  refund_amount: '', ins_at: '', m2_at: '', attend: '', cancel_reason: '', cancelled_at: '', updated_at: '2026-11-18 12:00:00', updated_by: 'legacy-import'
}, e);
const imported = arg('imported') !== '0';
const boot = {
  me: { email: 'owner@example.com', name: '소유자', role: arg('role') || 'owner' },
  now: '2026-11-18 12:00:00', today: '2026-11-18',
  config: { refund_days: 3, retention_years: 3, legacy_imported: imported },
  programs: [{ program_id: 'w', name: '일해보기' }, { program_id: 'l', name: '살아보기' }, { program_id: 'g', name: '자라보기' }],
  sessions: imported ? clone(plan.sessions) : [], people: imported ? clone(plan.people) : [], enrollments: imported ? clone(plan.enrollments).map(blankEnr) : [],
  staff: [{ email: 'owner@example.com', name: '소유자', role: 'owner', active: 'Y' }]
};
if (imported) {
  // 곧 시작하는 회차와 아직 참여자가 없는 회차 (화면 예시용)
  boot.sessions.push({ session_id: 'w6', program_id: 'w', n: 6, start: '2026-11-25', end: '2026-11-27', fee: 50000, cap: 7, note: '' });
  boot.sessions.push({ session_id: 'l1', program_id: 'l', n: 1, start: '2026-12-07', end: '2026-12-11', fee: 120000, cap: 6, note: '' });
  boot.sessions.push({ session_id: 'w9', program_id: 'w', n: 9, start: '2026-12-07', end: '2026-12-09', fee: 50000, cap: 7, note: '' });
  const base = boot.people.length;
  for (let i = 0; i < 5; i++) {
    const pid = 'pn' + i;
    boot.people.push({ person_id: pid, name: nextName(), phone: phone(100 + i), email: 'new' + i + '@example.com', gender: i % 2 ? '남' : '여', birth_year: 1996 + i, job: ['디자이너', '개발자', '대학생', '기획자', '작가'][i], area: '서울 마포구', consent_retain: ['Y', 'Y', 'N', '', 'Y'][i], consent_portrait: 'Y', created_at: '2026-11-10 10:00:00', updated_at: '2026-11-10 10:00:00' });
    boot.enrollments.push(blankEnr({ enroll_id: 'en' + i, session_id: 'w6', person_id: pid, applied_at: '2026-11-10', m1_at: '2026-11-11', pay_at: i < 3 ? '2026-11-12' : '', pay_amount: i < 3 ? 50000 : '', ins_at: i < 2 ? '2026-11-14' : '', m2_at: '', transport: ['자차', '고속터미널', '시외터미널', '', '고속터미널'][i], updated_by: 'staff@example.com' }));
  }
}

/* --xss=1: 이름·남긴 말·직업·회차 메모에 스크립트를 넣어 화면이 그대로 글자로만 보여 주는지 시험한다 */
const xss = arg('xss') === '1';
if (xss && imported) {
  boot.people[0].name = '<img src=x onerror="window.__XSS=1">김엑스';
  boot.people[0].job = '<script>window.__XSS=1<\/script>직업';
  boot.people[0].area = '"><svg onload="window.__XSS=1">';
  boot.enrollments[0].memo = '<img src=x onerror="window.__XSS=1"> 알레르기';
  boot.enrollments[0].cancel_reason = '<b onmouseover="window.__XSS=1">사유</b>';
  boot.sessions[0].note = '<b onmouseover="window.__XSS=1">메모</b>';
}
// 주민번호 상태(값 없음): 곧 시작하는 6회차 참여자 5명
boot.rrnStatus = {};
// en0·en1 은 보험 가입을 마쳐서 번호가 지워진 사람이라 상태가 없다
if (imported) [null, null, 'ok', 'check', 'missing'].forEach((st, i) => { if (st) boot.rrnStatus['en' + i] = st; });
boot.templates = [
  { tpl_id: 't1', name: '1차 안내 기본', stage: 'm1', program_id: 'all', channel: 'mail', body: '{이름}님, 곁마을 {프로그램} {회차}에 함께해 주셔서 감사합니다. 상세 시간표와 참가비 안내를 보내드립니다. 참가비는 {참가비}원이며, 입금 후 알려 주세요.', saved_by: 'owner@example.com', saved_at: '2026-09-01 10:00:00' },
  { tpl_id: 't2', name: '입금 요청 기본', stage: 'pay', program_id: 'all', channel: 'sms', body: '[곁마을] {이름}님, {프로그램} {회차} 참가비 {참가비}원 입금이 아직 확인되지 않았어요. 참여 3일 전인 {환불기한}까지 취소하면 전액 환불됩니다.', saved_by: 'owner@example.com', saved_at: '2026-09-01 10:00:00' },
  { tpl_id: 't3', name: '최종 안내 기본', stage: 'm2', program_id: 'all', channel: 'sms', body: '[곁마을] {이름}님, {회차} {날짜}가 곧 시작돼요. 집결 시간과 장소는 메일을 확인해 주세요. 이동수단: {이동수단}', saved_by: 'owner@example.com', saved_at: '2026-09-01 10:00:00' },
  { tpl_id: 't4', name: '만족도 요청 기본', stage: 'sat', program_id: 'all', channel: 'sms', body: '[곁마을] {이름}님, {프로그램} {회차}는 어떠셨나요? 짧은 만족도 조사에 참여해 주세요. {폼링크}', saved_by: 'owner@example.com', saved_at: '2026-09-01 10:00:00' },
  { tpl_id: 't5', name: '일해보기 최종 안내 (준비물 포함)', stage: 'm2', program_id: 'w', channel: 'sms', body: '[곁마을] {이름}님, {회차} {날짜}가 곧 시작돼요. 노트북과 충전기를 꼭 챙겨 주세요. 이동수단: {이동수단}', saved_by: 'owner@example.com', saved_at: '2026-09-20 10:00:00' }];
boot.messageLog = [{ log_id: 'm_1', at: '2026-11-10 11:02:00', by: 'owner@example.com', session_id: 'w6', channel: 'mail', stage: 'm1', filter: 'nom1', count: 5, body: '{이름}님, 곁마을 {프로그램} {회차}에 함께해 주셔서 감사합니다.' }];
// 시험용 가짜 번호(브라우저 가짜 서버 안에만 있다): en2 는 정상, en3 는 성별 자리를 일부러 반대로 해서 "확인 필요"로 만든다
const fakeRrn = (pid, flip) => { const p = boot.people.find(x => x.person_id === pid); const by = Number(p.birth_year), male = p.gender === '남'; let d = by >= 2000 ? (male ? 3 : 4) : (male ? 1 : 2); if (flip) d = d % 2 === 1 ? d + 1 : d - 1; return String(by).slice(2) + '0101-' + d + '234567'; };
const rrnSeed = imported ? { en2: fakeRrn('pn2', false), en3: fakeRrn('pn3', true) } : {};
const imp = arg('imp');
const preview = {
  screen: arg('screen') || 'dash', ins: arg('ins') || undefined, stop: arg('stop') || undefined, sid: arg('sid') || undefined,
  drawerIdx: arg('drawer') != null ? Number(arg('drawer')) : undefined, edit: arg('edit') === '1',
  sf: arg('sf') === 'new' ? { mode: 'new', prog: '' } : arg('sf') === 'edit' ? { mode: 'edit', sid: arg('sid') || 'w6' } : undefined,
  imp: imp ? { file: '신청자명단.xlsx', rows: [[]], rrnCols: 1, rowCount: 34, error: '', opts: { program_id: 'w', year: 2026, fee: 50000, cap: 7 }, preview: imp === 'preview' ? previewResult : null, result: null, ok: imp === 'preview', busy: false } : undefined
};

/* HTML 안의 <script> 에 JSON을 넣을 때 '<' 를 \\u003c 로 바꿔 </script> 같은 글자가 태그를 끊지 못하게 한다 */
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');
const mock = `
(function () {
  var DB = ${safeJson(boot)};
  var PREVIEW_RESULT = ${safeJson(previewResult)};
  var COLS = { m1: 'm1_at', pay: 'pay_at', ins: 'ins_at', m2: 'm2_at', attend: 'attend', sat: 'sat_at' };
  var STATUS_MOCK = { sweep: { last: '', lastCount: null, stale: true, message: '자동 정리가 아직 한 번도 실행되지 않았어요. 트리거를 설정했는지 확인해 주세요.' }, privacy: { last: '', total: null }, needs: [{ tab: 'Enrollments', cols: ['sat_at'] }], leak: 0 };
  var SEQ = 1000, UPLOADS = [], MOCK_RRN = ${safeJson(rrnSeed)};
  var planOf = function (v, actor) {
    var parsed = LIB.parseApplicationSheet(v.rows);
    var existing = JSON.parse(JSON.stringify({ sessions: DB.sessions, people: DB.people, enrollments: DB.enrollments }));
    var plan = LIB.buildApplicationPlan(parsed, existing, { program_id: v.programId, today: '2026-11-18', now: '2026-11-18 12:10:00', actor: actor || '', makeId: function (p) { return p + (++SEQ); }, sessionMap: v.sessionMap, applyAttend: v.applyAttend });
    return { parsed: parsed, plan: plan };
  };
  var c = function (o) { return JSON.parse(JSON.stringify(o)); };
  var find = function (id) { return DB.enrollments.filter(function (e) { return e.enroll_id === id; })[0]; };
  var impl = {
    getBootstrap: function () { return c(DB); },
    setStep: function (id, step, value) { var e = find(id); if (step === 'attend') e.attend = value === true ? '참석' : (value || ''); else e[COLS[step]] = value === true ? '2026-11-18' : ''; e.updated_at = '2026-11-18 12:05:00'; return c(e); },
    updateEnrollment: function (id, patch) { var e = find(id); Object.keys(patch).forEach(function (k) { e[k] = patch[k]; }); if ('cancel_reason' in patch) e.cancelled_at = patch.cancel_reason ? '2026-11-18' : ''; e.updated_at = '2026-11-18 12:05:00'; return c(e); },
    updatePerson: function (id, patch) { var p = DB.people.filter(function (x) { return x.person_id === id; })[0]; Object.keys(patch).forEach(function (k) { p[k] = patch[k]; }); p.updated_at = '2026-11-18 12:05:00'; return c(p); },
    bulkSetStep: function (sid, step, value) { var rows = []; DB.enrollments.forEach(function (e) { if (e.session_id === sid && !e.cancel_reason && e.attend !== value) { e.attend = value; rows.push(c(e)); } }); return rows; },
    saveSession: function (input) { var row = { session_id: input.session_id || (input.program_id + input.n), program_id: input.program_id || input.session_id[0], n: Number(input.n || 0), start: input.start, end: input.end, fee: Number(input.fee), cap: Number(input.cap), note: input.note || '' }; return row; },
    deleteSession: function () { return true; },
    previewLegacyImport: function () { return c(PREVIEW_RESULT); },
    commitLegacyImport: function () { return { backup: { name: '곁마을 운영 DB 백업 20261118_120000' }, counts: { sessions: 5, people: 33, enrollments: 34 } }; },
    undoLegacyImport: function () { return { sessions: 5, people: 33, enrollments: 34 }; },
    /* ----- 2단계: 신청 업로드·되돌리기·주민번호 (서버 Lib.gs 의 규칙을 그대로 써서 흉내 낸다. 번호 값은 MOCK_RRN 에만 있다) ----- */
    previewApplications: function (payload) {
      var chk = LIB.sanitizeApplicationPayload(payload);
      if (!chk.ok) throw new Error('[INVALID] ' + chk.error);
      var r = planOf(chk.value, '');
      var nameBy = {}, roundBy = {};
      r.parsed.rows.forEach(function (x) { nameBy[x.rowNo] = x.name; roundBy[x.rowNo] = x.roundText; });
      var by = {};
      LIB.collapseFills(r.plan.fills).forEach(function (f) { by[f.field] = (by[f.field] || 0) + 1; });
      return c({ ok: r.plan.ok, errors: r.plan.errors, warnings: r.plan.warnings, summary: r.plan.summary, fillsByField: by, sessionNotes: r.plan.sessionNotes.length,
        rows: r.plan.rows.map(function (x) { return { rowNo: x.rowNo, name: nameBy[x.rowNo] || '', decision: x.decision, session_id: x.session_id, method: x.method, reason: x.reason || '', rrnEligible: x.rrnEligible, gender: x.gender, birth_year: x.birth_year, roundText: x.decision === 'needs_session' ? roundBy[x.rowNo] : '' }; }) });
    },
    commitApplications: function (payload) {
      var chk = LIB.sanitizeApplicationPayload(payload);
      if (!chk.ok) throw new Error('[INVALID] ' + chk.error);
      var v = chk.value, r = planOf(v, 'owner@example.com'), plan = r.plan;
      if (!plan.ok) throw new Error('[INVALID] ' + plan.errors[0]);
      var fills = LIB.collapseFills(plan.fills);
      var rp = LIB.planRrnWrites(plan, v.rrns, DB.sessions);
      var manifest = LIB.buildUploadManifest(plan, fills, rp.writes.map(function (w) { return w.enroll_id; }));
      plan.newPeople.forEach(function (p) { DB.people.push(p); });
      plan.newEnrollments.forEach(function (e) { DB.enrollments.push(e); });
      fills.forEach(function (f) { var row = (f.table === 'People' ? DB.people : DB.enrollments).filter(function (x) { return x[f.table === 'People' ? 'person_id' : 'enroll_id'] === f.id; })[0]; row[f.field] = f.to; });
      plan.sessionNotes.forEach(function (n) { DB.sessions.filter(function (s) { return s.session_id === n.session_id; })[0].note = n.to; });
      var forced = {}; (v.rrns || []).forEach(function (x) { if (x.confirmMismatch) forced[x.rowNo] = true; });
      rp.writes.forEach(function (w) { MOCK_RRN[w.enroll_id] = w.rrn; DB.rrnStatus[w.enroll_id] = forced[w.rowNo] ? 'check' : 'ok'; });
      plan.rows.forEach(function (x) { if (x.rrnEligible && x.enroll_id && !MOCK_RRN[x.enroll_id]) DB.rrnStatus[x.enroll_id] = 'missing'; });
      var s = plan.summary, touched = {};
      plan.rows.forEach(function (x) { if (x.session_id && x.decision !== 'error' && x.decision !== 'needs_session') touched[x.session_id] = true; });
      var up = { upload_id: 'u_' + (++SEQ), at: '2026-11-18 12:10:00', by: 'owner@example.com', program_id: v.programId, sessions: Object.keys(touched).join(','), n_new: s['new'] + s.cancelled_new, n_fill: s.existing, n_skip: s.rejected + s.needs_session + s.duplicate_in_file + s.error, manifest: JSON.stringify(manifest), undone_at: '' };
      UPLOADS.unshift(up);
      return c({ upload_id: up.upload_id, summary: s, warnings: plan.warnings, counts: { newPeople: plan.newPeople.length, newEnrollments: plan.newEnrollments.length, filledCells: fills.length, sessionNotes: plan.sessionNotes.length }, rrn: { counts: rp.counts, status: rp.status }, sessions: up.sessions });
    },
    listUploads: function () { return c({ missingTab: false, items: UPLOADS.map(function (u) { var o = c(u); delete o.manifest; return o; }) }); },
    previewUndoUpload: function (id) {
      var u = UPLOADS.filter(function (x) { return x.upload_id === id; })[0];
      var p = LIB.planUndo(JSON.parse(u.manifest), { people: DB.people, enrollments: DB.enrollments, sessions: DB.sessions });
      var k = p.counts; k.rrn = p.rrnIds.filter(function (i) { return MOCK_RRN[i]; }).length;
      return c({ upload_id: id, counts: k });
    },
    undoUpload: function (id) {
      var u = UPLOADS.filter(function (x) { return x.upload_id === id; })[0];
      var p = LIB.planUndo(JSON.parse(u.manifest), { people: DB.people, enrollments: DB.enrollments, sessions: DB.sessions });
      p.rrnIds.forEach(function (i) { delete MOCK_RRN[i]; delete DB.rrnStatus[i]; });
      DB.enrollments = DB.enrollments.filter(function (e) { return p.delEnroll.indexOf(e.enroll_id) < 0; });
      DB.people = DB.people.filter(function (x) { return p.delPeople.indexOf(x.person_id) < 0; });
      p.restores.forEach(function (f) { var row = (f.table === 'People' ? DB.people : DB.enrollments).filter(function (x) { return x[f.table === 'People' ? 'person_id' : 'enroll_id'] === f.id; })[0]; if (row) row[f.field] = f.from; });
      p.noteRestores.forEach(function (n) { DB.sessions.filter(function (s) { return s.session_id === n.session_id; })[0].note = n.from; });
      u.undone_at = '2026-11-18 12:20:00';
      return c(p.counts);
    },
    setRrn: function (id, rrn, confirm) {
      var e = find(id), p = DB.people.filter(function (x) { return x.person_id === e.person_id; })[0];
      var m = LIB.rrnMatchesProfile(rrn, p.gender, p.birth_year);
      var mis = !m.ok && (m.codes[0] === 'BIRTH_MISMATCH' || m.codes[0] === 'GENDER_MISMATCH');
      if (!m.ok && !mis) throw new Error('[INVALID] 주민번호: ' + LIB.RRN_CODE_LABELS[m.code]);
      if (mis && !confirm) throw new Error('[RRN_CHECK] ' + m.codes.map(function (x) { return LIB.RRN_CODE_LABELS[x]; }).join(', ') + '. 그래도 저장하려면 확인해 주세요.');
      MOCK_RRN[id] = LIB.validateRrn(rrn).rrn; DB.rrnStatus[id] = mis ? 'check' : 'ok';
      return { status: mis ? 'check' : 'ok' };
    },
    getInsuranceList: function (sid) {
      var rows = LIB.buildInsuranceList(DB.enrollments, DB.people, Object.keys(MOCK_RRN).map(function (k) { return { enroll_id: k, rrn: MOCK_RRN[k] }; }), sid);
      return c(rows);
    },
    completeInsurance: function (sid, ids) {
      var out = [];
      DB.enrollments.forEach(function (e) { if (e.session_id === sid && !e.cancel_reason && ids.indexOf(e.enroll_id) >= 0) { e.ins_at = '2026-11-18'; e.updated_at = '2026-11-18 12:30:00'; delete MOCK_RRN[e.enroll_id]; delete DB.rrnStatus[e.enroll_id]; out.push(c(e)); } });
      return out;
    },
    saveTemplate: function (t) {
      var by = function (x) { return x.name === t.name && x.stage === t.stage && x.program_id === t.program_id; };
      var cur = DB.templates.filter(function (x) { return (t.tpl_id && x.tpl_id === t.tpl_id) || by(x); })[0];
      var row = { tpl_id: cur ? cur.tpl_id : 't_' + (++SEQ), name: t.name, stage: t.stage, program_id: t.program_id, channel: t.channel, body: t.body, saved_by: 'owner@example.com', saved_at: '2026-11-18 13:00:00' };
      if (cur) DB.templates[DB.templates.indexOf(cur)] = row; else DB.templates.push(row);
      return c(row);
    },
    deleteTemplate: function (id) { DB.templates = DB.templates.filter(function (x) { return x.tpl_id !== id; }); return true; },
    logMessage: function (sid, channel, stage, filter, body, mark) {
      var T = LIB.messageTargets(DB.enrollments, sid, filter), marked = 0;
      if (mark && (stage === 'm1' || stage === 'm2')) T.forEach(function (e) { var col = stage === 'm1' ? 'm1_at' : 'm2_at'; if (!e[col]) { e[col] = '2026-11-18'; marked++; } });
      var log = { log_id: 'm_' + (++SEQ), at: '2026-11-18 13:10:00', by: 'owner@example.com', session_id: sid, channel: channel, stage: stage, filter: filter, count: T.length, body: body };
      DB.messageLog.unshift(log);
      return c({ log: log, marked: marked, count: T.length });
    },
    saveProgram: function (pid, input) {
      var u = String((input && input.form_url) || '').trim();
      if (u && !(u.indexOf('http://') === 0 || u.indexOf('https://') === 0)) throw new Error('[INVALID] 만족도 폼 링크: http:// 또는 https:// 로 시작하는 주소를 입력해 주세요');
      var p = DB.programs.filter(function (x) { return x.program_id === pid; })[0]; p.form_url = u; return c(p);
    },
    getSystemStatus: function () {
      return { email: 'owner@example.com', name: '소유자', role: 'owner', roleLabel: '소유자', version: '미리보기', now: '2026-11-18 14:00:00',
        db: { ok: true, error: '', tabs: ['Programs', 'Sessions', 'People', 'Enrollments', 'Uploads'].map(function (n) { return { name: n, ok: true, rows: 3, problem: '' }; }) }, rrn: { ok: true, error: '' },
        sweep: STATUS_MOCK.sweep, rrnHeld: { count: Object.keys(MOCK_RRN).length, oldestSavedAt: '2026-11-17' }, privacy: STATUS_MOCK.privacy, schema: { needs: STATUS_MOCK.needs } };
    },
    scanForRrn: function () { STATUS_MOCK.privacy = { last: '2026-11-18 14:01:00', total: STATUS_MOCK.leak }; return { total: STATUS_MOCK.leak, findings: STATUS_MOCK.leak ? [{ tab: 'Enrollments', column: 'memo', count: STATUS_MOCK.leak }] : [], scannedAt: '2026-11-18 14:01:00' }; },
    migrateSchema: function () { var a = STATUS_MOCK.needs.slice(); STATUS_MOCK.needs = []; return { added: a, warnings: [] }; },
    backupNow: function () { return { id: 'b1', name: '곁마을 운영 DB 백업 20261118_140200' }; },
    listStaff: function () {
      var ok = function (k, l) { return { key: k, label: l, ok: true }; }, no = function (k, l) { return { key: k, label: l, ok: false }; };
      return { targets: [{ key: 'db', label: '운영 DB' }, { key: 'rrn', label: '주민번호 파일' }], staff: [
        { email: 'owner@example.com', name: '소유자', role: 'owner', active: true, shares: [ok('db', '운영 DB'), ok('rrn', '주민번호 파일')] },
        { email: 'staff1@example.com', name: '운영진 1', role: 'member', active: true, shares: [ok('db', '운영 DB'), ok('rrn', '주민번호 파일')] },
        { email: 'staff2@example.com', name: '운영진 2', role: 'member', active: true, shares: [ok('db', '운영 DB'), no('rrn', '주민번호 파일')] },
        { email: 'old@example.com', name: '이전 운영진', role: 'member', active: false, shares: [] }] };
    },
    addStaff: function (email, name) { return { email: email, name: name, reactivated: false, shares: [{ key: 'db', label: '운영 DB', ok: true }, { key: 'rrn', label: '주민번호 파일', ok: true }] }; },
    removeStaff: function (email) { return { email: email, shares: [{ key: 'db', label: '운영 DB', ok: true }, { key: 'rrn', label: '주민번호 파일', ok: true }] }; },
    fixStaffSharing: function (email) { return { email: email, shares: [{ key: 'db', label: '운영 DB', ok: true }, { key: 'rrn', label: '주민번호 파일', ok: true }] }; }
  };
  function chain() {
    var ok = function () {}, bad = function () {};
    var h = { withSuccessHandler: function (f) { ok = f; return h; }, withFailureHandler: function (f) { bad = f; return h; } };
    Object.keys(impl).forEach(function (n) { h[n] = function () { var a = arguments; setTimeout(function () { try { ok(impl[n].apply(null, a)); } catch (e) { bad(e); } }, 20); }; });
    return h;
  }
  window.google = { script: { get run() { return chain(); } } };
})();
`;

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
${read('Style.html')}</head><body>
<div id="root"><div class="loading">불러오는 중…</div></div>
<script>${fs.readFileSync(path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), 'utf8')}</script>
<script>var APP_VERSION='미리보기'; window.__PREVIEW=${safeJson(preview)}; window.onerror=function(m,s,l,c){document.title='ERR '+m+' @'+l+':'+c;};</script>
<script>var LIB=(function(){${read('Schema.gs')}
${read('Lib.gs')}
return { messageTargets, buildInsuranceList, sanitizeApplicationPayload, parseApplicationSheet, buildApplicationPlan, collapseFills, buildUploadManifest, planUndo, planRrnWrites, rrnMatchesProfile, validateRrn, RRN_CODE_LABELS };})();</script>
<script>${mock}</script>
${read('Logic.html')}
${read('Client.html')}
${read('Apply.html')}
${read('Insure.html')}
${read('Send.html')}
${read('Admin.html')}
${{ apply: 'apply-selftest.browser.js', insurance: 'insure-selftest.browser.js', send: 'send-selftest.browser.js', admin: 'admin-selftest.browser.js', screens: 'screens-selftest.browser.js' }[arg('selftest')] ? '<script>' + read2({ apply: 'apply-selftest.browser.js', insurance: 'insure-selftest.browser.js', send: 'send-selftest.browser.js', admin: 'admin-selftest.browser.js', screens: 'screens-selftest.browser.js' }[arg('selftest')]) + '</script>' : ''}
${xss ? `<script>setTimeout(function(){
  var rendered = !!document.querySelector('.app');
  var executed = !!window.__XSS;
  var text = !rendered ? '시험 무효: 앱 화면이 그려지지 않았어요' : executed ? '스크립트 삽입 시험: 실패 (스크립트가 실행됨)' : '스크립트 삽입 시험: 통과 (앱이 그려졌고 스크립트는 실행되지 않음)';
  var color = !rendered ? '#9a5b00' : executed ? '#b4390c' : '#17803d';
  document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;left:0;right:0;bottom:0;z-index:99;padding:14px 20px;font:700 20px sans-serif;color:#fff;background:'+color+'">'+text+'</div>');
},2500);</script>` : ''}
</body></html>`;
fs.writeFileSync(out, html, 'utf8');
console.log('만든 파일: ' + out + ' (사람 ' + boot.people.length + '명, 참여 기록 ' + boot.enrollments.length + '건)');
