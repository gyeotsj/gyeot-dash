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
           'attend', 'cancel_reason', 'cancelled_at', 'updated_at', 'updated_by', 'sat_at'],
    text: ['hp_no', 'applied_at', 'm1_at', 'pay_at', 'ins_at', 'm2_at', 'cancelled_at', 'updated_at', 'sat_at']
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
  /** 신청 엑셀 업로드 기록. manifest 는 되돌리기용(ID와 채운 칸의 해시)이며 이름·연락처 같은 값은 담지 않는다. */
  Uploads: {
    key: 'upload_id',
    cols: ['upload_id', 'at', 'by', 'program_id', 'sessions', 'n_new', 'n_fill', 'n_skip', 'manifest', 'undone_at'],
    text: ['at', 'sessions', 'manifest', 'undone_at']
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

/* ---------- 쓰기 규칙 (서버가 화면에서 온 모든 입력을 이 규칙으로 다시 검사한다) ---------- */

const TRANSPORT_VALUES = ['', '자차', '고속터미널', '시외터미널'];

/** 단계 체크: date는 완료일(오늘) 기록/비움, attend는 '참석' / '불참' / 빈칸 */
const STEP_DEFS = {
  m1: { col: 'm1_at', kind: 'date' },
  pay: { col: 'pay_at', kind: 'date' },
  ins: { col: 'ins_at', kind: 'date' },
  m2: { col: 'm2_at', kind: 'date' },
  attend: { col: 'attend', kind: 'attend' },
  sat: { col: 'sat_at', kind: 'date' }   // 만족도 조사 응답 여부 (응답일). 2단계에서 추가된 열이라 기존 시트는 migrateSchema 가 필요
};

/** updateEnrollment가 바꿀 수 있는 열. 여기에 없는 열은 화면에서 보내도 거부한다. */
const ENROLLMENT_EDITABLE = {
  transport: { type: 'enum', values: TRANSPORT_VALUES },
  memo: { type: 'text', max: 1000 },
  cancel_reason: { type: 'text', max: 200 },
  pay_amount: { type: 'int', min: 0, max: 10000000, empty: true },
  refund_amount: { type: 'int', min: 0, max: 10000000, empty: true }
};

/** updatePerson이 바꿀 수 있는 열 */
const PERSON_EDITABLE = {
  name: { type: 'text', max: 40, required: true },
  phone: { type: 'phone', required: true },
  email: { type: 'email', empty: true },
  job: { type: 'text', max: 60 },
  area: { type: 'text', max: 60 },
  consent_retain: { type: 'enum', values: ['', 'Y', 'N'] },
  consent_portrait: { type: 'enum', values: ['', 'Y', 'N'] }
};

/** 검증 오류 문구에 붙이는 항목 이름 */
const FIELD_LABELS = {
  name: '이름', phone: '연락처', email: '이메일', job: '직업', area: '거주지',
  consent_retain: '추가 보유 동의', consent_portrait: '초상권 동의',
  transport: '이동수단', memo: '남긴 말', cancel_reason: '취소 사유',
  pay_amount: '입금액', refund_amount: '환불액',
  stage: '단계', channel: '방식', body: '문구', filter: '발송 대상', form_url: '만족도 폼 링크', form_sheet_id: '응답 시트', form_tab: '응답 탭',
  program_id: '프로그램', n: '회차 번호', start: '시작일', end: '종료일', fee: '참가비', cap: '정원', note: '메모',
  _: '요청'
};

/** 회차 입력 규칙 (추가 때 program_id, n 필수. 수정 때는 날짜·참가비·정원·메모만 바꿀 수 있음) */
const SESSION_RULES = {
  program_id: { type: 'enum', values: PROGRAM_IDS },
  n: { type: 'int', min: 1, max: 99 },
  start: { type: 'date' },
  end: { type: 'date' },
  fee: { type: 'int', min: 0, max: 10000000 },
  cap: { type: 'int', min: 1, max: 99 },
  note: { type: 'text', max: 200 }
};
