/**
 * 구글 시트 읽기·쓰기 도우미. (구글 서비스를 쓰므로 Node 테스트 대상이 아님)
 * 파일 ID는 스크립트 속성(DB_ID, RRN_ID, ROOT_FOLDER_ID, BACKUP_FOLDER_ID)에 저장돼 있다.
 *
 * 쓰기 규칙
 *  - 모든 쓰기는 withLock_ 안에서 한다. (운영진이 동시에 수정해도 꼬이지 않게)
 *  - withLock_ 안에서 다시 withLock_을 부르지 않는다. (잠금은 중첩되지 않는다. *Unlocked_ 함수를 쓴다)
 *  - updated_at / updated_by 는 항상 서버가 채운다. 화면에서 온 값은 믿지 않는다.
 */

function getProps_() {
  return PropertiesService.getScriptProperties();
}

/** 접속한 사람의 이메일 (웹앱은 "접속한 사용자 권한으로 실행"이라 접속자 본인의 이메일이 나온다) */
function currentEmail_() {
  try {
    return normalizeEmail(Session.getActiveUser().getEmail());
  } catch (err) {
    return '';
  }
}

function nowStr_() {
  return formatKst(new Date());
}

function propOrThrow_(key) {
  var id = getProps_().getProperty(key);
  if (!id) throw new Error('NOT_SETUP');
  return id;
}

var DB_CACHE_ = null;
/** 한 번의 실행 안에서는 같은 스프레드시트를 다시 열지 않는다 */
function openDb_() {
  if (!DB_CACHE_) DB_CACHE_ = SpreadsheetApp.openById(propOrThrow_('DB_ID'));
  return DB_CACHE_;
}

function openRrn_() {
  return SpreadsheetApp.openById(propOrThrow_('RRN_ID'));
}

/** 쓰기 작업을 한 번에 한 명씩만 하도록 잠근다 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 탭 전체를 객체 배열로 읽는다 (구글이 날짜로 바꾼 값은 글자로 되돌림) */
function readTab_(tab) {
  var sh = openDb_().getSheetByName(tab);
  if (!sh) throw new Error('TAB_MISSING:' + tab);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cols = SCHEMA[tab].cols;
  return rowsToObjects(cols, sh.getRange(2, 1, last - 1, cols.length).getValues()).map(plainRow);
}

/** Config 탭을 {키: 값} 으로 */
function readConfig_() {
  var out = {};
  readTab_('Config').forEach(function (r) { out[r.key] = String(r.value); });
  return out;
}

/** 행 여러 개를 탭 맨 아래에 추가한다 (잠금은 호출한 쪽에서) */
function appendObjects_(ss, schema, tab, objs) {
  if (!objs.length) return;
  var sh = ss.getSheetByName(tab);
  var cols = schema[tab].cols;
  var values = objs.map(function (o) { return objectToRow(cols, o); });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, cols.length).setValues(values);
}

/** 행 하나를 탭 맨 아래에 추가한다 */
function appendRow_(ss, schema, tab, obj) {
  appendObjects_(ss, schema, tab, [obj]);
}

/** 감사 기록. 누가·언제·무엇을 했는지만 남기고 개인정보 값은 넣지 않는다. */
function audit_(action, target, detail) {
  appendRow_(openDb_(), SCHEMA, 'AuditLog', {
    at: nowStr_(), by: currentEmail_(), action: action, target: target || '', detail: detail || ''
  });
}

/** 키 열에서 값이 key인 행 번호(시트 기준, 2부터). 없으면 -1 */
function findKeyRow_(sh, def, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var keys = sh.getRange(2, def.cols.indexOf(def.key) + 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) return i + 2;
  }
  return -1;
}

/**
 * key 행 하나를 고친다. (잠금은 호출한 쪽에서)
 * buildPatch(현재 값) 이 고칠 열 {열: 값} 을 돌려주거나 오류를 던진다.
 * expectedUpdatedAt 이 있고 현재 updated_at 과 다르면 "다른 운영진이 먼저 수정" 오류.
 * 반환: { row: 고친 뒤 행, changed: 실제로 바뀐 열 이름들 }
 */
function updateRowUnlocked_(tab, key, buildPatch, expectedUpdatedAt, email) {
  var sh = openDb_().getSheetByName(tab);
  var def = SCHEMA[tab], cols = def.cols;
  var rowNo = findKeyRow_(sh, def, key);
  if (rowNo < 0) throw apiError('NOT_FOUND', '대상을 찾을 수 없어요. 새로 불러와 주세요.');

  var values = sh.getRange(rowNo, 1, 1, cols.length).getValues()[0];
  var current = plainRow(rowsToObjects(cols, [values])[0]);
  var hasUpdated = cols.indexOf('updated_at') >= 0;
  if (hasUpdated && hasConflict(current.updated_at, expectedUpdatedAt)) {
    throw apiError('CONFLICT', '다른 운영진이 먼저 수정했어요. 새로 불러옵니다.');
  }

  var patch = buildPatch(current);
  var changed = [];
  Object.keys(patch).forEach(function (k) {
    var idx = cols.indexOf(k);
    if (idx < 0) throw new Error('알 수 없는 열: ' + k);
    if (String(values[idx]) !== String(patch[k])) changed.push(k);
    values[idx] = patch[k];
  });
  if (changed.length) {
    if (hasUpdated) values[cols.indexOf('updated_at')] = nowStr_();
    if (cols.indexOf('updated_by') >= 0) values[cols.indexOf('updated_by')] = email || '';
    sh.getRange(rowNo, 1, 1, cols.length).setValues([values]);
  }
  return { row: plainRow(rowsToObjects(cols, [values])[0]), changed: changed };
}

function updateRowByKey_(tab, key, buildPatch, expectedUpdatedAt, email) {
  return withLock_(function () {
    return updateRowUnlocked_(tab, key, buildPatch, expectedUpdatedAt, email);
  });
}

/**
 * 조건에 맞는 여러 행을 한 번에 고친다. (잠금은 호출한 쪽에서)
 * shouldUpdate(행) 이 true인 행마다 buildPatch(행) 의 결과를 적용한다.
 * 반환: 실제로 바뀐 행들
 */
function bulkUpdateUnlocked_(tab, shouldUpdate, buildPatch, email) {
  var sh = openDb_().getSheetByName(tab);
  var cols = SCHEMA[tab].cols;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var range = sh.getRange(2, 1, last - 1, cols.length);
  var values = range.getValues();
  var now = nowStr_();
  var uAt = cols.indexOf('updated_at'), uBy = cols.indexOf('updated_by');
  var changedRows = [];

  values.forEach(function (row) {
    var obj = plainRow(rowsToObjects(cols, [row])[0] || {});
    if (!shouldUpdate(obj)) return;
    var patch = buildPatch(obj);
    var changed = false;
    Object.keys(patch).forEach(function (k) {
      var idx = cols.indexOf(k);
      if (idx < 0) throw new Error('알 수 없는 열: ' + k);
      if (String(row[idx]) !== String(patch[k])) { row[idx] = patch[k]; changed = true; }
    });
    if (changed) {
      if (uAt >= 0) row[uAt] = now;
      if (uBy >= 0) row[uBy] = email || '';
      changedRows.push(plainRow(rowsToObjects(cols, [row])[0]));
    }
  });
  if (changedRows.length) range.setValues(values);
  return changedRows;
}

/** 운영 DB를 백업 폴더에 복사한다 (이관 같은 큰 작업 전에 사용). 주민번호 파일은 복사하지 않는다. */
function backupDb_() {
  var folder = DriveApp.getFolderById(propOrThrow_('BACKUP_FOLDER_ID'));
  var stamp = nowStr_().replace(/[-:]/g, '').replace(' ', '_');
  var name = '곁마을 운영 DB 백업 ' + stamp;
  var copy = DriveApp.getFileById(propOrThrow_('DB_ID')).makeCopy(name, folder);
  return { id: copy.getId(), name: name };
}

/** 한 스프레드시트의 모든 탭이 정의와 맞는지 점검한다 */
function checkTabs_(ss, schema) {
  return Object.keys(schema).map(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh) return { name: tab, ok: false, rows: 0, problem: '탭이 없음' };
    var width = Math.max(sh.getLastColumn(), schema[tab].cols.length);
    var header = sh.getRange(1, 1, 1, width).getValues()[0];
    var v = validateHeader(schema[tab].cols, header);
    var problem = '';
    if (!v.ok) {
      problem = [
        v.missing.length ? '없는 열: ' + v.missing.join(', ') : '',
        v.extra.length ? '정의에 없는 열: ' + v.extra.join(', ') : '',
        !v.orderOk && !v.missing.length && !v.extra.length ? '열 순서가 다름' : ''
      ].filter(String).join(' / ');
    }
    return { name: tab, ok: v.ok, rows: Math.max(sh.getLastRow() - 1, 0), problem: problem };
  });
}
