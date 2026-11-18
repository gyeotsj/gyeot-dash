/**
 * 구글 시트 읽기·쓰기 도우미. (구글 서비스를 쓰므로 Node 테스트 대상이 아님)
 * 파일 ID는 스크립트 속성(DB_ID, RRN_ID, ROOT_FOLDER_ID, BACKUP_FOLDER_ID)에 저장돼 있다.
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

function openDb_() {
  return SpreadsheetApp.openById(propOrThrow_('DB_ID'));
}

function openRrn_() {
  return SpreadsheetApp.openById(propOrThrow_('RRN_ID'));
}

/** 쓰기 작업을 한 번에 한 명씩만 하도록 잠근다 (운영진이 동시에 수정해도 꼬이지 않게) */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 탭 전체를 객체 배열로 읽는다 */
function readTab_(tab) {
  var sh = openDb_().getSheetByName(tab);
  if (!sh) throw new Error('TAB_MISSING:' + tab);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cols = SCHEMA[tab].cols;
  return rowsToObjects(cols, sh.getRange(2, 1, last - 1, cols.length).getValues());
}

/** 행 하나를 탭 맨 아래에 추가한다 */
function appendRow_(ss, schema, tab, obj) {
  var sh = ss.getSheetByName(tab);
  var cols = schema[tab].cols;
  sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([objectToRow(cols, obj)]);
}

/** 감사 기록. 누가·언제·무엇을 했는지만 남기고 개인정보 값은 넣지 않는다. */
function audit_(action, target, detail) {
  appendRow_(openDb_(), SCHEMA, 'AuditLog', {
    at: nowStr_(), by: currentEmail_(), action: action, target: target || '', detail: detail || ''
  });
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
