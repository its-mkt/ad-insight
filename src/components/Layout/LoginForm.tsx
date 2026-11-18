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

interface EmailCodeFormProps {
  /** login: 가입된 이메일만 · signup: 이름·소속도 받고 처음 쓰는 이메일은 계정을 만든 뒤 열람 승인을 요청 */
  mode: 'login' | 'signup';
  /** 인증번호 확인까지 끝나면 부른다 */
  onDone?: () => void;
}

/**
 * 이메일 인증번호 로그인 (Supabase OTP) — 비밀번호 없이, 메일로 받은 6자리 번호로 로그인한다.
 * 메일함 주인만 번호를 받으므로 실제 이메일만 가입되고, 비밀번호를 잊을 일이 없다 (2026-11-18 사용자 결정).
 * 1단계: (이름·소속) 이메일 → 인증번호 보내기, 2단계: 인증번호 입력.
 */
export const EmailCodeForm: React.FC<EmailCodeFormProps> = ({ mode, onDone }) => {
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const signup = mode === 'signup';
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [email, setEmail] = useState('');
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

  const info = signup ? { name, team } : undefined;

  const send = async () => {
    setError('');
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

  const verify = async () => {
    setError('');
    setSubmitting(true);
    const res = await verifyEmailCode(sentTo, code, info);
    setSubmitting(false);
    if (res.error) setError(res.error);
    else onDone?.();
  };

  const err = error ? ' err' : '';

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
        {error && <GateError message={error} />}
        <button type="submit" className="btn acc btn-login" data-btn={signup ? 'signup-send-code' : 'login-send-code'} disabled={submitting}>
          {submitting ? '보내는 중...' : '인증번호 받기'}
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
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        autoFocus
      />
      {error && <GateError message={error} />}
      <button type="submit" className="btn acc btn-login" data-btn={signup ? 'signup-verify' : 'login-verify'} disabled={submitting}>
        {submitting ? '확인 중...' : signup ? '회원가입 및 열람 요청' : '로그인'}
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

interface LoginFormProps {
  /** 로그인에 성공하면 부른다 */
  onDone?: () => void;
}

/** 로그인 폼 — 접속 화면(AccessGate)과 관리자 로그인 모달이 함께 쓴다. 개발 서버에서는 테스트 관리자 버튼도 보인다 */
export const LoginForm: React.FC<LoginFormProps> = ({ onDone }) => {
  const { loginAsDevAdmin } = useAuth();
  return (
    <>
      <EmailCodeForm mode="login" onDone={onDone} />
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
