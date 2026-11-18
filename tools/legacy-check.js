/**
 * 기존 엑셀을 이관 규칙에 넣어 보고 "집계와 경고"만 출력하는 사전 점검 도구.
 * 이름·연락처·메일·주민번호는 출력하지 않는다. 아무 데도 저장하거나 전송하지 않는다.
 *
 * 실행: node tools/legacy-check.js "엑셀 경로" [참가비=50000] [정원=7] [오늘=2026-11-18]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const file = process.argv[2];
if (!file) { console.error('사용법: node tools/legacy-check.js "엑셀 경로"'); process.exit(2); }
const fee = Number(process.argv[3] || 50000), cap = Number(process.argv[4] || 7), today = process.argv[5] || '2026-11-18';

const appDir = path.join(__dirname, '..', 'app');
const ctx = vm.createContext({ console });
vm.runInContext(['Schema.gs', 'Lib.gs'].map(f => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n'), ctx);
const lib = vm.runInContext('({ parseLegacySheet, buildLegacyPlan })', ctx);

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

const parsed = lib.parseLegacySheet(rows);
const plan = lib.buildLegacyPlan(parsed, { program_id: 'w', year: 2026, fee, cap, today, now: today + ' 00:00:00' });

console.log(`시트 "${wb.SheetNames[0]}" · 읽은 행 ${rows.length}개 · 회차 ${plan.sessions.length}개 · 사람 ${plan.people.length}명 · 참여 기록 ${plan.enrollments.length}건`);
console.log(`판정: ${plan.ok ? '이관 가능 (오류 없음)' : '이관 불가 (오류 있음)'}\n`);

const head = ['회차', '전체', '취소', '참여', '입금', '1차안내', '최종안내', '보험', '참석', '부분환불', '자차', '고속', '시외', '이동수단빈칸'];
console.log(head.join('\t'));
plan.summary.forEach(s => console.log([s.session_id, s.total, s.cancelled, s.active, s.paid, s.m1, s.m2, s.ins, s.attend, s.refunded, s.car, s.exp, s.int, s.blankTransport].join('\t')));
const sum = k => plan.summary.reduce((a, s) => a + s[k], 0);
console.log(['합계', sum('total'), sum('cancelled'), sum('active'), sum('paid'), sum('m1'), sum('m2'), sum('ins'), sum('attend'), sum('refunded'), sum('car'), sum('exp'), sum('int'), sum('blankTransport')].join('\t'));

/* 사전 합의한 기대 결과 (DEV_PLAN_STAGE1.md "이관 후 기대 결과") */
const expected = {
  w1: { total: 5, cancelled: 2, active: 3, paid: 3, m2: 3, ins: 3, attend: 1 },
  w2: { total: 8, cancelled: 3, active: 5, paid: 5, m2: 5, ins: 5, attend: 0 },
  w3: { total: 9, cancelled: 3, active: 6, paid: 6, m2: 6, ins: 6, attend: 0 },
  w4: { total: 4, cancelled: 0, active: 4, paid: 4, m2: 4, ins: 4, attend: 0 },
  w5: { total: 8, cancelled: 3, active: 5, paid: 5, m2: 4, ins: 5, attend: 0 }
};
let mismatch = 0;
plan.summary.forEach(s => {
  const e = expected[s.session_id];
  if (!e) { console.log(`기대표에 없는 회차: ${s.session_id}`); mismatch++; return; }
  Object.keys(e).forEach(k => { if (s[k] !== e[k]) { mismatch++; console.log(`  ✗ ${s.session_id}.${k}: 기대 ${e[k]} / 실제 ${s[k]}`); } });
});
console.log(mismatch === 0 ? '\n기대 결과와 모두 일치합니다 ✓' : `\n기대 결과와 다른 항목 ${mismatch}개 ✗`);

console.log(`\n경고 ${plan.warnings.length}개 (개인정보 없이 위치만 표시):`);
plan.warnings.forEach(w => console.log('  - ' + w));
console.log(`오류 ${plan.errors.length}개:`);
plan.errors.forEach(e => console.log('  - ' + e));

/* 환불·취소 사유 분포 (개인정보 없음) */
const reasons = {};
plan.enrollments.forEach(e => { if (e.cancel_reason) reasons[e.cancel_reason] = (reasons[e.cancel_reason] || 0) + 1; });
console.log('\n취소 사유 분포:', JSON.stringify(reasons));
console.log('주민번호가 결과에 포함됐는지:', /\d{6}-?[1-8]\d{6}/.test(JSON.stringify(plan)) ? '포함됨 ✗' : '없음 ✓');
process.exit(plan.ok && mismatch === 0 ? 0 : 1);
