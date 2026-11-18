/**
 * 순수 계산 함수 모음. 구글 서비스(SpreadsheetApp, Session 등)를 쓰지 않는다.
 * 그래서 Node에서 그대로 읽어 테스트할 수 있다. (app/tests/run.js)
 */

/** 이메일 비교용 정규화: 앞뒤 공백 제거 + 소문자 */
function normalizeEmail(e) {
  return String(e == null ? '' : e).trim().toLowerCase();
}

/** Staff 행 목록에서 이 이메일의 "활성" 운영진을 찾는다. 없으면 null */
function findActiveStaff(rows, email) {
  var n = normalizeEmail(email);
  if (!n) return null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizeEmail(r.email) === n && String(r.active).trim().toUpperCase() === 'Y') return r;
  }
  return null;
}

/** 숫자만 남긴다. 전화번호 비교용: 010-1234-5678 → 01012345678 */
function digitsOnly(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

/**
 * 주민번호 모양 검사: `6자리-7자리`(하이픈·공백 허용) 또는 하이픈 없는 13자리.
 * 뒷자리 첫 숫자는 1~8만 인정해서 전화번호나 날짜가 걸리지 않게 한다.
 * 주의: 사용자가 입력한 글자 칸에만 쓴다. 13자리 시각값(밀리초)처럼 우연히 걸리는 숫자는 넣지 않는다.
 */
var RRN_PATTERN_ = /(?<!\d)\d{6}\s*-\s*[1-8]\d{6}(?!\d)|(?<!\d)\d{6}[1-8]\d{6}(?!\d)/;
function looksLikeRrn(s) {
  return RRN_PATTERN_.test(String(s == null ? '' : s));
}

/** 객체·배열 안의 모든 값에서 주민번호 모양을 찾는다 (운영 DB로 들어가는 입력 검사용) */
function containsRrn(v) {
  if (v == null) return false;
  if (typeof v === 'string') return looksLikeRrn(v);
  if (Array.isArray(v)) return v.some(containsRrn);
  if (typeof v === 'object') return Object.keys(v).some(function (k) { return containsRrn(v[k]); });
  return looksLikeRrn(String(v));
}

/** 시트 값(2차원 배열)을 객체 배열로. 완전히 빈 행은 건너뛴다. */
function rowsToObjects(cols, values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var empty = true;
    for (var j = 0; j < cols.length; j++) {
      if (row[j] !== '' && row[j] != null) { empty = false; break; }
    }
    if (empty) continue;
    var o = {};
    for (var k = 0; k < cols.length; k++) o[cols[k]] = row[k] == null ? '' : row[k];
    out.push(o);
  }
  return out;
}

/** 객체를 열 순서대로 한 행(배열)으로. 없는 값은 빈 글자 */
function objectToRow(cols, obj) {
  return cols.map(function (c) { return obj[c] == null ? '' : obj[c]; });
}

/** 시트 첫 행(header)이 정의한 열(cols)과 맞는지 검사 */
function validateHeader(cols, header) {
  var h = (header || []).map(function (x) { return String(x == null ? '' : x).trim(); });
  while (h.length && h[h.length - 1] === '') h.pop();
  var missing = cols.filter(function (c) { return h.indexOf(c) < 0; });
  var extra = h.filter(function (c) { return c && cols.indexOf(c) < 0; });
  var orderOk = missing.length === 0 && cols.every(function (c, i) { return h[i] === c; });
  return { ok: missing.length === 0 && extra.length === 0 && orderOk, missing: missing, extra: extra, orderOk: orderOk };
}

/** 열 정의 자체의 오류를 찾는다 (중복 열, 없는 키 열, 없는 텍스트 열). 문제가 없으면 빈 배열 */
function schemaProblems(schema) {
  var problems = [];
  Object.keys(schema).forEach(function (tab) {
    var def = schema[tab];
    if (!def.cols || !def.cols.length) problems.push(tab + ': 열이 없음');
    var seen = {};
    (def.cols || []).forEach(function (c) {
      if (seen[c]) problems.push(tab + ': 열 이름 중복 ' + c);
      seen[c] = true;
    });
    if (def.key && def.cols.indexOf(def.key) < 0) problems.push(tab + ': 키 열 ' + def.key + '이(가) 열 목록에 없음');
    (def.text || []).forEach(function (c) {
      if (def.cols.indexOf(c) < 0) problems.push(tab + ': 텍스트 열 ' + c + '이(가) 열 목록에 없음');
    });
  });
  return problems;
}

/** HTML 특수문자를 무력화한다 (화면에 오류 문구 등을 넣을 때 사용) */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 한국 시간(KST, UTC+9) 기준 'yyyy-MM-dd HH:mm:ss' */
function formatKst(d) {
  var t = new Date(d.getTime() + 9 * 3600 * 1000);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) + ' ' +
    p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
}

/** 새 행의 ID. 접두어 + 시각(36진수) + 난수 */
function makeId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
