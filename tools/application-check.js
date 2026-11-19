/**
 * 홈페이지 신청 엑셀/CSV의 "구조"만 점검한다. 이름·연락처·이메일·주민번호 값은 출력하지 않는다.
 * 출력: 열 이름, 열별 채워진 개수, 값의 종류가 적은 열(합격여부·동의·회차 등)의 값, 글자 형식(숫자를 9로 바꿔서),
 *       주민번호의 형식 통계(값은 출력하지 않음), 성별·출생연도와의 일치 통계, 중복 개수
 * 실행: node tools/application-check.js "파일 경로"
 */
const XLSX = require('xlsx');
const file = process.argv[2];
if (!file) { console.error('사용법: node tools/application-check.js "파일 경로"'); process.exit(2); }

// CSV는 UTF-8 글자로 먼저 읽는다 (그냥 파일로 읽으면 한글이 깨진다). 엑셀(.xlsx)은 그대로 읽는다.
const isCsv = /\.csv$/i.test(file);
const wb = isCsv
  ? XLSX.read(require('fs').readFileSync(file, 'utf8').replace(/^﻿/, ''), { type: 'string', raw: true })
  : XLSX.readFile(file, { raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
const header = (grid[0] || []).map(h => String(h).replace(/^﻿/, '').trim());
const rows = grid.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
const col = name => header.findIndex(h => h.indexOf(name) === 0 || h.indexOf(name) > -1);
const val = (r, i) => (i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim());
const shape = s => String(s).replace(/\d/g, '9').replace(/[가-힣]+/g, '가');
const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const show = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `[${k === '' ? '(빈칸)' : k}] ${v}`).join('  ');

console.log(`시트 "${wb.SheetNames[0]}" · 열 ${header.length}개 · 데이터 행 ${rows.length}개\n`);

/* 값을 그대로 보여 줘도 되는 열 (개인정보가 아닌, 값의 종류가 정해진 열) */
const SAFE_VALUE = ['성별', '초상권동의', '추가보유동의', '합격여부', '참석 여부', '프로그램 상세 시간표', '신청하시는 회차'];
/* 글자 형식만 보여 주는 열 */
const SHAPE_ONLY = ['번호', '연락처', '출생연도', '신청일'];

console.log('=== 열별 요약 ===');
header.forEach((h, i) => {
  const vals = rows.map(r => val(r, i));
  const filled = vals.filter(v => v !== '').length;
  const label = h.length > 28 ? h.slice(0, 28) + '…' : h;
  let line = `${String(i + 1).padStart(2)}. ${label}  (채움 ${filled}/${rows.length})`;
  if (SAFE_VALUE.some(k => h.indexOf(k) === 0)) line += '\n      값: ' + show(count(vals, v => v));
  else if (SHAPE_ONLY.some(k => h === k)) line += '\n      형식: ' + show(count(vals.filter(Boolean), shape));
  console.log(line);
});

/* 주민번호: 형식 통계만 */
const iRrn = header.findIndex(h => h.indexOf('주민번호') > -1);
const iGender = col('성별'), iBirth = col('출생연도'), iName = col('이름'), iPhone = col('연락처'), iRound = col('신청하시는 회차'), iPass = col('합격여부'), iCancel = col('취소사유');
const digits = s => String(s).replace(/\D/g, '');

function rrnInfo(raw, gender, birthYear) {
  const d = digits(raw);
  if (d === '') return '빈칸';
  if (d.length !== 13) return `자릿수 오류(${d.length}자리)`;
  const yy = +d.slice(0, 2), mm = +d.slice(2, 4), dd = +d.slice(4, 6), g = +d[6];
  if (!(g >= 1 && g <= 8)) return '성별 자리 오류';
  const century = g <= 2 || g === 5 || g === 6 ? 1900 : 2000;
  const dt = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== century + yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return '생년월일 오류';
  const male = g % 2 === 1;
  if (gender && ((gender === '남') !== male)) return '형식 정상 · 성별 불일치';
  if (birthYear && Number(birthYear) !== century + yy) return '형식 정상 · 출생연도 불일치';
  return '형식 정상 · 성별·출생연도 일치';
}
if (iRrn >= 0) {
  const raw = rows.map(r => val(r, iRrn));
  console.log('\n=== 주민번호 열 통계 (값은 출력하지 않음) ===');
  console.log('하이픈 있음: ' + raw.filter(v => v.includes('-')).length + ' / 없음: ' + raw.filter(v => v && !v.includes('-')).length + ' / 빈칸: ' + raw.filter(v => !v).length);
  console.log('판정: ' + show(count(rows, r => rrnInfo(val(r, iRrn), val(r, iGender), val(r, iBirth)))));
  const bad = rows.map((r, k) => ({ k: k + 2, info: rrnInfo(val(r, iRrn), val(r, iGender), val(r, iBirth)) })).filter(x => !x.info.startsWith('형식 정상 · 성별·출생연도 일치'));
  if (bad.length) console.log('확인 필요한 행(표의 N행): ' + bad.map(x => `${x.k}행(${x.info})`).join(', '));
}

/* 그 밖의 점검 */
console.log('\n=== 그 밖의 점검 ===');
const key = r => val(r, iName) + '|' + digits(val(r, iPhone)) + '|' + val(r, iRound);
const dup = count(rows, key);
console.log('같은 사람(이름+연락처)이 같은 회차에 두 번: ' + Object.values(dup).filter(n => n > 1).length + '명');
const person = r => val(r, iName) + '|' + digits(val(r, iPhone));
const multi = count(rows, person);
console.log('여러 회차에 신청한 사람: ' + Object.values(multi).filter(n => n > 1).length + '명');
console.log('이름에 괄호가 있는 행: ' + rows.filter(r => /[()]/.test(val(r, iName))).length + '개');
console.log('연락처를 읽을 수 없는 행(010 형식이 아님): ' + rows.filter(r => !/^01\d{8,9}$/.test(digits(val(r, iPhone)))).length + '개');
console.log('취소사유가 있는 행: ' + rows.filter(r => val(r, iCancel) !== '').length + '개 / 합격여부가 "합격"인 취소 행: ' + rows.filter(r => val(r, iCancel) !== '' && val(r, iPass) === '합격').length + '개');
console.log('합격여부 값이 합격/불합격이 아닌 행: ' + rows.filter(r => !['합격', '불합격'].includes(val(r, iPass))).length + '개');
