/**
 * 탭과 열 정의의 단일 기준 (TECH_DESIGN.md 4장).
 *
 * - 열 순서는 시트의 실제 열 순서와 같다. 기존 열의 순서를 바꾸지 말고, 필요하면 맨 끝에 추가한다.
 * - text: 글자(텍스트) 서식으로 고정할 열. 전화번호의 앞자리 0이 지워지거나 날짜가 멋대로 바뀌는 것을 막는다.
 * - 날짜는 '2026-10-09', 시각은 '2026-10-09 15:30:00' 형식의 글자로 저장한다.
 * - 이 파일과 Lib.gs에는 구글 서비스(SpreadsheetApp 등)를 쓰지 않는다. Node 테스트(app/tests/run.js)가 읽어서 검사한다.
 */

const OWNER_EMAIL = 'gyeot.sj@gmail.com';

/** 문구 단계: 1차 안내 / 입금 요청 / 최종 안내 / 만족도 요청 / 기타 */
const STAGES = ['m1', 'pay', 'm2', 'sat', 'etc'];
/** 프로그램: 일해보기 / 살아보기 / 자라보기 */
const PROGRAM_IDS = ['w', 'l', 'g'];

/** 운영 DB 스프레드시트의 탭 */
const SCHEMA = {
  Programs: {
    key: 'program_id',
    cols: ['program_id', 'name', 'form_sheet_id', 'form_tab', 'form_url'],
    text: ['form_sheet_id']
  },
  Sessions: {
    key: 'session_id',
    cols: ['session_id', 'program_id', 'n', 'start', 'end', 'fee', 'cap', 'note'],
    text: ['start', 'end']
  },
  People: {
    key: 'person_id',
    cols: ['person_id', 'name', 'phone', 'email', 'gender', 'birth_year', 'job', 'area',
           'consent_retain', 'consent_portrait', 'created_at', 'updated_at'],
    text: ['phone', 'created_at', 'updated_at']
  },
  Enrollments: {
    key: 'enroll_id',
    cols: ['enroll_id', 'session_id', 'person_id', 'hp_no', 'applied_at', 'pass', 'notice_ack', 'memo',
           'transport', 'm1_at', 'pay_at', 'pay_amount', 'refund_amount', 'ins_at', 'm2_at',
           'attend', 'cancel_reason', 'cancelled_at', 'updated_at', 'updated_by'],
    text: ['hp_no', 'applied_at', 'm1_at', 'pay_at', 'ins_at', 'm2_at', 'cancelled_at', 'updated_at']
  },
  SatMatches: {
    key: 'resp_key',
    cols: ['resp_key', 'program_id', 'enroll_id', 'status', 'raw_name', 'raw_session', 'matched_by', 'matched_at'],
    text: ['resp_key', 'matched_at']
  },
  Staff: {
    key: 'email',
    cols: ['email', 'name', 'role', 'active', 'added_at', 'added_by'],
    text: ['added_at']
  },
  MessageLog: {
    key: 'log_id',
    cols: ['log_id', 'at', 'by', 'session_id', 'channel', 'stage', 'filter', 'count', 'body'],
    text: ['at']
  },
  Templates: {
    key: 'tpl_id',
    cols: ['tpl_id', 'name', 'stage', 'program_id', 'channel', 'body', 'saved_by', 'saved_at'],
    text: ['saved_at']
  },
  AuditLog: {
    key: null,
    cols: ['at', 'by', 'action', 'target', 'detail'],
    text: ['at']
  },
  Config: {
    key: 'key',
    cols: ['key', 'value'],
    text: ['value']
  },
  Stats: {
    key: null,
    cols: ['year', 'program_id', 'session_id', 'n_applied', 'n_attend', 'n_male', 'n_female',
           'n_age_under20', 'n_age_20s', 'n_age_30s', 'n_age_40plus', 'jobs_json', 'areas_json'],
    text: []
  }
};

/** 주민번호 파일(별도 스프레드시트)의 탭. 운영 DB에는 주민번호를 두지 않는다. */
const RRN_SCHEMA = {
  RRN: {
    key: 'enroll_id',
    cols: ['enroll_id', 'rrn', 'session_end', 'saved_at'],
    text: ['enroll_id', 'rrn', 'session_end', 'saved_at']
  }
};

/* ---------- 초기 데이터 (setup()이 비어 있을 때만 채움) ---------- */

const SEED_PROGRAMS = [
  { program_id: 'w', name: '일해보기' },
  { program_id: 'l', name: '살아보기' },
  { program_id: 'g', name: '자라보기' }
];

const SEED_CONFIG = {
  refund_days: '3',
  retention_years: '3',
  rrn_sweep_months: '3'
};

/** 기본 문구. {이름} 같은 자리표시자만 쓰므로 개인정보가 들어가지 않는다. */
const SEED_TEMPLATES = [
  { tpl_id: 't1', name: '1차 안내 기본', stage: 'm1', program_id: 'all', channel: 'mail',
    body: '{이름}님, 곁마을 {프로그램} {회차}에 함께해 주셔서 감사합니다. 상세 시간표와 참가비 안내를 보내드립니다. 참가비는 {참가비}원이며, 입금 후 알려 주세요.' },
  { tpl_id: 't2', name: '입금 요청 기본', stage: 'pay', program_id: 'all', channel: 'sms',
    body: '[곁마을] {이름}님, {프로그램} {회차} 참가비 {참가비}원 입금이 아직 확인되지 않았어요. 참여 3일 전인 {환불기한}까지 취소하면 전액 환불됩니다.' },
  { tpl_id: 't3', name: '최종 안내 기본', stage: 'm2', program_id: 'all', channel: 'sms',
    body: '[곁마을] {이름}님, {회차} {날짜}가 곧 시작돼요. 집결 시간과 장소는 메일을 확인해 주세요. 이동수단: {이동수단}' },
  { tpl_id: 't4', name: '만족도 요청 기본', stage: 'sat', program_id: 'all', channel: 'sms',
    body: '[곁마을] {이름}님, {프로그램} {회차}는 어떠셨나요? 짧은 만족도 조사에 참여해 주세요. {폼링크}' }
];
