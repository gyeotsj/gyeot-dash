/**
 * 웹앱 진입점. 접속 → 이메일 확인 → 운영진 확인 → 화면.
 *
 * 접근 통제는 두 겹이다.
 *  1차: 운영 DB 파일을 공유받은 사람만 읽을 수 있다. (웹앱이 "접속한 사용자 권한으로 실행"되기 때문)
 *  2차: Staff 탭에 활성(active=Y)으로 등록된 이메일만 통과한다.
 * 1차에서 막히면(운영 DB를 공유받지 않은 계정) 데이터는 전혀 열리지 않고, 구글의 기본 오류 문구
 * "요청한 문서를 액세스할 권한이 없습니다."가 나온다. 이 오류는 코드에서 잡을 수 없다. (시험으로 확인함)
 * 2차에서 막히면 "등록된 운영진이 아닙니다" 안내 화면이 나온다.
 */

var APP_VERSION = '0.4.0 (2단계 완료)';

/**
 * 진입점. 코드 안에서 생기는 오류는 날것의 오류 화면 대신 안내 화면을 보여 주고,
 * 원인은 실행 기록(Apps Script 편집기 → 실행)에 남긴다.
 */
function doGet() {
  try {
    return route_();
  } catch (err) {
    console.error('doGet 실패: ' + (err && err.stack ? err.stack : err));
    var msg = escapeHtml(String(err && err.message ? err.message : err).slice(0, 160));
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html lang="ko"><head><base target="_top"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
      '<body style="font-family:sans-serif;max-width:460px;margin:15vh auto;padding:0 20px;text-align:center;color:#18211e">' +
      '<h2>접속 중 오류가 발생했습니다</h2><p>잠시 뒤 다시 시도하고, 계속되면 소유자에게 알려 주세요.</p>' +
      '<p style="color:#7a8782;font-size:12px;word-break:break-all">오류: ' + msg + '</p></body></html>'
    ).setTitle('곁마을 운영 대시보드');
  }
}

function route_() {
  var email = currentEmail_();
  if (!email) return page_('denied', { reason: 'login' });

  var staffRow;
  try {
    staffRow = findActiveStaff(readTab_('Staff'), email);
  } catch (err) {
    var notSetup = String(err && err.message).indexOf('NOT_SETUP') >= 0;
    return page_('denied', { reason: notSetup ? 'notsetup' : 'noaccess', email: email });
  }
  if (!staffRow) return page_('denied', { reason: 'notstaff', email: email });

  // 화면은 열린 뒤 getBootstrap()으로 데이터를 불러온다. 여기서는 데이터를 넣지 않는다.
  return page_('app', { version: APP_VERSION });
}

/** 시스템 상태 점검 (소유자 전용, 개인정보 없음): 탭 열 이름이 정의와 맞는지, 주민번호 파일에 접근되는지 */
function getSystemStatus() {
  var who = requireOwner_();
  return statusFor_(who.email, who.row);
}

function statusFor_(email, staffRow) {
  var db = { ok: false, tabs: [], error: '' };
  try {
    db.tabs = checkTabs_(openDb_(), SCHEMA);
    db.ok = db.tabs.every(function (t) { return t.ok; });
  } catch (err) {
    db.error = '운영 DB를 열 수 없어요';
  }

  var rrn = { ok: false, error: '' };
  try {
    var rt = checkTabs_(openRrn_(), RRN_SCHEMA);
    rrn.ok = rt.every(function (t) { return t.ok; });
  } catch (err) {
    rrn.error = email === normalizeEmail(OWNER_EMAIL) ? '주민번호 파일을 열 수 없어요' : '이 계정은 주민번호 파일에 접근할 수 없어요';
  }

  var extras = {};
  if (db.ok || db.tabs.length) { try { extras = statusExtras_(); } catch (err) { extras = {}; } }
  return {
    email: email,
    name: staffRow.name,
    role: staffRow.role,
    roleLabel: staffRow.role === 'owner' ? '소유자' : '운영진',
    version: APP_VERSION,
    now: nowStr_(),
    db: db,
    rrn: rrn,
    sweep: extras.sweep || null,
    rrnHeld: extras.rrnHeld || null,
    privacy: extras.privacy || null,
    schema: extras.schema || null
  };
}

function page_(kind, data) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.kind = kind;
  t.d = data || {};
  return t.evaluate()
    .setTitle('곁마을 운영 대시보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML 파일 안에서 다른 HTML 파일(CSS 등)을 끼워 넣는다 */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
