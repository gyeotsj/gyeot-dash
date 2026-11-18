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
