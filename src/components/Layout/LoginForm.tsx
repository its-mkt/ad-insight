import React, { useEffect, useState } from 'react';
import { TriangleAlert, Zap } from 'lucide-react';
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
  /** signup: 이름·소속·비밀번호를 받고 메일 인증 뒤 계정을 만들어 열람 승인을 요청 · reset: 가입된 이메일로 인증 뒤 새 비밀번호로 바꾸고 로그인 */
  mode: 'signup' | 'reset';
  /** 인증까지 끝나면 부른다 (인증한 이메일) */
  onDone?: (email: string) => void;
  /** 처음 채워 둘 이메일 */
  initialEmail?: string;
}

/**
 * 이메일 인증번호 폼 (Supabase OTP) — 로그인은 비밀번호로 하고, 인증번호는 메일 주인 확인에만 쓴다 (2026-11-18 사용자 결정).
 * 회원가입: 이름·소속·이메일·비밀번호 → 인증번호 → 가입 및 열람 요청. 비밀번호 찾기: 이메일 → 인증번호·새 비밀번호 → 로그인.
 */
export const EmailCodeForm: React.FC<EmailCodeFormProps> = ({ mode, onDone, initialEmail = '' }) => {
  const { sendEmailCode, verifyEmailCode, resetPasswordWithCode } = useAuth();
  const signup = mode === 'signup';
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const info = signup ? { name, team, password } : undefined;

  const send = async () => {
    setError('');
    if (signup && password !== password2) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    const res = await sendEmailCode(email, info);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSentTo(email.trim());
    setCode('');
    setWait(RESEND_SEC);
  };

  const verify = async (value = code) => {
    setError('');
    if (!signup && password !== password2) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    const res = signup ? await verifyEmailCode(sentTo, value, info) : await resetPasswordWithCode(sentTo, value, password);
    setSubmitting(false);
    if (res.error) setError(res.error);
    else onDone?.(sentTo);
  };

  const err = error ? ' err' : '';
  const passwordFields = (label: string) => (
    <>
      <TextInput className={`gate-input${err}`} type="password" name="new-password" autoComplete="new-password" placeholder={`${label} (6자 이상)`} value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextInput className={`gate-input${err}`} type="password" name="new-password2" autoComplete="new-password" placeholder={`${label} 확인`} value={password2} onChange={(e) => setPassword2(e.target.value)} />
    </>
  );

  if (!sentTo) {
    return (
      <form
        className="gate-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {signup && (
          <>
            <TextInput className={`gate-input${err}`} name="name" autoComplete="name" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <TextInput className={`gate-input${err}`} name="team" autoComplete="organization" placeholder="소속 (회사·팀)" value={team} onChange={(e) => setTeam(e.target.value)} />
          </>
        )}
        <TextInput className={`gate-input${err}`} type="email" name="email" autoComplete="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!signup} />
        {signup && passwordFields('비밀번호')}
        {error && <GateError message={error} />}
        <button type="submit" className="btn acc btn-login" data-btn={signup ? 'signup-send-code' : 'reset-send-code'} disabled={submitting}>
          {submitting ? '보내는 중...' : signup ? '이메일 인증번호 받기' : '인증번호 받기'}
        </button>
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
      <p className="gate-code-sent">
        <strong>{sentTo}</strong> 로 보낸 6자리 인증번호를 입력해 주세요. 메일이 없으면 스팸함도 확인해 주세요.
      </p>
      <TextInput
        className={`gate-input gate-code${err}`}
        name="one-time-code"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        placeholder="인증번호 6자리"
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6);
          setCode(v);
          // 회원가입은 6자리를 다 넣으면(붙여넣기 포함) 버튼을 누르지 않아도 바로 확인한다 (비밀번호 찾기는 새 비밀번호를 함께 받는다)
          if (signup && v.length === 6 && !submitting) void verify(v);
        }}
        autoFocus
      />
      {!signup && passwordFields('새 비밀번호')}
      {error && <GateError message={error} />}
      <button type="submit" className="btn acc btn-login" data-btn={signup ? 'signup-verify' : 'reset-verify'} disabled={submitting}>
        {submitting ? '확인 중...' : signup ? '회원가입 및 열람 요청' : '비밀번호 바꾸고 로그인'}
      </button>
      <div className="gate-code-actions">
        <Button variant="link" data-btn="code-resend" disabled={wait > 0 || submitting} onClick={() => void send()}>
          {wait > 0 ? `다시 보내기 (${wait}초)` : '인증번호 다시 보내기'}
        </Button>
        <Button
          variant="link"
          data-btn="code-change-email"
          onClick={() => {
            setSentTo('');
            setError('');
          }}
        >
          이메일 바꾸기
        </Button>
      </div>
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
      <button type="submit" className="btn acc btn-login" data-btn="login-submit" disabled={submitting}>
        {submitting ? '확인 중...' : '로그인'}
      </button>
    </form>
  );
};

interface LoginFormProps {
  /** 로그인에 성공하면 부른다 */
  onDone?: () => void;
}

/**
 * 로그인 폼 — 접속 화면(AccessGate)과 관리자 로그인 모달이 함께 쓴다.
 * 이메일·비밀번호로만 로그인하고(2026-11-18 사용자 결정), 비밀번호를 잊으면 '비밀번호 찾기'에서 메일 인증번호로 새로 정한다.
 * 이 브라우저에서 지난번 로그인한 이메일을 기억해 채워 둔다. 개발 서버에서는 테스트 관리자 버튼도 보인다.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onDone }) => {
  const { loginAsDevAdmin } = useAuth();
  const [lastEmail] = useState(readLastEmail);
  const [resetting, setResetting] = useState(false);
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
      {/* 개발 환경 전용 즉시 로그인 */}
      {import.meta.env.DEV && (
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
      )}
    </>
  );
};
