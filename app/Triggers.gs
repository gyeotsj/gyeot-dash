/**
 * 자동 정리 (J). 소유자가 Apps Script 화면에서 "매일" 시간 트리거로 직접 설정한다.
 * (코드로 트리거를 만들려면 앱에 새 권한이 필요해서 운영진 모두에게 권한 승인을 다시 받게 되므로 쓰지 않는다.)
 *
 * sweepRrn 은 트리거가 부르는 함수라 이름 끝에 _ 를 붙일 수 없어 화면에서도 부를 수 있는 모양이다.
 * 그래서 맨 앞에서 "실행 계정이 소유자인지" 확인한다: 소유자의 시간 트리거에서는 소유자, 웹앱에서는 접속한 사람 본인이므로
 * 소유자가 아닌 운영진이 화면에서 부르면 거부된다. (app/tests/run.js 가 이 확인이 맨 앞에 있는지 검사한다)
 */
function sweepRrn() {
  if (effectiveEmail_() !== normalizeEmail(OWNER_EMAIL)) throw apiError('OWNER_ONLY', '자동 정리는 소유자의 트리거로만 실행돼요.');
  try {
    var res = withLock_(function () {
      var cfg = readConfig_();
      var months = parseInt(cfg.rrn_sweep_months, 10) || 3;
      var meta = rrnReadMeta_();
      var expired = rrnPurgeCandidates(meta, todayKst(), months);
      var orphan = rrnOrphanIds(meta, readTab_('Enrollments'));
      var seen = {}, ids = [];
      expired.concat(orphan).forEach(function (id) { if (!seen[id]) { seen[id] = true; ids.push(id); } });
      var deleted = rrnDeleteUnlocked_(ids);
      setConfigUnlocked_('rrn_sweep_last', nowStr_());
      setConfigUnlocked_('rrn_sweep_count', String(deleted));
      return { deleted: deleted, expired: expired.length, orphan: orphan.length };
    });
    audit_('rrn_sweep', '', '지움 ' + res.deleted + '건 (기간 경과 ' + res.expired + ' · 정리 누락 ' + res.orphan + ')');
    return res;
  } catch (err) {
    try { audit_('rrn_sweep_failed', '', ''); } catch (e2) { /* 기록도 못 남기면 트리거 실패 알림으로 */ }
    throw err;
  }
}

/** 스키마 확장이 필요한 탭과 덧붙일 열 (읽기만 한다) */
function schemaMigrationNeeds_() {
  var db = openDb_(), out = [];
  Object.keys(SCHEMA).forEach(function (tab) {
    var def = SCHEMA[tab], sh = db.getSheetByName(tab);
    if (!sh) return;
    var header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), def.cols.length)).getValues()[0];
    var p = planSchemaMigration(def.cols, header);
    if (p.ok && p.add.length) out.push({ tab: tab, cols: p.add });
  });
  return out;
}

/**
 * 소유자용 시스템 상태 확장 항목: 자동 정리 상태, 보관 중인 주민번호 개수와 가장 오래된 보관일, 마지막 개인정보 점검, 스키마 확장 필요 여부.
 * 값은 개수와 날짜뿐이고 개인정보는 없다. statusFor_(Code.gs)가 합쳐서 돌려준다.
 */
function statusExtras_() {
  var cfg = readConfig_(), out = {};
  var sw = sweepStatus(cfg.rrn_sweep_last || '', nowStr_());
  out.sweep = { last: cfg.rrn_sweep_last || '', lastCount: cfg.rrn_sweep_count === undefined ? null : Number(cfg.rrn_sweep_count), stale: sw.stale, message: sw.message };
  try {
    var meta = rrnReadMeta_();
    var oldest = meta.map(function (r) { return String(r.saved_at).slice(0, 10); }).filter(String).sort()[0] || '';
    out.rrnHeld = { count: meta.length, oldestSavedAt: oldest };
  } catch (err) {
    out.rrnHeld = { count: null, oldestSavedAt: '', error: '주민번호 파일을 열 수 없어요' };
  }
  var scan = String(cfg.privacy_scan_last || '').split('|');
  out.privacy = { last: scan[0] || '', total: scan[1] === undefined || scan[1] === '' ? null : Number(scan[1]) };
  try { out.schema = { needs: schemaMigrationNeeds_() }; } catch (err) { out.schema = { needs: [], error: '확인하지 못했어요' }; }
  return out;
}
