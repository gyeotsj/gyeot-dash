/**
 * 여행자 보험 명단 (F6). 운영진 누구나.
 *
 * getInsuranceList 는 주민번호가 서버 밖으로 나가는 유일한 길이다. 화면은 받은 값으로 엑셀 파일을 만들어 내려받게 하고,
 * 값을 화면에 표시하거나 저장하지 않는다. 명단을 받은 뒤 보험사에 올렸으면 completeInsurance 로 가입 완료를 기록하고,
 * 그 순간 해당 주민번호는 주민번호 파일에서 지워진다 (Api.gs 의 bulkSetStep 이 지운다).
 * 완료 처리를 하지 않고 닫아도 되고, 나중에 다시 받을 수 있다 (완료 전까지는 번호가 남아 있다).
 */

/**
 * 한 회차의 보험사 제출용 명단. 합격 · 취소 아님 · 아직 보험 완료 아님 · 번호가 정상인 사람의 이름과 주민번호.
 * 번호가 없거나 확인이 필요해 빠진 사람은 이름만 따로 알려 준다 (번호는 알려주지 않는다).
 * 감사 기록에는 회차와 인원 수만 남긴다.
 */
function getInsuranceList(sessionId) {
  requireStaff_();
  var s = sessionById_(sessionId);
  var res = buildInsuranceList(readTab_('Enrollments'), readTab_('People'), rrnReadAll_(), s.session_id);
  audit_('insurance_list', s.session_id, '명단 ' + res.list.length + '명 · 제외 ' + res.excluded.length + '명 · 이미 완료 ' + res.done + '명');
  return { session_id: s.session_id, list: res.list, excluded: res.excluded, done: res.done, at: nowStr_() };
}

/**
 * 보험 가입 완료 처리. 그 회차의 취소 아닌 선택한 사람에게 보험 완료일(오늘)을 기록하고 주민번호를 지운다.
 * 번호를 지우지 못하면 돌려주는 첫 행에 _warn 이 붙는다.
 */
function completeInsurance(sessionId, enrollIds) {
  requireStaff_();
  if (!Array.isArray(enrollIds) || !enrollIds.length) throw apiError('INVALID', '완료 처리할 사람을 선택해 주세요.');
  sessionById_(sessionId);
  var rows = bulkSetStep(sessionId, 'ins', true, enrollIds);
  audit_('insurance_complete', sessionId, '선택 ' + enrollIds.length + '명 · 변경 ' + rows.length + '명');
  return rows;
}
