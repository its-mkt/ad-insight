import React, { useEffect, useState } from 'react';
import { Check, TriangleAlert, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput } from '../common/TextInput';
import { Button } from '../common/Button';

/** 인증번호를 다시 보낼 수 있을 때까지 기다리는 초 (Supabase 기본 제한과 같다) */
const RESEND_SEC = 60;

/** 입력칸 아래 빨간 오류 한 줄 — 로그인·가입 폼이 함께 쓴다 */
export const GateError: React.FC<{ message: string }> = ({ message }) => (
  <div className="gate-error" role="alert">
    <TriangleAlert size="0.75rem" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

/** 이 브라우저에서 지난번 로그인한 이메일 (편의용 — 읽지 못해도 빈 칸으로 시작한다) */
const LOGIN_PREF_KEY = 'adi_login_pref';
const readLastEmail = (): string => {
  try {
    const v = JSON.parse(localStorage.getItem(LOGIN_PREF_KEY) || '{}');
    return typeof v.email === 'string' ? v.email : '';
  } catch {
    return '';
  }
};
const saveLastEmail = (email: string) => {
  try {
    localStorage.setItem(LOGIN_PREF_KEY, JSON.stringify({ email }));
  } catch {
    // 저장하지 못해도 로그인에는 영향 없다
  }
};

interface EmailCodeFormProps {
  /** reset: 가입된 이메일로 인증한 뒤 새 비밀번호로 바꾸고 로그인 (회원가입은 SignupForm) */
  mode: 'reset';
  /** 인증까지 끝나면 부른다 (인증한 이메일) */
  onDone?: (email: string) => void;
  /** 처음 채워 둘 이메일 */
  initialEmail?: string;
}

/** 인증번호 입력칸 + 다시 보내기·이메일 바꾸기 — 회원가입·비밀번호 찾기가 함께 쓴다 */
const CodeStep: React.FC<{
  sentTo: string;
  code: string;
  onCode: (v: string) => void;
  err: boolean;
  wait: number;
  submitting: boolean;
  onResend: () => void;
  onChangeEmail: () => void;
}> = ({ sentTo, code, onCode, err, wait, submitting, onResend, onChangeEmail }) => (
  <>
    <p className="gate-code-sent">
      <strong>{sentTo}</strong> 로 보낸 6자리 인증번호를 입력해 주세요.
      <br />
      메일이 없으면 스팸함도 확인해 주세요.
    </p>
    <TextInput
      className={`gate-input gate-code${err ? ' err' : ''}`}
      name="one-time-code"
      autoComplete="one-time-code"
      inputMode="numeric"
      maxLength={6}
      placeholder="인증번호 6자리"
      value={code}
      onChange={(e) => onCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      autoFocus
    />
    <div className="gate-code-actions">
      <Button variant="link" data-btn="code-resend" disabled={wait > 0 || submitting} onClick={onResend}>
        {wait > 0 ? `다시 보내기 (${wait}초)` : '인증번호 다시 보내기'}
      </Button>
      <Button variant="link" data-btn="code-change-email" onClick={onChangeEmail}>
        이메일 바꾸기
      </Button>
    </div>
  </>
);

/** 인증번호 다시 보내기 대기 초 — 1초마다 줄어든다 */
const useResendWait = () => {
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return [wait, setWait] as const;
};

/** 회원가입 단계 */
const SIGNUP_STEPS = ['이메일 인증', '정보 입력', '관리자 승인'] as const;

/** 회원가입 진행도 — ① 이메일 인증 ② 정보 입력 ③ 관리자 승인. 승인 대기 화면에서도 ③으로 이어서 보여 준다 */
export const SignupSteps: React.FC<{ current: 0 | 1 | 2 }> = ({ current }) => (
  <ol className="signup-steps" aria-label="회원가입 진행 단계">
    {SIGNUP_STEPS.map((label, i) => (
      <li key={label} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
        <span className="signup-step-dot" aria-hidden="true">
          {i < current ? <Check size="0.75rem" /> : i + 1}
        </span>
        <span className="signup-step-label">{label}</span>
      </li>
    ))}
  </ol>
);

interface ProfileFieldsProps {
  /** 이름 입력값 */
  name: string;
  /** 회사 입력값 */
  company: string;
  /** 팀 입력값 */
  team: string;
  /** 이름이 바뀌면 부른다 */
  onName: (v: string) => void;
  /** 회사가 바뀌면 부른다 */
  onCompany: (v: string) => void;
  /** 팀이 바뀌면 부른다 */
  onTeam: (v: string) => void;
  /** 오류 테두리를 그릴지 */
  err: boolean;
  /** 이름 칸에 처음 커서를 둘지 */
  autoFocus?: boolean;
}

/** 이름·회사·팀 입력칸 — 회원가입 2단계와 승인 다시 요청에 함께 쓴다 (셋 다 필수) */
export const ProfileFields: React.FC<ProfileFieldsProps> = ({ name, company, team, onName, onCompany, onTeam, err, autoFocus }) => {
  const cls = `gate-input${err ? ' err' : ''}`;
  return (
    <>
      <TextInput className={cls} name="name" autoComplete="name" placeholder="이름" value={name} onChange={(e) => onName(e.target.value)} autoFocus={autoFocus} />
      <TextInput className={cls} name="company" autoComplete="organization" placeholder="회사" value={company} onChange={(e) => onCompany(e.target.value)} />
      <TextInput className={cls} name="team" autoComplete="organization-title" placeholder="팀" value={team} onChange={(e) => onTeam(e.target.value)} />
    </>
  );
};

interface SignupFormProps {
  /** 이미 가입된 이메일일 때 — 그 이메일로 로그인(login) 또는 비밀번호 찾기(reset) 화면으로 넘긴다 */
  onExistingAccount?: (email: string, next: 'login' | 'reset') => void;
}

/**
 * 회원가입 및 열람 요청 — ① 이메일 인증(인증번호) → ② 이름·회사·팀·비밀번호 → ③ 관리자 승인 대기.
 * 이메일부터 확인해 쓸 수 없는 주소로 정보를 다 적는 일을 막는다 (2026-11-18 사용자 결정).
 * 인증되면 로그인 상태가 되지만 2단계를 마칠 때까지 접속 화면은 이 폼을 유지한다 (AuthContext.signupInProgress)
 */
export const SignupForm: React.FC<SignupFormProps> = ({ onExistingAccount }) => {
  const { user, sendEmailCode, verifyEmailCode, completeSignup, signupInProgress, cancelSignup } = useAuth();
  const [email, setEmail] = useState('');
  /** 인증번호를 보내려던 이메일이 이미 가입돼 있다 — 로그인·비밀번호 찾기 버튼을 보인다 */
  const [registered, setRegistered] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [wait, setWait] = useResendWait();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const err = error ? ' err' : '';
  const step: 0 | 1 = signupInProgress ? 1 : 0;

  const send = async () => {
    setError('');
    setRegistered(false);
    setSubmitting(true);
    const res = await sendEmailCode(email, true);
    setSubmitting(false);
    if (res.registered) setRegistered(true);
    if (res.error) return setError(res.error);
    setSentTo(email.trim());
    setCode('');
    setWait(RESEND_SEC);
  };

  const verify = async (value: string) => {
    setError('');
    setSubmitting(true);
    const res = await verifyEmailCode(sentTo, value);
    setSubmitting(false);
    if (res.error) setError(res.error);
  };

  const complete = async () => {
    setError('');
    if (password !== password2) return setError('비밀번호 확인이 일치하지 않습니다.');
    setSubmitting(true);
    const res = await completeSignup({ name, company, team, password });
    setSubmitting(false);
    if (res.error) setError(res.error);
  };

  return (
    <>
      <SignupSteps current={step} />
      {step === 1 ? (
        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault();
            void complete();
          }}
        >
          <p className="gate-code-sent">
            <strong>{user?.email || sentTo}</strong> 인증이 끝났습니다.
            <br />
            열람 요청에 쓸 정보와 로그인 비밀번호를 정해 주세요.
          </p>
          <ProfileFields name={name} company={company} team={team} onName={setName} onCompany={setCompany} onTeam={setTeam} err={!!error} autoFocus />
          <TextInput className={`gate-input${err}`} type="password" name="new-password" autoComplete="new-password" placeholder="비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextInput className={`gate-input${err}`} type="password" name="new-password2" autoComplete="new-password" placeholder="비밀번호 확인" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          {error && <GateError message={error} />}
          <Button variant="primary" type="submit" className="btn-login" data-btn="signup-complete" disabled={submitting}>
            {submitting ? '보내는 중...' : '회원가입 및 열람 요청'}
          </Button>
          <Button variant="link" data-btn="signup-cancel" onClick={() => void cancelSignup()}>
            처음부터 다시 하기
          </Button>
        </form>
      ) : (
        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (sentTo) void verify(code);
            else void send();
          }}
        >
          {sentTo ? (
            <CodeStep
              sentTo={sentTo}
              code={code}
              err={!!error}
              wait={wait}
              submitting={submitting}
              onCode={(v) => {
                setCode(v);
                // 6자리를 다 넣으면(붙여넣기 포함) 버튼을 누르지 않아도 바로 확인한다
                if (v.length === 6 && !submitting) void verify(v);
              }}
              onResend={() => void send()}
              onChangeEmail={() => {
                setSentTo('');
                setError('');
              }}
            />
          ) : (
            <TextInput
              className={`gate-input${err}`}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (registered) {
                  setRegistered(false);
                  setError('');
                }
              }}
              autoFocus
            />
          )}
          {error && <GateError message={error} />}
          {registered && onExistingAccount ? (
            <div className="gate-actions gate-registered">
              <Button variant="primary" data-btn="signup-registered-login" onClick={() => onExistingAccount(email.trim(), 'login')}>
                로그인하기
              </Button>
              <Button data-btn="signup-registered-reset" onClick={() => onExistingAccount(email.trim(), 'reset')}>
                비밀번호 찾기
              </Button>
            </div>
          ) : (
            <Button variant="primary" type="submit" className="btn-login" data-btn={sentTo ? 'signup-verify' : 'signup-send-code'} disabled={submitting}>
              {submitting ? (sentTo ? '확인 중...' : '보내는 중...') : sentTo ? '인증하고 다음 단계로' : '이메일 인증번호 받기'}
            </Button>
          )}
        </form>
      )}
    </>
  );
};

/**
 * 비밀번호 찾기 — 가입된 이메일로 받은 인증번호와 새 비밀번호로 바꾸고 로그인한다.
 * 로그인은 비밀번호로 하고, 인증번호는 메일 주인 확인에만 쓴다 (2026-11-18 사용자 결정)
 */
export const EmailCodeForm: React.FC<EmailCodeFormProps> = ({ onDone, initialEmail = '' }) => {
  const { sendEmailCode, resetPasswordWithCode } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useResendWait();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const err = error ? ' err' : '';

  const send = async () => {
    setError('');
    setSubmitting(true);
    const res = await sendEmailCode(email);
    setSubmitting(false);
    if (res.error) return setError(res.error);
    setSentTo(email.trim());
    setCode('');
    setWait(RESEND_SEC);
  };

  const verify = async () => {
    setError('');
    if (password !== password2) return setError('새 비밀번호 확인이 일치하지 않습니다.');
    setSubmitting(true);
    const res = await resetPasswordWithCode(sentTo, code, password);
    setSubmitting(false);
    if (res.error) setError(res.error);
    else onDone?.(sentTo);
  };

  if (!sentTo) {
    return (
      <form
        className="gate-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <TextInput className={`gate-input${err}`} type="email" name="email" autoComplete="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        {error && <GateError message={error} />}
        <Button variant="primary" type="submit" className="btn-login" data-btn="reset-send-code" disabled={submitting}>
          {submitting ? '보내는 중...' : '인증번호 받기'}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="gate-form"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <CodeStep
        sentTo={sentTo}
        code={code}
        err={!!error}
        wait={wait}
        submitting={submitting}
        onCode={setCode}
        onResend={() => void send()}
        onChangeEmail={() => {
          setSentTo('');
          setError('');
        }}
      />
      <TextInput className={`gate-input${err}`} type="password" name="new-password" autoComplete="new-password" placeholder="새 비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextInput className={`gate-input${err}`} type="password" name="new-password2" autoComplete="new-password" placeholder="새 비밀번호 확인" value={password2} onChange={(e) => setPassword2(e.target.value)} />
      {error && <GateError message={error} />}
      <Button variant="primary" type="submit" className="btn-login" data-btn="reset-verify" disabled={submitting}>
        {submitting ? '확인 중...' : '비밀번호 바꾸고 로그인'}
      </Button>
    </form>
  );
};

/** 비밀번호 로그인 폼 — 브라우저에 저장한 비밀번호가 자동으로 채워진다 */
const PasswordLoginForm: React.FC<{ initialEmail?: string; onDone?: (email: string) => void }> = ({ initialEmail = '', onDone }) => {
  const { loginWithPassword } = useAuth();
  const [loginId, setLoginId] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const err = error ? ' err' : '';

  return (
    <form
      className="gate-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        const res = await loginWithPassword(loginId, password);
        setSubmitting(false);
        if (res.error) setError(res.error);
        else onDone?.(loginId.trim());
      }}
    >
      <TextInput className={`gate-input${err}`} name="username" autoComplete="username" placeholder="이메일" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus={!initialEmail} />
      <TextInput
        className={`gate-input${err}`}
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus={!!initialEmail}
      />
      {error && <GateError message={error} />}
      <Button variant="primary" type="submit" className="btn-login" data-btn="login-submit" disabled={submitting}>
        {submitting ? '확인 중...' : '로그인'}
      </Button>
    </form>
  );
};

interface LoginFormProps {
  /** 로그인에 성공하면 부른다 */
  onDone?: () => void;
  /** 폼 바로 밑에 테스트 관리자 버튼을 그릴지 (접속 화면은 맨 아래에 따로 그려 false) */
  showDevLogin?: boolean;
  /** 이메일 칸에 미리 채울 값 (없으면 이 브라우저에서 지난번 로그인한 이메일) */
  initialEmail?: string;
  /** 비밀번호 찾기 화면으로 시작할지 */
  initialResetting?: boolean;
}

/**
 * 로그인 폼 — 접속 화면(AccessGate)과 관리자 로그인 모달이 함께 쓴다.
 * 이메일·비밀번호로만 로그인하고(2026-11-18 사용자 결정), 비밀번호를 잊으면 '비밀번호 찾기'에서 메일 인증번호로 새로 정한다.
 * 이 브라우저에서 지난번 로그인한 이메일을 기억해 채워 둔다. 개발 서버에서는 테스트 관리자 버튼도 보인다.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onDone, showDevLogin = true, initialEmail, initialResetting = false }) => {
  const [lastEmail] = useState(() => initialEmail || readLastEmail());
  const [resetting, setResetting] = useState(initialResetting);
  const done = (email: string) => {
    saveLastEmail(email);
    onDone?.();
  };
  return (
    <>
      {resetting ? <EmailCodeForm key="reset" mode="reset" initialEmail={lastEmail} onDone={done} /> : <PasswordLoginForm key="password" initialEmail={lastEmail} onDone={done} />}
      <p className="gate-method">
        <Button variant="link" data-btn={resetting ? 'login-back' : 'login-forgot'} onClick={() => setResetting(!resetting)}>
          {resetting ? '로그인으로 돌아가기' : '비밀번호를 잊으셨나요?'}
        </Button>
      </p>
      {showDevLogin && <DevLoginButton onDone={onDone} />}
    </>
  );
};

/** 개발 서버 전용 '테스트용 관리자로 바로 시작' 버튼 — 운영 빌드에서는 아무것도 그리지 않는다 */
export const DevLoginButton: React.FC<{ /** 로그인한 뒤 부른다 */ onDone?: () => void }> = ({ onDone }) => {
  const { loginAsDevAdmin } = useAuth();
  if (!import.meta.env.DEV) return null;
  return (
    <button
      type="button"
      className="btn btn-dev-login"
      data-btn="dev-login"
      onClick={() => {
        loginAsDevAdmin();
        onDone?.();
      }}
    >
      <Zap size="0.75rem" aria-hidden="true" />
      <span>테스트용 관리자로 바로 시작</span>
    </button>
  );
};
