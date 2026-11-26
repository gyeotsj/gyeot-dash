/**
 * 개인정보 파기 관리 (F13).
 *
 * 규칙 (DEV_PLAN_STAGE3.md S3)
 *  - 미리보기(previewPurge)는 운영진 누구나, 삭제(purgeExpired)는 **소유자만** 한다. 삭제는 되돌릴 수 없다.
 *  - 삭제 순서: 운영 DB 백업 → 익명 통계(Stats)를 먼저 남김 → 주민번호 파일 → 만족도 연결 → 참여 기록 → 사람.
 *  - 중간에 실패해도 다시 실행할 수 있게 Config(purge_state)에 진행 상태를 남긴다 (통계를 두 번 더하지 않는다).
 *  - 감사 기록에는 인원 수만 남긴다. 구글폼 응답 시트의 이름은 자동으로 지우지 않는다 (화면에서 직접 지우도록 안내).
 */

var PURGE_CONFIRM_ = '삭제';

function purgePlan_() {
  var cfg = readConfig_();
  var years = parseInt(cfg.retention_years, 10) || 3;
  var people = readTab_('People'), enrollments = readTab_('Enrollments'), sessions = readTab_('Sessions');
  return { cfg: cfg, people: people, enrollments: enrollments, sessions: sessions, cand: purgeCandidates(people, enrollments, sessions, todayKst(), years), years: years };
}

/**
 * 삭제 대상과 검토 대상을 보여 준다 (저장·삭제 없음). 이름은 운영진이 확인하는 데 필요해서 목록에 포함한다.
 * 반환: { today, years, expired:[{ person_id, name, reason, basis, due, enrollments }], review:[…], noBasis:n, summary, pending }
 */
function previewPurge() {
  requireStaff_();
  var p = purgePlan_(), pBy = {}, cnt = {};
  p.people.forEach(function (x) { pBy[x.person_id] = x; });
  p.enrollments.forEach(function (e) { cnt[e.person_id] = (cnt[e.person_id] || 0) + 1; });
  var dress = function (c) { return { person_id: c.person_id, name: (pBy[c.person_id] || {}).name || '', reason: c.reason || '', basis: c.basis, due: c.due, enrollments: cnt[c.person_id] || 0 }; };
  return {
    today: todayKst(), years: p.years, summary: p.cand.summary, noBasis: p.cand.noBasis.length,
    expired: p.cand.expired.map(dress), review: p.cand.review.map(dress),
    pending: !!p.cfg.purge_state
  };
}

function purgeDeleteWhere_(tab, colName, idSet) {
  var sh = openDb_().getSheetByName(tab), cols = SCHEMA[tab].cols, last = sh.getLastRow();
  if (last < 2) return 0;
  var idx = cols.indexOf(colName) + 1;
  var vals = sh.getRange(2, idx, last - 1, 1).getValues(), rows = [];
  for (var i = 0; i < vals.length; i++) if (idSet[String(vals[i][0])]) rows.push(i + 2);
  for (var j = rows.length - 1; j >= 0; j--) sh.deleteRow(rows[j]);
  return rows.length;
}

/** 익명 통계를 Stats 탭에 더한다 (같은 회차 줄이 있으면 합치고, 없으면 새 줄) */
function purgeWriteStats_(rows) {
  if (!rows.length) return;
  var db = openDb_(), sh = db.getSheetByName('Stats'), cols = SCHEMA.Stats.cols;
  var cur = readTab_('Stats');
  var idx = {}; cur.forEach(function (r, i) { idx[r.session_id] = i; });
  rows.forEach(function (r) {
    if (idx[r.session_id] !== undefined) cur[idx[r.session_id]] = mergeStatsRow(cur[idx[r.session_id]], r);
    else { idx[r.session_id] = cur.length; cur.push(r); }
  });
  var values = cur.map(function (r) { return objectToRow(cols, r); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  sh.getRange(2, 1, values.length, cols.length).setValues(values);
}

/**
 * 삭제 대상 전원을 삭제한다. confirmText 가 "삭제" 여야 한다. 소유자만.
 * 반환: { people, enrollments, rrn, satMatches, statsRows, backup, resumed }
 */
function purgeExpired(confirmText) {
  requireOwner_();
  if (String(confirmText) !== PURGE_CONFIRM_) throw apiError('INVALID', '확인 문구로 "' + PURGE_CONFIRM_ + '"을 입력해 주세요.');
  var out = withLock_(function () {
    var p = purgePlan_(), state = null, resumed = false;
    if (p.cfg.purge_state) { try { state = JSON.parse(p.cfg.purge_state); resumed = true; } catch (e) { state = null; } }
    var stillThere = {}; p.people.forEach(function (x) { stillThere[x.person_id] = true; });
    var ids = state ? state.ids.filter(function (id) { return stillThere[id]; }) : p.cand.expired.map(function (c) { return c.person_id; });
    if (!ids.length) { if (state) setConfigUnlocked_('purge_state', ''); throw apiError('INVALID', '삭제할 대상이 없어요.'); }
    var idSet = {}; ids.forEach(function (id) { idSet[id] = true; });
    var enrIds = p.enrollments.filter(function (e) { return idSet[e.person_id]; }).map(function (e) { return e.enroll_id; });
    var enrSet = {}; enrIds.forEach(function (id) { enrSet[id] = true; });

    var backup = backupDb_();                                  // 삭제 직전 상태를 백업 폴더에 복사해 둔다
    var statsRows = [];
    if (!state || !state.statsDone) {
      setConfigUnlocked_('purge_state', JSON.stringify({ ids: ids, statsDone: false }));
      statsRows = buildPurgeStats(ids, p.people, p.enrollments, p.sessions);
      purgeWriteStats_(statsRows);                             // 익명 통계를 먼저 남긴다
      setConfigUnlocked_('purge_state', JSON.stringify({ ids: ids, statsDone: true }));
    }
    var rrn = 0, warn = '';
    try { rrn = rrnDeleteUnlocked_(enrIds); } catch (e) { warn = '주민번호 파일의 행을 지우지 못했어요. 자동 정리가 나중에 지워요.'; }
    var sat = purgeDeleteWhere_('SatMatches', 'enroll_id', enrSet);
    var enr = purgeDeleteWhere_('Enrollments', 'enroll_id', enrSet);
    var ppl = purgeDeleteWhere_('People', 'person_id', idSet);
    setConfigUnlocked_('purge_state', '');
    return { people: ppl, enrollments: enr, rrn: rrn, satMatches: sat, statsRows: statsRows.length, backup: backup, resumed: resumed, warn: warn };
  });
  audit_('purge', '', '사람 ' + out.people + ' · 참여 기록 ' + out.enrollments + ' · 익명 통계 ' + out.statsRows + '줄' + (out.resumed ? ' (이어서 실행)' : ''));
  return out;
}
