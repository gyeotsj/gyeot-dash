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

/* ---------- 운영진 관리 (F14) ---------- */

/** 운영진 추가 입력 검사. 이메일은 소문자로 정리하고, 이름이 비어 있으면 이메일 앞부분을 쓴다. */
function validateStaffInput(email, name) {
  var e = normalizeEmail(email);
  if (!EMAIL_PATTERN_.test(e) || e.length > 100) return { ok: false, error: '이메일 형식이 맞지 않아요.' };
  var n = String(name == null ? '' : name).trim();
  if (n.length > 40) return { ok: false, error: '이름은 40자까지만 쓸 수 있어요.' };
  if (containsRrn(n)) return { ok: false, error: '주민번호로 보이는 값은 저장할 수 없어요.' };
  return { ok: true, email: e, name: n || e.split('@')[0] };
}

/** 운영진 삭제 가능 여부. 목록에 없거나, 본인이거나, 소유자면 막는다. */
function planStaffRemoval(rows, target, actor) {
  var t = normalizeEmail(target), a = normalizeEmail(actor);
  var row = rows.filter(function (r) { return normalizeEmail(r.email) === t && String(r.active).trim().toUpperCase() === 'Y'; })[0];
  if (!row) return { ok: false, error: '운영진 목록에 없는 이메일이에요.' };
  if (t === a) return { ok: false, error: '본인은 삭제할 수 없어요.' };
  if (row.role === 'owner') return { ok: false, error: '소유자는 삭제할 수 없어요.' };
  return { ok: true, row: row };
}

/** 이메일 목록에 이 이메일이 있는지 (대소문자·공백 무시) */
function isEmailIn(list, email) {
  var n = normalizeEmail(email);
  return !!n && (list || []).some(function (x) { return normalizeEmail(x) === n; });
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

/* ================= 기존 엑셀 이관 (F8) =================
 * 브라우저가 엑셀을 읽어 parseLegacySheet 로 정리하고, 서버는 buildLegacyPlan 으로 규칙을 적용한다.
 * 규칙의 정본은 PRD.md "기존 엑셀 이관 규칙". 주민번호 열은 읽지 않으며 결과에도 담기지 않는다.
 */

/**
 * 화면에서 온 엑셀 행(2차원 배열)을 정리한다. 글자·숫자·불리언만 남기고 길이를 자른다.
 * 화면은 주민번호 열을 지운 뒤 보내지만, 서버도 주민번호 모양의 값이 하나라도 있으면 거부한다.
 * 반환: { ok, error, rows }
 */
function sanitizeLegacyRows(rows) {
  var bad = function (e) { return { ok: false, error: e }; };
  if (!Array.isArray(rows)) return bad('이관 데이터 형식이 맞지 않아요.');
  if (rows.length > 2000) return bad('행이 너무 많아요 (최대 2,000행).');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r == null) { out.push([]); continue; }
    if (!Array.isArray(r) || r.length > 30) return bad('이관 데이터 형식이 맞지 않아요.');
    out.push(r.map(function (c) {
      var t = typeof c;
      if (t === 'number' || t === 'boolean') return c;
      if (t === 'string') return c.slice(0, 200);
      return '';
    }));
  }
  if (containsRrn(out)) return bad('주민번호 모양의 값이 들어 있어요. 이관을 중단했어요. 엑셀의 주민번호 열이 전송되지 않았는지 확인해 주세요.');
  return { ok: true, rows: out };
}

/** 엑셀 헤더 이름. 주민번호('주민번호') 열은 일부러 목록에 넣지 않는다. */
var LEGACY_HEADERS = {
  name: '신청자명', phone: '연락처', email: '메일', gender: '성별', birth: '출생연도',
  m1: '1차 안내메일', car: '자차', exp: '고속', int: '시외', pay: '참가비 이체', m2: '최종 안내메일'
};

/** 회차 제목 "3회차 | 10/19(월)-21(수)" 또는 "7회차 | 10/30(금)-11/1(일)" → { n, start, end } (날짜는 yyyy-MM-dd). 못 읽으면 null */
function parseSessionTitle(text, year) {
  var m = /(\d+)\s*회차\s*\|\s*(\d{1,2})\/(\d{1,2})\s*(?:\([^)]*\))?\s*[-~–]\s*(?:(\d{1,2})\/)?(\d{1,2})/.exec(String(text == null ? '' : text));
  if (!m) return null;
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var sm = +m[2], sd = +m[3], em = m[4] ? +m[4] : sm, ed = +m[5];
  var start = year + '-' + p2(sm) + '-' + p2(sd), end = year + '-' + p2(em) + '-' + p2(ed);
  if (!isValidDate(start) || !isValidDate(end) || start > end) return null;
  return { n: +m[1], start: start, end: end };
}

/** 헤더 행에서 각 항목의 열 번호를 찾는다. 빠진 항목은 missing 에 모은다. (주민번호 열은 찾지 않는다) */
function mapLegacyColumns(texts) {
  var cols = {}, missing = [];
  Object.keys(LEGACY_HEADERS).forEach(function (k) {
    var idx = texts.indexOf(LEGACY_HEADERS[k]);
    if (idx < 0) missing.push(LEGACY_HEADERS[k]); else cols[k] = idx;
  });
  cols.missing = missing;
  return cols;
}

/**
 * 엑셀 첫 시트(2차원 배열)를 회차별 행으로 정리한다. 결과에는 개인정보 중 이름·연락처·메일·성별·출생연도만 있고
 * 주민번호는 없다. 경고는 개인정보를 담지 않고 "표의 몇 행"처럼 위치만 알려 준다.
 * 반환: { sessions: [{ title, rowNo, missing, rows: [...] }], warnings: [{ code, rowNo, msg }] }
 */
function parseLegacySheet(rows) {
  var out = { sessions: [], warnings: [] };
  var cur = null, cols = null;
  var str = function (v) { return v == null ? '' : String(v).trim(); };
  var TITLE = /^\s*\d+\s*회차\s*\|/;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];
    var texts = row.map(str);
    var any = texts.some(function (t) { return t !== ''; });

    var tIdx = -1;
    for (var j = 0; j < texts.length; j++) { if (TITLE.test(texts[j])) { tIdx = j; break; } }
    if (tIdx >= 0) { cur = { title: texts[tIdx], rowNo: i + 1, missing: [], rows: [] }; out.sessions.push(cur); cols = null; continue; }

    if (texts.indexOf('신청자명') >= 0) {
      cols = mapLegacyColumns(texts);
      if (!cur) { cur = { title: '', rowNo: i + 1, missing: [], rows: [] }; out.sessions.push(cur); }
      cur.missing = cols.missing;
      continue;
    }

    if (!cur || !cols || cols.missing.length) {
      if (any) out.warnings.push({ code: 'STRAY', rowNo: i + 1, msg: '표 밖에 값이 있어 건너뛰었어요 (' + (i + 1) + '행)' });
      continue;
    }
    var name = str(row[cols.name]);
    if (!name) {
      if (any) out.warnings.push({ code: 'NO_NAME', rowNo: i + 1, msg: '이름이 없는 행에 값이 있어 건너뛰었어요 (' + (i + 1) + '행)' });
      continue;
    }
    cur.rows.push({
      rowNo: i + 1, name: name,
      phone: str(row[cols.phone]), email: str(row[cols.email]), gender: str(row[cols.gender]), birth: str(row[cols.birth]),
      m1: str(row[cols.m1]) !== '', car: str(row[cols.car]) !== '', exp: str(row[cols.exp]) !== '', int: str(row[cols.int]) !== '',
      pay: str(row[cols.pay]), m2: str(row[cols.m2]) !== ''
    });
  }
  return out;
}

/** 이관용 전화번호: 엑셀이 앞자리 0을 지운 경우(10자리 10으로 시작)를 되살린 뒤 010-1234-5678 형태로. 못 읽으면 null */
function legacyPhone(raw) {
  var d = digitsOnly(raw);
  if (d.length === 10 && d.indexOf('10') === 0) d = '0' + d;
  return normalizePhone(d);
}

/** 입금 칸 해석: '' → 미입금, 'ㅇ' → 입금, 'ㅇ 25000원 환불' → 입금 + 환불 25000 */
function parseLegacyPay(text) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return { paid: false, refund: 0 };
  var m = /(\d[\d,]*)\s*원[^\d]*환불|환불[^\d]*(\d[\d,]*)\s*원/.exec(t);
  var refund = m ? parseInt((m[1] || m[2]).replace(/,/g, ''), 10) : 0;
  return { paid: true, refund: refund };
}

/** 자차/고속/시외 표시 → 이동수단. 하나만 표시돼 있으면 변환, 없거나 둘 이상이면 빈칸 */
function legacyTransport(car, exp, int) {
  var picked = [];
  if (car) picked.push('자차'); if (exp) picked.push('고속터미널'); if (int) picked.push('시외터미널');
  return { value: picked.length === 1 ? picked[0] : '', count: picked.length };
}

/**
 * 정리된 엑셀(parsed)에 PRD의 이관 규칙을 적용해 만들 행을 계산한다. 저장하지는 않는다.
 * opts: { program_id, year, fee, cap, today, now, makeId }
 * 반환: { ok, errors, warnings, sessions, people, enrollments, summary }
 *  - errors 가 있으면 이관하면 안 된다 (ok=false). warnings 는 알려 주기만 한다. 둘 다 개인정보를 담지 않는다.
 */
function buildLegacyPlan(parsed, opts) {
  var errors = [], warnings = (parsed.warnings || []).map(function (w) { return w.msg; });
  var sessions = [], people = [], enrollments = [], summary = [];
  var peopleByKey = {}, seenSession = {};
  var fee = opts.fee, today = opts.today, now = opts.now;
  var idGen = opts.makeId || makeId;

  if (containsRrn(parsed.sessions)) errors.push('주민번호 모양의 값이 입력에 들어 있어요. 이관을 중단했어요.');
  if (!parsed.sessions || !parsed.sessions.length) errors.push('회차를 찾지 못했어요. 엑셀의 "N회차 | 날짜" 제목 행을 확인해 주세요.');

  (parsed.sessions || []).forEach(function (ps) {
    var label = ps.title || ('표의 ' + ps.rowNo + '행');
    var t = parseSessionTitle(ps.title, opts.year);
    if (!t) { errors.push('회차 제목을 읽지 못했어요: ' + label); return; }
    if (ps.missing && ps.missing.length) { errors.push(t.n + '회차 헤더에 없는 열: ' + ps.missing.join(', ')); return; }
    var sid = opts.program_id + t.n;
    if (seenSession[sid]) { errors.push(t.n + '회차가 엑셀에 두 번 나와요'); return; }
    seenSession[sid] = true;
    sessions.push({ session_id: sid, program_id: opts.program_id, n: t.n, start: t.start, end: t.end, fee: fee, cap: opts.cap, note: '기존 엑셀 이관' });

    var sum = { session_id: sid, total: 0, cancelled: 0, active: 0, paid: 0, m1: 0, m2: 0, ins: 0, attend: 0, refunded: 0, car: 0, exp: 0, int: 0, blankTransport: 0 };
    var seenInSession = {};

    ps.rows.forEach(function (r) {
      var where = t.n + '회차 표의 ' + r.rowNo + '행';
      var rawName = r.name, name = rawName, paren = '';
      var pm = /^([^()]+?)\s*\((.*)\)\s*$/.exec(rawName);
      if (pm) { name = pm[1].trim(); paren = pm[2].trim(); warnings.push(where + ': 이름 칸에 괄호가 있어 앞부분만 이름으로 쓰고 괄호 안 내용은 남긴 말에 보관했어요'); }
      var nv = validateValue(PERSON_EDITABLE.name, name);
      if (!nv.ok) { errors.push(where + ': 이름 ' + nv.error); return; }
      name = nv.value;

      var phone = legacyPhone(r.phone);
      if (!phone) { errors.push(where + ': 연락처를 읽지 못했어요'); return; }

      var key = name + '|' + digitsOnly(phone);
      if (seenInSession[key]) { warnings.push(where + ': 같은 회차에 같은 사람이 또 있어 건너뛰었어요'); return; }
      seenInSession[key] = true;

      var person = peopleByKey[key];
      if (!person) {
        var gender = (r.gender === '남' || r.gender === '여') ? r.gender : '';
        if (!gender) warnings.push(where + ': 성별을 읽지 못해 비워 뒀어요');
        var by = parseInt(String(r.birth).replace(/\D/g, ''), 10);
        var birth = (by >= 1900 && by <= opts.year) ? by : '';
        if (birth === '') warnings.push(where + ': 출생연도를 읽지 못해 비워 뒀어요');
        var ev = validateValue(PERSON_EDITABLE.email, r.email);
        if (!ev.ok) warnings.push(where + ': 이메일 형식이 맞지 않아 비워 뒀어요');
        person = {
          person_id: idGen('p_'), name: name, phone: phone, email: ev.ok ? ev.value : '', gender: gender, birth_year: birth,
          job: '', area: '', consent_retain: '', consent_portrait: '', created_at: now, updated_at: now
        };
        peopleByKey[key] = person;
        people.push(person);
      }

      var pay = parseLegacyPay(r.pay);
      var tr = legacyTransport(r.car, r.exp, r.int);
      if (tr.count > 1) warnings.push(where + ': 이동수단이 둘 이상 표시돼 있어 비워 뒀어요');

      var e = {
        enroll_id: idGen('e_'), session_id: sid, person_id: person.person_id, hp_no: '', applied_at: '', pass: '합격', notice_ack: '',
        memo: paren ? '[이관] 이름 칸의 괄호 내용: ' + paren : '', transport: tr.value,
        m1_at: r.m1 ? today : '', pay_at: pay.paid ? today : '', pay_amount: pay.paid ? fee : '', refund_amount: pay.refund || '',
        ins_at: '', m2_at: r.m2 ? today : '', attend: '', cancel_reason: '', cancelled_at: '', updated_at: now, updated_by: 'legacy-import'
      };
      if (!pay.paid) {
        e.cancel_reason = '입금 미확인(이관 시 취소 처리)'; e.cancelled_at = today;
      } else if (pay.refund >= fee && fee > 0) {
        e.cancel_reason = '전액 환불(이관)'; e.cancelled_at = today;
      } else if (pay.refund > 0) {
        e.attend = '참석';                       // 참석 후 부분 환불
      }
      if (!e.cancel_reason) e.ins_at = today;    // 취소가 아닌 참여자는 보험 가입 완료로 기록
      enrollments.push(e);

      sum.total++;
      if (e.cancel_reason) { sum.cancelled++; return; }
      sum.active++;
      if (e.pay_at) sum.paid++;
      if (e.m1_at) sum.m1++;
      if (e.m2_at) sum.m2++;
      if (e.ins_at) sum.ins++;
      if (e.attend === '참석') sum.attend++;
      if (pay.refund > 0) sum.refunded++;
      if (e.transport === '자차') sum.car++; else if (e.transport === '고속터미널') sum.exp++; else if (e.transport === '시외터미널') sum.int++; else sum.blankTransport++;
    });
    summary.push(sum);
  });

  return { ok: errors.length === 0, errors: errors, warnings: warnings, sessions: sessions, people: people, enrollments: enrollments, summary: summary };
}


/* ================= 2단계: 주민번호 규칙 (R3, R3-2) =================
 * 이 구역의 함수는 주민번호 "값"을 다루지만, 돌려주는 오류·사유에는 값을 담지 않고 코드(EMPTY 등)만 담는다.
 * 화면용 같은 규칙이 Logic.html 에 있다. (app/tests/run.js 가 두 코드가 같은 결과를 내는지 비교한다)
 */

/** 사유 코드의 한글 설명. 값은 담지 않는다. */
var RRN_CODE_LABELS = {
  EMPTY: '비어 있어요',
  LENGTH: '자릿수가 맞지 않아요',
  BIRTHDATE: '생년월일이 올바르지 않아요',
  GENDER_DIGIT: '성별 자리가 올바르지 않아요',
  BIRTH_MISMATCH: '출생연도가 신청서와 달라요',
  GENDER_MISMATCH: '성별이 신청서와 달라요'
};

function isRealYmd_(y, m, d) {
  var t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * 형식 검사. 숫자 13자리, 앞 6자리가 실제 있는 생년월일, 성별 자리 1~8. 체크섬은 검사하지 않는다.
 * 하이픈·공백은 허용하고, 통과하면 하이픈 형태(900101-1234567)로 정리해 돌려준다.
 * 숫자 칸으로 읽혀 앞의 0이 지워진 12자리 숫자는 0을 되살려 본다 (restored=true).
 * 반환: { ok, code('OK'|'EMPTY'|'LENGTH'|'BIRTHDATE'|'GENDER_DIGIT'), rrn, birthYear, male, restored }
 */
function validateRrn(raw) {
  var d, restored = false;
  if (typeof raw === 'number' && isFinite(raw)) {
    d = String(Math.round(raw));
    if (d.length === 12) { d = '0' + d; restored = true; }
  } else {
    d = digitsOnly(raw);
  }
  if (!d) return { ok: false, code: 'EMPTY' };
  if (d.length !== 13) return { ok: false, code: 'LENGTH' };
  var g = +d.charAt(6);
  if (g < 1 || g > 8) return { ok: false, code: 'GENDER_DIGIT' };
  var century = (g === 1 || g === 2 || g === 5 || g === 6) ? 1900 : 2000;
  var year = century + (+d.slice(0, 2));
  if (!isRealYmd_(year, +d.slice(2, 4), +d.slice(4, 6))) return { ok: false, code: 'BIRTHDATE' };
  return { ok: true, code: 'OK', rrn: d.slice(0, 6) + '-' + d.slice(6), birthYear: year, male: g % 2 === 1, restored: restored };
}

/**
 * 신청서의 성별·출생연도와 번호가 맞는지 대조한다 (R3-2).
 * 반환: { ok, code, codes } — 형식부터 틀리면 그 사유, 형식이 맞으면 BIRTH_MISMATCH / GENDER_MISMATCH (둘 다 틀리면 codes에 둘 다)
 */
function rrnMatchesProfile(raw, gender, birthYear) {
  var v = validateRrn(raw);
  if (!v.ok) return { ok: false, code: v.code, codes: [v.code] };
  var codes = [];
  var by = parseInt(birthYear, 10);
  if (by && by !== v.birthYear) codes.push('BIRTH_MISMATCH');
  if ((gender === '남' || gender === '여') && ((gender === '남') !== v.male)) codes.push('GENDER_MISMATCH');
  return codes.length ? { ok: false, code: codes[0], codes: codes } : { ok: true, code: 'OK', codes: [] };
}

/** 저장된 번호(없으면 null)의 상태: 'ok' 보관 중 / 'missing' 없음 / 'check' 있지만 형식·대조에 걸림. 값은 돌려주지 않는다. */
function rrnStatusFor(storedRrn, person) {
  if (storedRrn == null || String(storedRrn).trim() === '') return 'missing';
  return rrnMatchesProfile(storedRrn, person && person.gender, person && person.birth_year).ok ? 'ok' : 'check';
}

/* ================= 2단계: 신청 엑셀 (F5) =================
 * 규칙의 정본은 DEV_PLAN_STAGE2.md 와 PRD.md. 주민번호 열은 이 구역의 함수가 읽지 않는다.
 */

/** 신청 엑셀의 열 이름. 앞부분이 같으면 같은 열로 본다. 주민번호('주민번호')는 일부러 넣지 않았다. */
var APP_HEADERS = {
  hp_no: '번호', name: '이름', phone: '연락처', gender: '성별', birth: '출생연도', job: '직업', area: '거주지', email: '이메일',
  notice: '프로그램 상세 시간표', round: '신청하시는 회차', memo: '이외에 곁마을 운영진에게', memo2: '기타답변',
  portrait: '초상권동의', retain: '추가보유동의', applied: '신청일', pass: '합격여부', attend: '참석 여부', cancel: '취소사유'
};
/** 없으면 읽을 수 없는 열 */
var APP_REQUIRED = ['name', 'phone', 'gender', 'birth', 'round', 'pass', 'portrait', 'retain'];

/**
 * 회차 칸 해석. "3회차 | 예술의 곁 | 10/19-21", "5회차  | 자연의 곁 | 10/26-28", "3회차 | 10/19(월)-21(수)" 모두 읽는다.
 * 반환: { n, theme, startMD:'10-19', endMD:'10-21' } (없는 부분은 null). 회차 번호를 못 찾으면 null
 */
function parseApplicationRound(text) {
  var parts = String(text == null ? '' : text).split('|').map(function (s) { return s.replace(/\s+/g, ' ').trim(); });
  var m = /(\d+)\s*회차/.exec(parts[0] || '');
  if (!m) return null;
  var out = { n: +m[1], theme: null, startMD: null, endMD: null };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  parts.slice(1).forEach(function (part) {
    var d = /^(\d{1,2})\/(\d{1,2})\s*(?:\([^)]*\))?\s*[-~–]\s*(?:(\d{1,2})\/)?(\d{1,2})/.exec(part);
    if (d) {
      out.startMD = p2(d[1]) + '-' + p2(d[2]);
      out.endMD = p2(d[3] || d[1]) + '-' + p2(d[4]);
    } else if (part) {
      out.theme = part;
    }
  });
  return out;
}

/** 신청일 → 'yyyy-MM-dd'. "2026-11-10 9:30", "2026-11-10 09:30", 날짜만 있는 것도 읽는다. 못 읽으면 '' */
function parseApplicationDate(text) {
  var m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(text == null ? '' : text));
  if (!m) return '';
  var s = m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  return isValidDate(s) ? s : '';
}

/** 동의 칸: '동의' → 'Y', '미동의' → 'N', 그 밖은 null(읽을 수 없음), 빈칸은 '' */
function applicationConsent(text) {
  var t = String(text == null ? '' : text).trim();
  if (t === '') return '';
  if (t === '동의') return 'Y';
  if (t === '미동의') return 'N';
  return null;
}

/**
 * 신청 엑셀(2차원 배열)을 읽는다. 첫 번째로 "이름" 열이 있는 행을 머리글로 본다.
 * 반환: { rows: [...], warnings: [{ rowNo, msg }], missing: [없는 열 이름], headerRow }
 *  - rowNo 는 배열 번호 + 1 (화면이 보낸 행 배열 기준). 주민번호 열은 읽지 않는다.
 */
function parseApplicationSheet(rows) {
  var out = { rows: [], warnings: [], missing: [], headerRow: 0 };
  var str = function (v) { return v == null ? '' : String(v).trim(); };
  var hi = -1;
  for (var i = 0; i < rows.length; i++) {
    var texts = (rows[i] || []).map(function (c) { return str(c).replace(/^﻿/, ''); });
    if (texts.indexOf('이름') >= 0) { hi = i; break; }
  }
  if (hi < 0) { out.missing = ['이름']; return out; }
  out.headerRow = hi + 1;
  var head = (rows[hi] || []).map(function (c) { return str(c).replace(/^﻿/, ''); });
  var cols = {};
  Object.keys(APP_HEADERS).forEach(function (k) {
    for (var j = 0; j < head.length; j++) {
      if (head[j] && head[j].indexOf(APP_HEADERS[k]) === 0) { cols[k] = j; break; }
    }
  });
  APP_REQUIRED.forEach(function (k) { if (cols[k] == null) out.missing.push(APP_HEADERS[k]); });
  if (out.missing.length) return out;

  var get = function (r, k) { return cols[k] == null ? '' : str(r[cols[k]]); };
  for (var x = hi + 1; x < rows.length; x++) {
    var r = rows[x] || [];
    var any = r.some(function (c) { return str(c) !== ''; });
    if (!any) continue;
    var rowNo = x + 1;
    var name = get(r, 'name');
    if (!name) { out.warnings.push({ rowNo: rowNo, msg: '이름이 없는 행이라 건너뛰었어요 (표의 ' + rowNo + '행)' }); continue; }
    var memo = [get(r, 'memo'), get(r, 'memo2')].filter(function (s) { return s; }).join(' / ');
    out.rows.push({
      rowNo: rowNo, hp_no: get(r, 'hp_no'), name: name, phone: get(r, 'phone'), gender: get(r, 'gender'), birth: get(r, 'birth'),
      job: get(r, 'job'), area: get(r, 'area'), email: get(r, 'email'), notice: get(r, 'notice'),
      round: parseApplicationRound(get(r, 'round')), roundText: get(r, 'round'), memo: memo,
      portrait: applicationConsent(get(r, 'portrait')), retain: applicationConsent(get(r, 'retain')),
      applied: parseApplicationDate(get(r, 'applied')), pass: get(r, 'pass'), attend: get(r, 'attend'), cancel: get(r, 'cancel')
    });
  }
  return out;
}

/** 취소된 참여 기록인지 (서버용. 화면에는 Logic.html 의 isCancelled 가 있다) */
function enrCancelled_(e) { return !!(e && e.cancel_reason); }

/** 동의 병합: 더 제한적인 쪽을 따른다. 저장값이 빈칸(미확인)이면 새 값, 새 값이 빈칸이면 저장값 */
function mergeConsent(stored, incoming) {
  stored = stored || ''; incoming = incoming || '';
  if (stored === '') return { value: incoming, conflict: false };
  if (incoming === '') return { value: stored, conflict: false };
  if (stored === incoming) return { value: stored, conflict: false };
  return { value: 'N', conflict: true };   // 한쪽이라도 미동의면 미동의
}

/**
 * 신청 엑셀을 규칙에 따라 판정한다. 저장하지 않는다.
 * parsed: parseApplicationSheet 결과 / existing: { sessions, people, enrollments }
 * opts: { program_id, today, now, actor, makeId, sessionMap({rowNo: session_id}), applyAttend }
 * 판정(decision): new 신규 · existing 이미 등록됨(빈 칸 보충) · rejected 불합격 제외 · cancelled_new 취소 상태로 등록 ·
 *                needs_session 회차 확인 필요 · duplicate_in_file 같은 파일 안 중복 · error 읽을 수 없음
 * 반환: { ok, errors(전체를 막는 오류), warnings, rows(행별 판정), newPeople, newEnrollments, fills, sessionNotes, summary }
 *  - 경고·오류·요약 어디에도 이름·연락처·주민번호가 들어가지 않는다 ("표의 N행"으로만 표시)
 */
function buildApplicationPlan(parsed, existing, opts) {
  var today = opts.today, now = opts.now, actor = opts.actor || '', idGen = opts.makeId || makeId;
  var plan = { ok: true, errors: [], warnings: (parsed.warnings || []).map(function (w) { return w.msg; }), rows: [], newPeople: [], newEnrollments: [], fills: [], sessionNotes: [], summary: {} };
  if (parsed.missing && parsed.missing.length) {
    plan.ok = false; plan.errors.push('엑셀에서 찾지 못한 열: ' + parsed.missing.join(', '));
    return plan;
  }
  if (parsed.rows.length > 500) { plan.ok = false; plan.errors.push('행이 너무 많아요 (최대 500행).'); return plan; }

  var sessions = existing.sessions.filter(function (s) { return s.program_id === opts.program_id; });
  var sessById = {}; sessions.forEach(function (s) { sessById[s.session_id] = s; });
  var personKey = function (name, phone) { return String(name).trim() + '|' + digitsOnly(phone); };
  var peopleByKey = {}; existing.people.forEach(function (p) { peopleByKey[personKey(p.name, p.phone)] = p; });
  var enrByKey = {}; existing.enrollments.forEach(function (e) { enrByKey[e.session_id + '|' + e.person_id] = e; });
  var newPeopleByKey = {}, seen = {}, notesDone = {};
  var sum = { total: parsed.rows.length, new: 0, existing: 0, rejected: 0, cancelled_new: 0, needs_session: 0, duplicate_in_file: 0, error: 0, fills: 0, consentChanged: 0, attendFilled: 0, rrnEligible: 0 };
  var addFill = function (table, id, field, from, to, rowNo) { plan.fills.push({ table: table, id: id, field: field, from: from, to: to, rowNo: rowNo }); sum.fills++; };

  parsed.rows.forEach(function (r) {
    var res = { rowNo: r.rowNo, decision: '', session_id: '', method: '', rrnEligible: false, gender: '', birth_year: '' };
    var at = '표의 ' + r.rowNo + '행';
    plan.rows.push(res);

    var nv = validateValue(PERSON_EDITABLE.name, r.name);
    var phone = legacyPhone(r.phone);
    if (!nv.ok) { res.decision = 'error'; res.reason = '이름 ' + nv.error; sum.error++; return; }
    if (!phone) { res.decision = 'error'; res.reason = '연락처를 읽을 수 없어요'; sum.error++; return; }
    if (r.pass !== '합격' && r.pass !== '불합격') { res.decision = 'error'; res.reason = '합격여부를 읽을 수 없어요'; sum.error++; return; }
    if (r.pass === '불합격') { res.decision = 'rejected'; sum.rejected++; return; }

    // 회차 찾기: 수동 지정 > 번호+날짜 > 번호만(날짜가 다르면 경고)
    var sid = '', method = '';
    var manual = opts.sessionMap && opts.sessionMap[r.rowNo];
    if (manual && sessById[manual]) { sid = manual; method = 'manual'; }
    else if (r.round && r.round.n != null) {
      var cand = sessions.filter(function (s) { return Number(s.n) === r.round.n; });
      if (r.round.startMD) {
        var exact = cand.filter(function (s) { return String(s.start).slice(5) === r.round.startMD && String(s.end).slice(5) === r.round.endMD; });
        if (exact.length === 1) { sid = exact[0].session_id; method = 'exact'; }
        else if (cand.length === 1 && Math.abs(diffDaysStr_(String(cand[0].start).slice(0, 4) + '-' + r.round.startMD, cand[0].start)) <= 14) {
          // 날짜가 조금 다르면(±14일) 번호가 같은 회차로 연결하고 알린다. 크게 다르면 엉뚱한 회차일 수 있어 연결하지 않는다
          sid = cand[0].session_id; method = 'number'; plan.warnings.push(r.round.n + '회차의 날짜가 달라요 (' + at + '). 번호가 같은 회차로 연결했어요');
        }
      } else if (cand.length === 1) { sid = cand[0].session_id; method = 'number'; }
    }
    if (!sid) { res.decision = 'needs_session'; sum.needs_session++; return; }
    res.session_id = sid; res.method = method;
    var sess = sessById[sid];

    // 번호 줄: 신청서의 성별·출생연도 (주민번호 대조에 쓴다)
    var gender = (r.gender === '남' || r.gender === '여') ? r.gender : '';
    if (!gender) plan.warnings.push('성별을 읽지 못해 비워 뒀어요 (' + at + ')');
    var by = parseInt(String(r.birth).replace(/\D/g, ''), 10);
    var birth = (by >= 1900 && by <= 2100) ? by : '';
    if (birth === '') plan.warnings.push('출생연도를 읽지 못해 비워 뒀어요 (' + at + ')');
    res.gender = gender; res.birth_year = birth;
    var ev = validateValue(PERSON_EDITABLE.email, r.email);
    var email = ev.ok ? ev.value : '';
    if (!ev.ok) plan.warnings.push('이메일 형식이 맞지 않아 비워 뒀어요 (' + at + ')');
    var pc = r.portrait, rc = r.retain;
    if (pc === null || rc === null) { plan.warnings.push('동의 칸 값을 읽을 수 없어 미확인으로 뒀어요 (' + at + ')'); if (pc === null) pc = ''; if (rc === null) rc = ''; }

    // 회차 메모(비고)에 테마 기록
    if (r.round && r.round.theme && !notesDone[sid]) {
      notesDone[sid] = true;
      var themeText = '테마: ' + r.round.theme;
      if (String(sess.note || '').indexOf(themeText) < 0) plan.sessionNotes.push({ session_id: sid, from: sess.note || '', to: (sess.note ? sess.note + ' · ' : '') + themeText });
    }

    var key = personKey(nv.value, phone);
    var person = peopleByKey[key] || newPeopleByKey[key];
    if (person && seen[sid + '|' + person.person_id]) { res.decision = 'duplicate_in_file'; sum.duplicate_in_file++; plan.warnings.push('같은 파일에 같은 사람이 같은 회차로 또 있어 건너뛰었어요 (' + at + ')'); return; }

    var started = diffDaysStr_(sess.start, today) <= 0;
    var attendIn = (opts.applyAttend && started && (r.attend === '참석' || r.attend === '불참')) ? r.attend : '';
    var existingEnr = person && enrByKey[sid + '|' + person.person_id];

    if (existingEnr) {
      // 이미 등록됨: 빈 칸만 채운다
      res.decision = 'existing'; sum.existing++;
      res.enroll_id = existingEnr.enroll_id; res.person_id = person.person_id;
      seen[sid + '|' + person.person_id] = true;
      if (peopleByKey[key]) {
        [['job', r.job], ['area', r.area], ['email', email], ['gender', gender], ['birth_year', birth]].forEach(function (f) {
          if (String(person[f[0]] == null ? '' : person[f[0]]) === '' && f[1] !== '' && f[1] != null) addFill('People', person.person_id, f[0], '', f[1], r.rowNo);
        });
        [['consent_retain', rc, '추가 보유'], ['consent_portrait', pc, '초상권']].forEach(function (f) {
          var m = mergeConsent(person[f[0]], f[1]);
          if (m.value !== (person[f[0]] || '')) { addFill('People', person.person_id, f[0], person[f[0]] || '', m.value, r.rowNo); if (person[f[0]]) sum.consentChanged++; }
          if (m.conflict) plan.warnings.push(f[2] + ' 동의 값이 달라 더 제한적인 값(미동의)을 적용했어요 (' + at + ')');
        });
      }
      [['applied_at', r.applied], ['hp_no', r.hp_no], ['notice_ack', r.notice === '예' ? 'Y' : ''], ['memo', r.memo]].forEach(function (f) {
        if (String(existingEnr[f[0]] == null ? '' : existingEnr[f[0]]) === '' && f[1] !== '' && f[1] != null) addFill('Enrollments', existingEnr.enroll_id, f[0], '', f[1], r.rowNo);
      });
      if (attendIn && !enrCancelled_(existingEnr) && (existingEnr.attend || '') === '') { addFill('Enrollments', existingEnr.enroll_id, 'attend', '', attendIn, r.rowNo); sum.attendFilled++; }
      if (r.cancel) plan.warnings.push('취소사유가 있지만 이미 등록된 기록은 바꾸지 않았어요. 앱에서 직접 취소해 주세요 (' + at + ')');
      return;
    }

    // 새 참여 기록
    if (!person) {
      person = { person_id: idGen('p_'), name: nv.value, phone: phone, email: email, gender: gender, birth_year: birth, job: r.job, area: r.area, consent_retain: rc, consent_portrait: pc, created_at: now, updated_at: now };
      newPeopleByKey[key] = person; plan.newPeople.push(person);
    } else {
      // 사람은 있고 이 회차 기록만 새로 만드는 경우: 사람의 빈 칸도 채운다
      [['job', r.job], ['area', r.area], ['email', email], ['gender', gender], ['birth_year', birth]].forEach(function (f) {
        if (String(person[f[0]] == null ? '' : person[f[0]]) === '' && f[1] !== '' && f[1] != null) addFill('People', person.person_id, f[0], '', f[1], r.rowNo);
      });
      [['consent_retain', rc, '추가 보유'], ['consent_portrait', pc, '초상권']].forEach(function (f) {
        var m = mergeConsent(person[f[0]], f[1]);
        if (m.value !== (person[f[0]] || '')) { addFill('People', person.person_id, f[0], person[f[0]] || '', m.value, r.rowNo); if (person[f[0]]) sum.consentChanged++; }
        if (m.conflict) plan.warnings.push(f[2] + ' 동의 값이 달라 더 제한적인 값(미동의)을 적용했어요 (' + at + ')');
      });
    }
    var cancelled = !!r.cancel;
    var enr = {
      enroll_id: idGen('e_'), session_id: sid, person_id: person.person_id, hp_no: r.hp_no, applied_at: r.applied, pass: '합격',
      notice_ack: r.notice === '예' ? 'Y' : '', memo: r.memo, transport: '', m1_at: '', pay_at: '', pay_amount: '', refund_amount: '', ins_at: '', m2_at: '',
      attend: (!cancelled && attendIn) ? attendIn : '', cancel_reason: cancelled ? String(r.cancel).slice(0, 200) : '', cancelled_at: cancelled ? today : '',
      updated_at: now, updated_by: actor
    };
    if (enr.attend) sum.attendFilled++;
    plan.newEnrollments.push(enr);
    seen[sid + '|' + person.person_id] = true;
    res.enroll_id = enr.enroll_id; res.person_id = person.person_id;
    res.decision = cancelled ? 'cancelled_new' : 'new';
    sum[res.decision]++;
    // R4: 합격 · 취소 아님 · 새 참여 기록 · 종료 전 회차만 주민번호 저장 대상
    if (!cancelled && String(sess.end) >= today) { res.rrnEligible = true; sum.rrnEligible++; }
  });
  plan.summary = sum;
  return plan;
}

/** 두 'yyyy-MM-dd' 날짜의 차이(일). Logic.html 의 diffDays 와 같은 계산 */
function diffDaysStr_(a, b) {
  var pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a)), pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b));
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(+pa[1], +pa[2] - 1, +pa[3]) - Date.UTC(+pb[1], +pb[2] - 1, +pb[3])) / 864e5);
}

/**
 * 등록할 때 같이 온 주민번호 목록을 규칙(R3, R3-2, R4)으로 걸러 저장할 목록을 만든다.
 * plan: buildApplicationPlan 결과 / rrns: [{ rowNo, rrn, confirmMismatch }]
 * 반환: { writes: [{ rowNo, enroll_id, rrn, session_end }], status: [{ rowNo, state, code }], counts }
 *  - state: saved 저장 · skipped_ineligible 저장 대상이 아님 · invalid 형식 오류 · mismatch 대조에 걸림(확인 선택 없음) · missing 번호가 없음
 *  - 반환 어디에도 번호 값이 들어가는 것은 writes[].rrn 뿐이다 (서버가 주민번호 파일에 쓰는 데만 쓴다)
 */
function planRrnWrites(plan, rrns, sessions) {
  var byRow = {}; (rrns || []).forEach(function (x) { byRow[x.rowNo] = x; });
  var sessById = {}; sessions.forEach(function (s) { sessById[s.session_id] = s; });
  var out = { writes: [], status: [], counts: { saved: 0, skipped_ineligible: 0, invalid: 0, mismatch: 0, missing: 0 } };
  plan.rows.forEach(function (r) {
    if (r.decision === 'error' || r.decision === 'rejected' || r.decision === 'needs_session' || r.decision === 'duplicate_in_file') return;
    var given = byRow[r.rowNo];
    var st = { rowNo: r.rowNo, state: '', code: '' };
    out.status.push(st);
    if (!r.rrnEligible) { st.state = 'skipped_ineligible'; out.counts.skipped_ineligible++; return; }
    if (!given || String(given.rrn == null ? '' : given.rrn).trim() === '') { st.state = 'missing'; st.code = 'EMPTY'; out.counts.missing++; return; }
    var m = rrnMatchesProfile(given.rrn, r.gender, r.birth_year);
    if (!m.ok && m.codes[0] !== 'BIRTH_MISMATCH' && m.codes[0] !== 'GENDER_MISMATCH') { st.state = 'invalid'; st.code = m.code; out.counts.invalid++; return; }
    if (!m.ok && !given.confirmMismatch) { st.state = 'mismatch'; st.code = m.code; out.counts.mismatch++; return; }
    var v = validateRrn(given.rrn);
    out.writes.push({ rowNo: r.rowNo, enroll_id: r.enroll_id, rrn: v.rrn, session_end: sessById[r.session_id] ? sessById[r.session_id].end : '' });
    st.state = 'saved'; out.counts.saved++;
  });
  return out;
}

/* ================= 2단계: 보험 명단 (F6), 자동 정리 ================= */

/**
 * 보험사 명단 행을 만든다. 합격 · 취소 아님 · 그 회차 · 주민번호 있음인 사람의 [이름, 주민번호].
 * rrnRows: [{ enroll_id, rrn }]. 번호가 없어 빠진 사람은 이름만 따로 돌려준다 (번호는 돌려주지 않는다).
 */
function buildInsuranceRows(enrollments, people, rrnRows, sessionId) {
  var rrnBy = {}; (rrnRows || []).forEach(function (r) { rrnBy[r.enroll_id] = r.rrn; });
  var pBy = {}; people.forEach(function (p) { pBy[p.person_id] = p; });
  var list = [], excluded = [];
  enrollments.forEach(function (e) {
    if (e.session_id !== sessionId || enrCancelled_(e) || e.pass === '불합격') return;
    var p = pBy[e.person_id]; if (!p) return;
    var rrn = rrnBy[e.enroll_id];
    if (rrn) list.push({ enroll_id: e.enroll_id, name: p.name, rrn: rrn });
    else excluded.push({ enroll_id: e.enroll_id, name: p.name });
  });
  return { list: list, excluded: excluded };
}

/** 'yyyy-MM-dd' 에 n개월을 더한다. 말일이 없는 달이면 그 달 말일로 맞춘다 (1/31 + 1개월 = 2/28 또는 2/29) */
function addMonths(dateStr, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return '';
  var y = +m[1], mo = +m[2] - 1 + n, d = +m[3];
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}

/** 회차 종료일 + months개월이 오늘보다 앞이면(지났으면) 정리 대상. rrnRows: [{ enroll_id, session_end }] */
function rrnPurgeCandidates(rrnRows, today, months) {
  return (rrnRows || []).filter(function (r) {
    var limit = addMonths(r.session_end, months);
    return limit !== '' && limit < today;
  }).map(function (r) { return r.enroll_id; });
}

/* ================= 2단계: 문구 저장, 프로그램 설정 ================= */

var TEMPLATE_RULES = {
  name: { type: 'text', max: 60, required: true },
  stage: { type: 'enum', values: STAGES },
  program_id: { type: 'enum', values: ['all'].concat(PROGRAM_IDS) },
  channel: { type: 'enum', values: ['sms', 'mail'] },
  body: { type: 'text', max: 2000, required: true }
};

/** 저장할 문구 검사. 본문에 주민번호 모양이 있으면 거부한다 */
function validateTemplate(t) {
  var errors = {}, clean = {};
  Object.keys(TEMPLATE_RULES).forEach(function (k) {
    var raw = t == null ? '' : t[k];
    if (containsRrn(raw)) { errors[k] = '주민번호로 보이는 값은 저장할 수 없어요'; return; }
    var r = validateValue(TEMPLATE_RULES[k], raw);
    if (r.ok) clean[k] = r.value; else errors[k] = r.error;
  });
  return { ok: Object.keys(errors).length === 0, clean: clean, errors: errors };
}

/** 만족도 폼 링크: 비워 두는 것(지우기)과 http(s) 주소만 허용 */
function validateProgramForm(url) {
  var u = String(url == null ? '' : url).trim();
  if (u === '') return { ok: true, value: '' };
  if (u.length > 300) return { ok: false, error: '주소가 너무 길어요 (최대 300자)' };
  if (/\s/.test(u)) return { ok: false, error: '주소에 공백이 있어요' };
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(u)) return { ok: false, error: 'http:// 또는 https:// 로 시작하는 주소를 입력해 주세요' };
  return { ok: true, value: u };
}
