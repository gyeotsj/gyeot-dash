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

/** 한국 시간 기준 오늘 'yyyy-MM-dd' */
function todayKst(d) {
  return formatKst(d || new Date()).slice(0, 10);
}

/* ---------- 쓰기 검증 ---------- */

/** 'yyyy-MM-dd'가 실제로 있는 날짜인지 */
function isValidDate(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s));
  if (!m) return false;
  var y = +m[1], mo = +m[2], d = +m[3];
  var dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 전화번호를 010-1234-5678 형태로. 숫자가 9~11자리가 아니면 null */
function normalizePhone(s) {
  var d = digitsOnly(s);
  if (d.length < 9 || d.length > 11) return null;
  if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  if (d.length === 10) {
    return d.slice(0, 2) === '02' ? d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6)
                                  : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  }
  return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
}

var EMAIL_PATTERN_ = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 규칙 하나로 값 하나를 검사한다. 통과하면 정리된 값을 돌려준다. */
function validateValue(rule, raw) {
  var ok = function (v) { return { ok: true, value: v }; };
  var bad = function (e) { return { ok: false, error: e }; };
  var v = raw == null ? '' : raw;
  switch (rule.type) {
    case 'enum':
      v = String(v);
      return rule.values.indexOf(v) >= 0 ? ok(v) : bad('허용되지 않은 값이에요');
    case 'text':
      v = String(v).trim();
      if (rule.required && !v) return bad('비워 둘 수 없어요');
      if (v.length > rule.max) return bad('너무 길어요 (최대 ' + rule.max + '자)');
      return ok(v);
    case 'int': {
      var s = String(v).trim();
      if (s === '') return rule.empty ? ok('') : bad('숫자를 입력해 주세요');
      if (!/^\d+$/.test(s)) return bad('숫자만 입력해 주세요');
      var n = parseInt(s, 10);
      if (rule.min != null && n < rule.min) return bad(rule.min + ' 이상이어야 해요');
      if (rule.max != null && n > rule.max) return bad(rule.max + ' 이하여야 해요');
      return ok(n);
    }
    case 'date':
      v = String(v).trim();
      if (v === '') return rule.empty ? ok('') : bad('날짜를 입력해 주세요');
      return isValidDate(v) ? ok(v) : bad('날짜 형식이 맞지 않아요 (예: 2026-10-09)');
    case 'email':
      v = String(v).trim();
      if (v === '') return rule.empty ? ok('') : bad('이메일을 입력해 주세요');
      return EMAIL_PATTERN_.test(v) ? ok(v) : bad('이메일 형식이 맞지 않아요');
    case 'phone': {
      var p = normalizePhone(v);
      return p ? ok(p) : bad('전화번호 형식이 맞지 않아요');
    }
  }
  return bad('알 수 없는 규칙');
}

/**
 * 수정 요청(patch)을 규칙(rules)으로 검사한다.
 * - rules에 없는 항목은 거부한다.
 * - 어떤 값이든 주민번호 모양이면 거부한다.
 * 반환: { ok, clean(정리된 값), errors({항목: 문구}) }
 */
function validatePatch(rules, patch) {
  var clean = {}, errors = {};
  var keys = Object.keys(patch || {});
  if (!keys.length) return { ok: false, clean: clean, errors: { _: '바꿀 내용이 없어요' } };
  keys.forEach(function (k) {
    if (!rules[k]) { errors[k] = '수정할 수 없는 항목이에요'; return; }
    if (containsRrn(patch[k])) { errors[k] = '주민번호로 보이는 값은 저장할 수 없어요'; return; }
    var r = validateValue(rules[k], patch[k]);
    if (r.ok) clean[k] = r.value; else errors[k] = r.error;
  });
  return { ok: Object.keys(errors).length === 0, clean: clean, errors: errors };
}

/** 다른 운영진이 먼저 수정했는지. expected가 없으면 검사하지 않는다. */
function hasConflict(currentUpdatedAt, expected) {
  if (expected == null || expected === '') return false;
  return String(currentUpdatedAt == null ? '' : currentUpdatedAt) !== String(expected);
}

/** 단계 체크 값을 열 값으로 바꾼다. 날짜 단계는 켜면 오늘 날짜, 끄면 빈칸. 참석은 '참석'/'불참'/빈칸 */
function stepPatch(step, value, today) {
  var def = STEP_DEFS[step];
  if (!def) throw new Error('알 수 없는 단계: ' + step);
  var out = {};
  if (def.kind === 'date') {
    out[def.col] = (value === true || value === 'true' || value === 1) ? today : '';
  } else {
    var v = value === true ? '참석' : (value === false || value == null) ? '' : String(value);
    if (['', '참석', '불참'].indexOf(v) < 0) throw new Error('참석 여부는 참석/불참/빈칸만 가능해요');
    out[def.col] = v;
  }
  return out;
}

/** 취소 사유가 있으면 취소일을 오늘(이미 있으면 유지)로, 사유를 비우면 취소일도 비운다 */
function normalizeCancel(patch, current, today) {
  var out = {};
  Object.keys(patch).forEach(function (k) { out[k] = patch[k]; });
  if (Object.prototype.hasOwnProperty.call(patch, 'cancel_reason')) {
    out.cancelled_at = patch.cancel_reason !== '' ? (current.cancelled_at || today) : '';
  }
  return out;
}

/** 같은 이름 + 같은 전화번호를 가진 "다른" 사람이 있는지 (동일인 중복 방지) */
function isDuplicatePerson(people, personId, name, phone) {
  var n = String(name == null ? '' : name).trim();
  var d = digitsOnly(phone);
  return people.some(function (p) {
    return String(p.person_id) !== String(personId) && String(p.name).trim() === n && digitsOnly(p.phone) === d;
  });
}

/** 회차 입력을 검사한다. 새 회차면 session_id를 만들어 돌려준다 (예: 일해보기 2회차 → w2) */
function validateSession(input, existing) {
  var errors = {}, clean = {};
  var fields = existing ? ['start', 'end', 'fee', 'cap', 'note'] : ['program_id', 'n', 'start', 'end', 'fee', 'cap', 'note'];
  fields.forEach(function (k) {
    var raw = input[k];
    if (k === 'note' && (raw == null || raw === '')) { clean.note = ''; return; }
    if (containsRrn(raw)) { errors[k] = '주민번호로 보이는 값은 저장할 수 없어요'; return; }
    var r = validateValue(SESSION_RULES[k], raw);
    if (r.ok) clean[k] = r.value; else errors[k] = r.error;
  });
  var start = clean.start || (existing && existing.start), end = clean.end || (existing && existing.end);
  if (!errors.start && !errors.end && start && end && start > end) errors.end = '종료일이 시작일보다 빠를 수 없어요';
  if (!existing && !errors.program_id && !errors.n) clean.session_id = clean.program_id + clean.n;
  return { ok: Object.keys(errors).length === 0, clean: clean, errors: errors };
}

/** 구글이 날짜(Date)로 바꿔 놓은 값을 글자로 되돌려 화면으로 보낼 수 있는 형태로 만든다 */
function plainRow(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    out[k] = (v instanceof Date) ? formatKst(v) : v;
  });
  return out;
}

/** 검증 오류 목록({항목: 문구})에서 첫 번째를 "항목: 문구" 형태로 */
function firstError(errors) {
  var k = Object.keys(errors || {})[0];
  if (!k) return '입력을 확인해 주세요';
  return (FIELD_LABELS[k] || k) + ': ' + errors[k];
}

/** 오류 문구에 코드를 붙인다. 화면이 코드로 종류를 구분한다. 예: [CONFLICT] 다른 운영진이 ... */
function apiError(code, message) {
  return new Error('[' + code + '] ' + message);
}
