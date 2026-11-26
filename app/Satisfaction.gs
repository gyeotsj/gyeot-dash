/**
 * 만족도 응답 확인 (F9). 운영진 누구나.
 *
 * 프로그램의 구글폼 응답 시트를 **읽기만** 해서 응답자가 적은 이름 + 기수로 참여 기록을 찾아 "응답함"(sat_at)을 채우도록 제안한다.
 * 규칙 (DEV_PLAN_STAGE3.md S1·S2)
 *  - 읽는 열은 이름·기수(회차)·응답 시각 세 개뿐이다. 점수·서술·사진·이메일이 있는 열은 읽지 않는다.
 *  - 저장되는 것은 SatMatches 의 응답 식별자(응답 시각 + 이름의 해시)·연결 결과·연결한 사람과 Enrollments.sat_at 뿐이다. 이름·기수 원문은 저장하지 않는다.
 *  - 응답 시트는 고치지 않는다.
 */

var SAT_MAX_ROWS_ = 2000;

function satProgram_(programId) {
  var p = readTab_('Programs').filter(function (x) { return x.program_id === String(programId); })[0];
  if (!p) throw apiError('NOT_FOUND', '프로그램을 찾을 수 없어요.');
  return p;
}

/** 응답 시트에서 이름·기수·응답 시각 열만 읽어 [{ respKey, rowNo, name, roundText, at }] 로 돌려준다 */
function readSatResponses_(program) {
  var id = String(program.form_sheet_id || '').trim();
  if (!id) throw apiError('INVALID', '먼저 프로그램 설정(회차 관리 맨 위)에서 만족도 응답 시트를 연결해 주세요.');
  var ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { throw apiError('INVALID', '이 계정은 응답 시트를 읽을 수 없어요. 소유자에게 응답 시트 공유를 요청해 주세요.'); }
  var sh = program.form_tab ? ss.getSheetByName(String(program.form_tab)) : ss.getSheets()[0];
  if (!sh) throw apiError('INVALID', '응답 시트에서 "' + program.form_tab + '" 탭을 찾지 못했어요.');
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return [];
  var cols = satColumns(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  if (!cols.ok) throw apiError('INVALID', '응답 시트에서 못 찾은 열: ' + cols.missing.join(', ') + ' (머리글에 "이름", "기수" 또는 "회차"가 들어 있어야 해요)');
  var n = last - 1;
  if (n > SAT_MAX_ROWS_) throw apiError('INVALID', '응답이 너무 많아요 (최대 ' + SAT_MAX_ROWS_ + '건).');
  var names = sh.getRange(2, cols.name + 1, n, 1).getValues();
  var rounds = sh.getRange(2, cols.round + 1, n, 1).getValues();
  var ats = cols.at >= 0 ? sh.getRange(2, cols.at + 1, n, 1).getValues() : null;
  var out = [];
  for (var i = 0; i < n; i++) {
    var name = String(names[i][0] == null ? '' : names[i][0]).trim(), rt = String(rounds[i][0] == null ? '' : rounds[i][0]).trim();
    if (!name && !rt) continue;                                         // 빈 행
    var raw = ats ? ats[i][0] : '', at = raw instanceof Date ? formatKst(raw) : String(raw == null ? '' : raw).trim();
    out.push({ respKey: (at || ('행' + (i + 2))) + '|' + hashText_(normName_(name)), rowNo: i + 2, name: name, roundText: rt, at: at });
  }
  return out;
}

function satSyncedMap_(programId) {
  var map = {};
  readTab_('SatMatches').forEach(function (r) { if (r.program_id === programId) map[r.resp_key] = r; });
  return map;
}

function satPlan_(programId) {
  var program = satProgram_(programId);
  var responses = readSatResponses_(program);
  var linked = satSyncedMap_(programId), synced = {};
  Object.keys(linked).forEach(function (k) { synced[k] = true; });
  var existing = { sessions: readTab_('Sessions'), people: readTab_('People'), enrollments: readTab_('Enrollments') };
  var plan = matchResponses(responses, existing, { program_id: programId, synced: synced });
  var by = {}; responses.forEach(function (r) { by[r.respKey] = r; });
  plan.rows.forEach(function (row) {
    var r = by[row.respKey]; row.name = r.name; row.roundText = r.roundText; row.at = r.at;
    if (row.decision === 'synced') { var l = linked[row.respKey]; row.enroll_id = l.enroll_id || ''; row.status = l.status; }
  });
  return { plan: plan, existing: existing, responses: responses };
}

/**
 * 응답을 읽어 판정만 한다 (저장 안 함). 응답 내용은 읽지 않는다.
 * 행: 응답 이름·기수 원문(확인하는 데 필요), 판정, 회차, 연결할 참여 기록과 후보
 */
function previewSatisfaction(programId) {
  requireStaff_();
  var r = satPlan_(String(programId));
  return { program_id: String(programId), summary: r.plan.summary, rows: r.plan.rows.slice(0, 400), shown: Math.min(r.plan.rows.length, 400), total: r.plan.rows.length };
}

/**
 * 확인한 연결을 기록한다. items: [{ respKey, enroll_id, ignore }]. 서버가 응답을 다시 읽어 판정한 뒤, 판정과 맞는 것만 기록한다.
 *  - 자동(auto) 판정은 같은 참여 기록일 때만, 사람이 고른 연결은 후보 안(또는 그 프로그램의 취소 아닌 참여 기록)일 때만 인정한다.
 *  - 이미 만족도 응답일이 있는 칸은 덮어쓰지 않는다. 취소된 참여 기록에는 쓰지 않는다.
 * 반환: { linked, ignored, skipped }
 */
function applySatisfaction(programId, items) {
  var who = requireStaff_();
  programId = String(programId);
  if (!Array.isArray(items) || !items.length) throw apiError('INVALID', '적용할 응답이 없어요.');
  if (items.length > 400) throw apiError('INVALID', '한 번에 400건까지만 적용할 수 있어요.');
  assertSatColumn_();

  var out = withLock_(function () {
    var r = satPlan_(programId), rowBy = {};
    r.plan.rows.forEach(function (x) { rowBy[x.respKey] = x; });
    var sessIds = {}; r.existing.sessions.forEach(function (s) { if (s.program_id === programId) sessIds[s.session_id] = true; });
    var enrBy = {}; r.existing.enrollments.forEach(function (e) { enrBy[e.enroll_id] = e; });
    var atBy = {}; r.responses.forEach(function (x) { atBy[x.respKey] = x.at; });
    var today = todayKst(), now = nowStr_(), adds = [], patches = {}, claimed = {}, cnt = { linked: 0, ignored: 0, skipped: 0 };
    items.forEach(function (it) {
      var row = rowBy[String(it && it.respKey)];
      if (!row || row.decision === 'synced' || row.decision === 'no_name') { cnt.skipped++; return; }
      if (it.ignore === true) { adds.push({ resp_key: row.respKey, program_id: programId, enroll_id: '', status: 'ignored', raw_name: '', raw_session: '', matched_by: who.email, matched_at: now }); cnt.ignored++; return; }
      var eid = String(it.enroll_id || ''), e = enrBy[eid];
      if (!e || !sessIds[e.session_id] || enrCancelled_(e) || e.pass === '불합격' || claimed[eid]) { cnt.skipped++; return; }
      var status;
      if (row.decision === 'auto') status = (eid === row.enroll_id) ? 'auto' : 'manual';
      else if (row.decision === 'homonym' || row.decision === 'similar' || row.decision === 'none' || row.decision === 'no_round') status = 'manual';
      else { cnt.skipped++; return; }                                    // already / duplicate: 더 쓰지 않는다
      var date = String(atBy[row.respKey] || '').slice(0, 10);
      if (!isValidDate(date)) date = today;
      claimed[eid] = true;
      adds.push({ resp_key: row.respKey, program_id: programId, enroll_id: eid, status: status, raw_name: '', raw_session: '', matched_by: who.email, matched_at: now });
      if (!e.sat_at) patches[eid] = { sat_at: date };
      cnt.linked++;
    });
    if (!adds.length) return cnt;
    appendObjects_(openDb_(), SCHEMA, 'SatMatches', adds);
    bulkPatchByIdUnlocked_('Enrollments', patches, who.email);
    return cnt;
  });
  audit_('sat_sync', programId, '연결 ' + out.linked + ' · 무시 ' + out.ignored + ' · 건너뜀 ' + out.skipped);
  return out;
}

/** 연결을 푼다: SatMatches 기록을 지우고, 다른 연결이 없으면 그 참여 기록의 만족도 응답일도 비운다 */
function unlinkResponse(respKey) {
  var who = requireStaff_();
  var res = withLock_(function () {
    var all = readTab_('SatMatches'), row = all.filter(function (r) { return r.resp_key === String(respKey); })[0];
    if (!row) throw apiError('NOT_FOUND', '연결 기록을 찾을 수 없어요.');
    deleteRowsByKeysUnlocked_('SatMatches', [row.resp_key]);
    var cleared = false;
    if (row.enroll_id && row.status !== 'ignored') {
      var other = all.some(function (r) { return r.resp_key !== row.resp_key && r.enroll_id === row.enroll_id; });
      if (!other) { var p = {}; p[row.enroll_id] = { sat_at: '' }; bulkPatchByIdUnlocked_('Enrollments', p, who.email); cleared = true; }
    }
    return { cleared: cleared };
  });
  audit_('sat_unlink', '', res.cleared ? '만족도 응답일을 비움' : '연결만 풀음');
  return res;
}
