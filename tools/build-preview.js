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
const imp = arg('imp');
const preview = {
  screen: arg('screen') || 'dash', sid: arg('sid') || undefined,
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
  var COLS = { m1: 'm1_at', pay: 'pay_at', ins: 'ins_at', m2: 'm2_at', attend: 'attend' };
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
<script>var APP_VERSION='미리보기'; window.__PREVIEW=${safeJson(preview)}; window.onerror=function(m,s,l,c){document.title='ERR '+m+' @'+l+':'+c;};</script>
<script>${mock}</script>
${read('Logic.html')}
${read('Client.html')}
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
