/**
 * 로그인·회원가입·계정 설정의 입력 확인과 오류 → 화면 문구 (AuthContext 가 쓴다)
 */

/** 비밀번호 최소 길이 (Supabase Auth 기본값과 같다) */
const MIN_PASSWORD_LENGTH = 6;
/** 메일 인증번호 자릿수 */
const OTP_LENGTH = 6;

/** 요청이 많아 Supabase 가 잠시 막았을 때 문구 */
export const RATE_LIMITED_TEXT = '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.';

/** 지금 비밀번호와 같은 비밀번호로 바꾸려 할 때 문구 */
export const SAME_PASSWORD_TEXT = '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.';

/** 개발용 테스트 계정은 Supabase 계정이 없어 바꿀 수 없다 */
export const DEV_ACCOUNT_ERROR = '개발용 테스트 계정은 바꿀 수 없습니다. 실제 계정으로 로그인해 주세요.';

/** Supabase 오류가 요청 횟수 제한인지 */
export const isRateLimited = (message: string): boolean => /rate|too many/i.test(message);

/** 명단(members 탭)·알림의 소속 칸 — 회사와 팀을 '회사 · 팀' 한 칸으로 적는다 (회사가 없으면 팀만) */
export const affiliationText = (company: string, team: string): string => (company.trim() ? `${company.trim()} · ${team.trim()}` : team.trim());

/**
 * 이름·회사·팀 중 빈 칸이 있거나 한글·영문 말고 다른 글자가 있으면 안내 문구, 아니면 빈 문자열.
 * nameLabel: 이름 칸의 표기 — 회원가입·승인 요청은 '담당자', 내 계정 설정은 '이름' (2026-11-19 사용자 결정)
 */
export const missingProfileText = (name: string, company: string, team: string, nameLabel = '이름'): string =>
  !name.trim() || !company.trim() || !team.trim()
    ? `${nameLabel}·회사·팀을 모두 입력해 주세요.`
    : [name, company, team].some((v) => !isLetterText(v))
      ? `${nameLabel}·회사·팀은 한글이나 영문으로만 입력해 주세요. 숫자·기호는 쓸 수 없습니다.`
      : '';

/** 한글(완성형)·영문과 단어 사이 띄어쓰기만 있는지 — 담당자명·회사·팀 칸 (2026-11-19 사용자 결정) */
export const isLetterText = (v: string): boolean => /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/.test(v.trim().replace(/\s+/g, ' '));

/** 입력한 인증번호에서 숫자만 남긴다 */
export const otpDigits = (code: string): string => code.replace(/\D/g, '');

/** 인증번호(숫자만)가 6자리보다 짧으면 안내 문구, 아니면 빈 문자열 */
export const otpLengthError = (token: string): string => (token.length < OTP_LENGTH ? '메일로 받은 6자리 인증번호를 입력해 주세요.' : '');

/** 비밀번호가 6자보다 짧으면 안내 문구(isNew 면 '새 비밀번호…'), 아니면 빈 문자열 */
export const passwordLengthError = (password: string, isNew = false): string =>
  password.length < MIN_PASSWORD_LENGTH ? (isNew ? '새 비밀번호는 6자 이상으로 정해 주세요.' : '비밀번호는 6자 이상으로 정해 주세요.') : '';

/** 인증번호 보내기·확인 오류 → 화면 문구 */
export const codeErrorText = (message: string): string => {
  if (/signups not allowed|user not found/i.test(message)) return '가입된 이메일이 아닙니다. 아래 "회원가입 및 열람 요청"을 먼저 해 주세요.';
  if (/expired|invalid/i.test(message)) return '인증번호가 맞지 않거나 시간이 지났습니다. 다시 받아 주세요.';
  if (isRateLimited(message) || /seconds/i.test(message)) return RATE_LIMITED_TEXT;
  return '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
};

/** 비밀번호 정하기(updateUser) 오류 → 화면 문구 */
export const passwordErrorText = (message: string): string => {
  if (/different from the old|same/i.test(message)) return SAME_PASSWORD_TEXT;
  if (/weak|short|at least|characters/i.test(message)) return '비밀번호가 너무 쉽거나 짧습니다. 6자 이상으로 다시 정해 주세요.';
  return '비밀번호를 정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
};
