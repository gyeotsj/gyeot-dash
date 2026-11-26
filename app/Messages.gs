/**
 * 문자·메일 발송 준비 (F7)와 프로그램 설정. 운영진 누구나.
 * 실제 발송은 하지 않는다 (알리고 단체문자·메일은 운영진이 직접 보낸다). 이 앱은 문구 저장, 발송 기록, 안내 단계 표시만 한다.
 * 문구는 {이름} 같은 자리표시자 상태로 저장한다. 발송 기록에도 받는 사람의 이름·연락처는 남기지 않는다 (인원 수만).
 */

/** 문구 저장. 같은 이름·단계·프로그램이면 덮어쓴다. t.tpl_id 가 있으면 그 문구를 고친다(이름 바꾸기 포함). */
function saveTemplate(t) {
  var who = requireStaff_();
  var v = validateTemplate(t);
  if (!v.ok) throw apiError('INVALID', firstError(v.errors));
  var res = withLock_(function () {
    var all = readTab_('Templates');
    var same = function (x) { return x.name === v.clean.name && x.stage === v.clean.stage && x.program_id === v.clean.program_id; };
    var byId = t && t.tpl_id ? all.filter(function (x) { return x.tpl_id === String(t.tpl_id); })[0] : null;
    var dup = all.filter(function (x) { return same(x) && (!byId || x.tpl_id !== byId.tpl_id); })[0];
    var target = byId || dup;
    if (byId && dup) throw apiError('DUPLICATE', '같은 이름·단계·프로그램의 다른 문구가 이미 있어요.');
    var row = { name: v.clean.name, stage: v.clean.stage, program_id: v.clean.program_id, channel: v.clean.channel, body: v.clean.body, saved_by: who.email, saved_at: nowStr_() };
    if (target) {
      row.tpl_id = target.tpl_id;
      updateRowUnlocked_('Templates', target.tpl_id, function () { return row; }, null, who.email);
      return { row: row, created: false };
    }
    if (all.length >= 200) throw apiError('INVALID', '저장한 문구가 너무 많아요 (최대 200개). 쓰지 않는 문구를 지워 주세요.');
    row.tpl_id = makeId('t_');
    appendObjects_(openDb_(), SCHEMA, 'Templates', [row]);
    return { row: row, created: true };
  });
  audit_(res.created ? 'template_create' : 'template_update', res.row.tpl_id, '단계 ' + res.row.stage);
  return res.row;
}

function deleteTemplate(tplId) {
  requireStaff_();
  withLock_(function () {
    var n = deleteRowsByKeysUnlocked_('Templates', [String(tplId)]);
    if (!n) throw apiError('NOT_FOUND', '문구를 찾을 수 없어요.');
  });
  audit_('template_delete', String(tplId), '');
  return true;
}

/**
 * 발송 기록. 대상은 서버가 조건(filter)으로 다시 계산한다 (화면이 보낸 목록을 믿지 않는다).
 * markSteps 가 켜져 있고 단계가 m1(1차 안내)·m2(최종 안내)이면 대상자 전원에게 그 안내 완료일을 오늘로 기록한다.
 * 반환: { log, marked(안내 완료로 바뀐 인원), count }
 */
function logMessage(sessionId, channel, stage, filter, body, markSteps) {
  var who = requireStaff_();
  sessionById_(sessionId);
  var v = validateMessageLog({ channel: channel, stage: stage, filter: filter, body: body });
  if (!v.ok) throw apiError('INVALID', firstError(v.errors));
  var targets = messageTargets(readTab_('Enrollments'), sessionId, v.clean.filter);
  var log = {
    log_id: makeId('m_'), at: nowStr_(), by: who.email, session_id: sessionId, channel: v.clean.channel, stage: v.clean.stage,
    filter: v.clean.filter, count: targets.length, body: v.clean.body
  };
  withLock_(function () { appendObjects_(openDb_(), SCHEMA, 'MessageLog', [log]); });
  audit_('message_log', log.log_id, sessionId + ' · ' + log.channel + ' · ' + log.stage + ' · ' + log.count + '명');

  var marked = 0;
  var markStep = (markSteps === true || markSteps === 'true') ? (log.stage === 'm1' ? 'm1' : (log.stage === 'm2' ? 'm2' : '')) : '';
  if (markStep && targets.length) {
    var ids = targets.map(function (e) { return e.enroll_id; });
    for (var i = 0; i < ids.length; i += 200) marked += bulkSetStep(sessionId, markStep, true, ids.slice(i, i + 200)).length;
  }
  return { log: log, marked: marked, count: log.count };
}

/**
 * 프로그램 설정: 만족도 폼 링크(http/https만), 응답 시트 주소 또는 ID, 응답 탭 이름. 들어온 항목만 바꾼다. 운영진 누구나.
 * 응답 시트는 읽기만 하며(Satisfaction.gs) 값을 비우면 연결이 해제된다.
 */
function saveProgram(programId, input) {
  var who = requireStaff_();
  if (PROGRAM_IDS.indexOf(String(programId)) < 0) throw apiError('NOT_FOUND', '프로그램을 찾을 수 없어요.');
  var v = validateProgramInput(input);
  if (!v.ok) throw apiError('INVALID', firstError(v.errors));
  var res = updateRowByKey_('Programs', String(programId), function () { return v.clean; }, null, who.email);
  if (res.changed.length) audit_('program_save', String(programId), '변경 항목: ' + res.changed.join(', '));
  return res.row;
}