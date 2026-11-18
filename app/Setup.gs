/**
 * 최초 설정. 소유자만 실행할 수 있고, 여러 번 실행해도 안전하다.
 *
 * 실행 방법: Apps Script 편집기에서 함수 목록의 setup을 선택하고 "실행".
 * 만드는 것: 드라이브의 `곁마을 운영` 폴더(+ `백업` 폴더), 운영 DB 스프레드시트, 주민번호 스프레드시트,
 *           각 탭과 열 이름, 초기 데이터(프로그램 3개, 설정값, 운영진(소유자), 기본 문구 4개)
 *
 * 안전 규칙: 이미 있는 폴더·파일·탭·데이터는 지우거나 덮어쓰지 않는다. 어긋난 부분이 있으면 알려 주기만 한다.
 */
function setup() {
  var email = currentEmail_();
  if (email !== normalizeEmail(OWNER_EMAIL)) {
    throw new Error('setup()은 소유자(' + OWNER_EMAIL + ')만 실행할 수 있어요. 현재 계정: ' + (email || '알 수 없음'));
  }
  var report = withLock_(function () { return runSetup_({ lines: [], warnings: [] }); });
  Logger.log(report.lines.join('\n'));
  return report;
}

function runSetup_(report) {
  var say = function (s) { report.lines.push(s); };

  // 1) 폴더
  var root = ensureFolder_(DriveApp.getRootFolder(), '곁마을 운영', 'ROOT_FOLDER_ID', say);
  var backup = ensureFolder_(root, '백업', 'BACKUP_FOLDER_ID', say);

  // 2) 스프레드시트 2개 (운영 DB, 주민번호)
  var db = ensureSpreadsheet_('곁마을 운영 DB', root, 'DB_ID', say);
  var rrn = ensureSpreadsheet_('곁마을 주민번호 (민감 · 공유 주의)', root, 'RRN_ID', say);

  // 3) 탭과 열 이름
  ensureTabs_(db, SCHEMA, report);
  ensureTabs_(rrn, RRN_SCHEMA, report);

  // 4) 초기 데이터
  seed_(db, report, backup, rrn);

  // 5) 감사 기록 (개인정보 없음)
  appendRow_(db, SCHEMA, 'AuditLog', { at: nowStr_(), by: currentEmail_(), action: 'setup', target: 'DB/RRN', detail: report.lines.length + '개 항목 처리' });

  say('');
  say('운영 DB: ' + db.getUrl());
  say('주민번호 파일: ' + rrn.getUrl());
  say('폴더: ' + root.getUrl());
  if (report.warnings.length) {
    say('');
    say('확인이 필요한 항목 ' + report.warnings.length + '개:');
    report.warnings.forEach(function (w) { say('  - ' + w); });
  }
  return report;
}

function ensureFolder_(parent, name, propKey, say) {
  var props = getProps_();
  var id = props.getProperty(propKey);
  if (id) {
    var f = DriveApp.getFolderById(id);
    if (f.isTrashed()) throw new Error('"' + name + '" 폴더가 휴지통에 있어요. 휴지통에서 복원한 뒤 다시 실행하세요.');
    say('재사용: 폴더 ' + name);
    return f;
  }
  var created = parent.createFolder(name);
  props.setProperty(propKey, created.getId());
  say('생성: 폴더 ' + name);
  return created;
}

function ensureSpreadsheet_(name, folder, propKey, say) {
  var props = getProps_();
  var id = props.getProperty(propKey);
  if (id) {
    var file = DriveApp.getFileById(id);
    if (file.isTrashed()) throw new Error('"' + name + '" 파일이 휴지통에 있어요. 휴지통에서 복원한 뒤 다시 실행하세요.');
    say('재사용: 스프레드시트 ' + name);
    return SpreadsheetApp.openById(id);
  }
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  props.setProperty(propKey, ss.getId());
  say('생성: 스프레드시트 ' + name);
  return ss;
}

/** schema의 탭을 만들고 첫 행에 열 이름을 넣는다. 이미 데이터가 있는 탭은 건드리지 않는다. */
function ensureTabs_(ss, schema, report) {
  Object.keys(schema).forEach(function (tab) {
    var def = schema[tab];
    var sh = ss.getSheetByName(tab);
    var created = false;
    if (!sh) { sh = ss.insertSheet(tab); created = true; }

    var width = Math.max(sh.getLastColumn(), def.cols.length);
    var header = sh.getRange(1, 1, 1, width).getValues()[0];
    var headerEmpty = header.every(function (c) { return c === '' || c == null; });

    if (headerEmpty) {
      // 새 탭(또는 빈 탭): 열 이름, 서식, 고정 행을 만든다
      (def.text || []).forEach(function (c) {
        sh.getRange(1, def.cols.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
      sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold').setBackground('#e1f1ee');
      sh.setFrozenRows(1);
      report.lines.push((created ? '생성' : '초기화') + ': 탭 ' + tabLabel_(ss, tab));
    } else {
      var v = validateHeader(def.cols, header);
      if (v.ok) {
        report.lines.push('재사용: 탭 ' + tabLabel_(ss, tab));
      } else {
        report.warnings.push(tabLabel_(ss, tab) + ' 탭의 열이 정의와 다름 (' +
          (v.missing.length ? '없는 열: ' + v.missing.join(', ') + ' ' : '') +
          (v.extra.length ? '정의에 없는 열: ' + v.extra.join(', ') + ' ' : '') +
          (!v.missing.length && !v.extra.length ? '열 순서가 다름' : '') + '). 데이터는 건드리지 않았어요.');
      }
    }
  });

  // 스프레드시트를 새로 만들면 딸려 오는 빈 기본 시트를 정리한다
  ['Sheet1', '시트1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && !schema[n] && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
}

function tabLabel_(ss, tab) {
  return (ss.getName().indexOf('주민번호') >= 0 ? '주민번호 파일' : '운영 DB') + '/' + tab;
}

/** 초기 데이터. 이미 값이 있으면 덮어쓰지 않고, 비어 있는 것만 채운다. */
function seed_(db, report, backupFolder, rrnSs) {
  var say = function (s) { report.lines.push(s); };
  var now = nowStr_();

  // Programs: 빠진 프로그램만 추가
  var progSh = db.getSheetByName('Programs');
  var have = existingKeys_(progSh, SCHEMA.Programs);
  var addedProg = SEED_PROGRAMS.filter(function (p) { return !have[p.program_id]; });
  addRows_(db, 'Programs', addedProg);
  say(addedProg.length ? '추가: 프로그램 ' + addedProg.length + '개' : '유지: 프로그램 ' + Object.keys(have).length + '개');

  // Config: 빠진 키만 추가
  var cfgSh = db.getSheetByName('Config');
  var cfgHave = existingKeys_(cfgSh, SCHEMA.Config);
  var cfg = {};
  Object.keys(SEED_CONFIG).forEach(function (k) { cfg[k] = SEED_CONFIG[k]; });
  cfg.rrn_file_id = getProps_().getProperty('RRN_ID');
  cfg.backup_folder_id = backupFolder.getId();
  var cfgRows = Object.keys(cfg).filter(function (k) { return !cfgHave[k]; }).map(function (k) { return { key: k, value: cfg[k] }; });
  addRows_(db, 'Config', cfgRows);
  say(cfgRows.length ? '추가: 설정값 ' + cfgRows.length + '개' : '유지: 설정값');

  // Staff: 소유자가 없으면 추가
  var staffSh = db.getSheetByName('Staff');
  var staffHave = existingKeys_(staffSh, SCHEMA.Staff);
  if (!staffHave[normalizeEmail(OWNER_EMAIL)]) {
    addRows_(db, 'Staff', [{ email: normalizeEmail(OWNER_EMAIL), name: '소유자', role: 'owner', active: 'Y', added_at: now, added_by: 'setup' }]);
    say('추가: 운영진(소유자) 1명');
  } else {
    say('유지: 운영진(소유자)');
  }

  // Templates: 탭이 비어 있을 때만 기본 문구 4개 추가 (사용자가 지운 문구를 되살리지 않기 위해)
  var tplSh = db.getSheetByName('Templates');
  if (tplSh.getLastRow() <= 1) {
    addRows_(db, 'Templates', SEED_TEMPLATES.map(function (t) {
      var o = {}; Object.keys(t).forEach(function (k) { o[k] = t[k]; });
      o.saved_by = 'setup'; o.saved_at = now; return o;
    }));
    say('추가: 기본 문구 ' + SEED_TEMPLATES.length + '개');
  } else {
    say('유지: 저장한 문구');
  }
}

/** 키 열의 기존 값을 {값: true} 형태로 모은다 (이메일은 소문자로 정규화) */
function existingKeys_(sh, def) {
  var out = {};
  var last = sh.getLastRow();
  if (last < 2 || !def.key) return out;
  var idx = def.cols.indexOf(def.key) + 1;
  sh.getRange(2, idx, last - 1, 1).getValues().forEach(function (r) {
    var v = String(r[0]).trim();
    if (!v) return;
    out[def.key === 'email' ? normalizeEmail(v) : v] = true;
  });
  return out;
}

function addRows_(ss, tab, objs) {
  if (!objs.length) return;
  var sh = ss.getSheetByName(tab);
  var cols = SCHEMA[tab].cols;
  var values = objs.map(function (o) { return objectToRow(cols, o); });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, cols.length).setValues(values);
}
