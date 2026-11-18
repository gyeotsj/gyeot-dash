/**
 * 운영진 관리 (F14). 모든 함수는 소유자 전용이다. (화면에서 메뉴를 숨기는 것과 별개로 서버가 막는다)
 *
 * 운영진 한 명이 앱을 쓰려면 두 가지가 모두 필요하다.
 *   1) Staff 탭에 활성(Y)으로 등록 (앱이 접속자를 확인하는 기준)
 *   2) 운영 DB·주민번호 파일을 구글 드라이브에서 공유받음 ("접속한 사용자 권한으로 실행"이라 파일 권한이 곧 데이터 접근 권한)
 * 이 파일의 함수는 두 가지를 한 번에 맞춘다.
 *
 * 공유 대상: 운영 DB(편집자), 주민번호 파일(편집자), 구글폼 응답 시트(보기, Programs.form_sheet_id 가 채워진 것만).
 *            백업 폴더는 이름·연락처가 든 복사본이 쌓이는 곳이라 소유자 전용으로 두고 공유하지 않는다.
 * 감사 기록: 운영진 이메일은 계정 관리 기록이므로 감사 기록에 남긴다. (그 밖의 개인정보 값은 남기지 않는 원칙의 예외)
 */

/** 공유 대상 파일 목록 */
function sharingTargets_() {
  var props = getProps_(), out = [];
  out.push({ key: 'db', label: '운영 DB', id: propOrThrow_('DB_ID'), role: 'editor' });
  out.push({ key: 'rrn', label: '주민번호 파일', id: propOrThrow_('RRN_ID'), role: 'editor' });
  readTab_('Programs').forEach(function (p) {
    if (String(p.form_sheet_id || '').trim()) {
      out.push({ key: 'form:' + p.program_id, label: p.name + ' 만족도 응답 시트', id: String(p.form_sheet_id).trim(), role: 'viewer' });
    }
  });
  return out;
}

function shareOne_(t, email) {
  try {
    var f = DriveApp.getFileById(t.id);
    if (t.role === 'editor') f.addEditor(email); else f.addViewer(email);
    return { key: t.key, label: t.label, ok: true };
  } catch (e) {
    return { key: t.key, label: t.label, ok: false, error: String(e && e.message ? e.message : e).slice(0, 160) };
  }
}

function unshareOne_(t, email) {
  var f;
  try { f = DriveApp.getFileById(t.id); } catch (e) {
    return { key: t.key, label: t.label, ok: false, error: String(e && e.message ? e.message : e).slice(0, 160) };
  }
  // 편집자·보기 권한 둘 다 지운다. 그 권한이 없을 때 나는 오류는 무시한다.
  try { f.removeEditor(email); } catch (e1) { /* 편집자가 아니면 오류가 난다 */ }
  try { f.removeViewer(email); } catch (e2) { /* 보기 권한이 아니면 오류가 난다 */ }
  return { key: t.key, label: t.label, ok: true };
}

/** 이 파일에 이미 이 이메일의 접근 권한이 있는지 (소유자 본인은 항상 있음) */
function hasAccess_(f, email, role) {
  var list = [f.getOwner() && f.getOwner().getEmail()];
  f.getEditors().forEach(function (u) { list.push(u.getEmail()); });
  if (role === 'viewer') f.getViewers().forEach(function (u) { list.push(u.getEmail()); });
  return isEmailIn(list, email);
}

/** 운영진 목록과 각 사람의 파일 공유 상태 */
function listStaff() {
  requireOwner_();
  var rows = readTab_('Staff'), targets = sharingTargets_();
  var files = targets.map(function (t) {
    try { return { t: t, f: DriveApp.getFileById(t.id), err: '' }; }
    catch (e) { return { t: t, f: null, err: '파일을 열 수 없어요' }; }
  });
  var staff = rows.map(function (r) {
    var active = String(r.active).trim().toUpperCase() === 'Y';
    var shares = files.map(function (x) {
      var ok = false;
      if (x.f && active) { try { ok = hasAccess_(x.f, r.email, x.t.role); } catch (e) { ok = false; } }
      return { key: x.t.key, label: x.t.label, ok: ok };
    });
    return { email: r.email, name: r.name, role: r.role, active: active, added_at: r.added_at, added_by: r.added_by, shares: shares };
  });
  return { staff: staff, targets: targets.map(function (t) { return { key: t.key, label: t.label }; }) };
}

/** 시트 쪽: Staff 탭에 운영진을 추가하거나(삭제됐던 사람이면 다시 활성) 한다. 잠금 안에서 부른다. */
function staffAddRow_(email, name, actor) {
  var rows = readTab_('Staff');
  var ex = rows.filter(function (r) { return normalizeEmail(r.email) === email; })[0];
  if (ex && String(ex.active).trim().toUpperCase() === 'Y') throw apiError('DUPLICATE', '이미 등록된 운영진이에요.');
  if (ex) {
    updateRowUnlocked_('Staff', ex.email, function () { return { active: 'Y', name: name }; }, null, actor);
    return { reactivated: true };
  }
  appendObjects_(openDb_(), SCHEMA, 'Staff', [{ email: email, name: name, role: 'member', active: 'Y', added_at: nowStr_(), added_by: actor }]);
  return { reactivated: false };
}

/** 시트 쪽: 운영진을 비활성으로 바꾼다. 잠금 안에서 부른다. */
function staffRemoveRow_(email, actor) {
  var plan = planStaffRemoval(readTab_('Staff'), email, actor);
  if (!plan.ok) throw apiError('INVALID', plan.error);
  updateRowUnlocked_('Staff', plan.row.email, function () { return { active: 'N' }; }, null, actor);
  return plan.row;
}

/** 운영진 추가: 목록에 등록하고 파일을 공유한다. 일부 파일 공유가 실패해도 등록은 유지하고 실패한 파일을 알려 준다. */
function addStaff(email, name) {
  var who = requireOwner_();
  var v = validateStaffInput(email, name);
  if (!v.ok) throw apiError('INVALID', v.error);
  var res = withLock_(function () { return staffAddRow_(v.email, v.name, who.email); });
  var shares = sharingTargets_().map(function (t) { return shareOne_(t, v.email); });
  audit_(res.reactivated ? 'staff_readd' : 'staff_add', v.email, shares.filter(function (s) { return !s.ok; }).length ? '공유 실패 ' + shares.filter(function (s) { return !s.ok; }).map(function (s) { return s.label; }).join(', ') : '공유 완료');
  return { email: v.email, name: v.name, reactivated: res.reactivated, shares: shares };
}

/** 운영진 삭제: 목록에서 비활성 처리하고 파일 공유를 해제한다. (본인·소유자는 삭제 불가) 접속은 즉시 막힌다. */
function removeStaff(email) {
  var who = requireOwner_();
  var target = normalizeEmail(email);
  withLock_(function () { staffRemoveRow_(target, who.email); });
  var shares = sharingTargets_().map(function (t) { return unshareOne_(t, target); });
  audit_('staff_remove', target, shares.filter(function (s) { return !s.ok; }).length ? '공유 해제 실패 ' + shares.filter(function (s) { return !s.ok; }).map(function (s) { return s.label; }).join(', ') : '공유 해제 완료');
  return { email: target, shares: shares };
}

/** 이미 등록된 활성 운영진에게 빠진 파일 공유를 다시 한다 (예: 응답 시트를 나중에 연결했을 때, 공유가 실패했을 때) */
function fixStaffSharing(email) {
  var who = requireOwner_();
  var target = normalizeEmail(email);
  var row = findActiveStaff(readTab_('Staff'), target);
  if (!row) throw apiError('NOT_FOUND', '운영진 목록에 없는 이메일이에요.');
  var shares = sharingTargets_().map(function (t) { return shareOne_(t, target); });
  audit_('staff_fix_share', target, shares.filter(function (s) { return !s.ok; }).length ? '일부 실패' : '완료');
  return { email: target, shares: shares };
}
