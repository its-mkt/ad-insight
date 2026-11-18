import React, { useState } from 'react';
import { TriangleAlert, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput } from '../common/TextInput';

interface LoginFormProps {
  /** 로그인에 성공하면 부른다 */
  onDone?: () => void;
}

/** 입력칸 아래 빨간 오류 한 줄 — 로그인·가입 폼이 함께 쓴다 */
export const GateError: React.FC<{ message: string }> = ({ message }) => (
  <div className="gate-error" role="alert">
    <TriangleAlert size="0.75rem" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

/**
 * 이메일·비밀번호 로그인 폼 (Supabase Auth) — 접속 화면(AccessGate)과 관리자 로그인 모달이 함께 쓴다.
 * 예전 관리자 계정처럼 gmail 은 아이디만 넣어도 된다.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onDone }) => {
  const { loginWithPassword, loginAsDevAdmin } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await loginWithPassword(loginId, password);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
    } else {
      setPassword('');
      onDone?.();
    }
  };

  return (
    <>
      <form className="gate-form" onSubmit={handleSubmit}>
        <TextInput
          className={`gate-input${error ? ' err' : ''}`}
          name="username"
          autoComplete="username"
          placeholder="이메일"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoFocus
        />
        <TextInput
          className={`gate-input${error ? ' err' : ''}`}
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <GateError message={error} />}
        <button type="submit" className="btn acc btn-login" data-btn="login-submit" disabled={submitting}>
          {submitting ? '확인 중...' : '로그인'}
        </button>
      </form>

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
