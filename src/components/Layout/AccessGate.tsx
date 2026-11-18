import React, { useState } from 'react';
import { Clock, Lock, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TextInput } from '../common/TextInput';
import { Button } from '../common/Button';
import { SkelBar } from '../common/SkeletonView';
import { EmailCodeForm, GateError, LoginForm } from './LoginForm';

type GateTab = 'login' | 'signup';

/** 접속 화면 한 장 — 가운데 카드 (로그인 모달과 같은 모양) */
const GateCard: React.FC<{ icon: React.ReactNode; title: string; desc: React.ReactNode; children?: React.ReactNode }> = ({ icon, title, desc, children }) => (
  <div className="login-backdrop access-gate">
    <div className="card login-modal" role="main" aria-labelledby="access-gate-title">
      <div className="gate-icon">{icon}</div>
      <h2 id="access-gate-title">{title}</h2>
      <p>{desc}</p>
      {children}
    </div>
  </div>
);

/** 이름·소속 입력칸 — 가입 요청과 다시 요청에 함께 쓴다 */
const NameTeamFields: React.FC<{ name: string; team: string; onName: (v: string) => void; onTeam: (v: string) => void; err: boolean }> = ({ name, team, onName, onTeam, err }) => (
  <>
    <TextInput className={`gate-input${err ? ' err' : ''}`} name="name" autoComplete="name" placeholder="이름" value={name} onChange={(e) => onName(e.target.value)} />
    <TextInput className={`gate-input${err ? ' err' : ''}`} name="team" autoComplete="organization" placeholder="소속 (회사·팀)" value={team} onChange={(e) => onTeam(e.target.value)} />
  </>
);

/** 로그인한 계정으로 승인을 (다시) 요청 — 요청 기록이 없거나 거절·해제된 경우 */
const RequestAgainForm: React.FC = () => {
  const { user, requestAccess } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [team, setTeam] = useState(user?.team || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await requestAccess(name, team);
    setSubmitting(false);
    if (res.error) setError(res.error);
  };

  return (
    <form className="gate-form" onSubmit={handleSubmit}>
      <NameTeamFields name={name} team={team} onName={setName} onTeam={setTeam} err={!!error} />
      {error && <GateError message={error} />}
      <button type="submit" className="btn acc btn-login" data-btn="request-access" disabled={submitting}>
        {submitting ? '보내는 중...' : '승인 요청 보내기'}
      </button>
    </form>
  );
};

/** 로그아웃·다시 확인 버튼 줄 */
const GateActions: React.FC<{ recheck?: boolean }> = ({ recheck }) => {
  const { logout, refreshRole, user } = useAuth();
  return (
    <div className="gate-actions">
      {user?.email && <span className="gate-account">{user.email}</span>}
      {recheck && (
        <button type="button" className="btn" data-btn="access-recheck" onClick={refreshRole}>
          승인 여부 다시 확인
        </button>
      )}
      <button type="button" className="btn" data-btn="gate-logout" onClick={() => void logout()}>
        로그아웃
      </button>
    </div>
  );
};

/**
 * 접속 관문 — 관리자 또는 승인된 계정만 대시보드(children)를 연다.
 * 그 밖에는 대시보드를 아예 그리지 않아 데이터 요청도 나가지 않는다 (경쟁사·봇이 데이터를 보지 못하게, 2026-11-18 사용자 결정).
 */
export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isSignedIn, role, canView, refreshRole } = useAuth();
  const [tab, setTab] = useState<GateTab>('login');

  // 권한을 다시 확인하는 동안에도 이미 보고 있던 화면은 그대로 둔다
  if (canView) return <>{children}</>;

  if (loading) {
    return (
      <GateCard icon={<Lock size="1.25rem" aria-hidden="true" />} title="아이티스 광고 인사이트" desc="접속 권한을 확인하고 있습니다.">
        <SkelBar w="100%" h="2.625rem" />
      </GateCard>
    );
  }

  if (!isSignedIn) {
    return (
      <GateCard
        icon={<Lock size="1.25rem" aria-hidden="true" />}
        title={tab === 'login' ? '아이티스 광고 인사이트' : '회원가입 및 열람 요청'}
        desc={tab === 'login' ? '승인된 계정만 볼 수 있습니다.' : '이메일 인증번호로 가입과 함께 관리자에게 열람 승인을 요청합니다. 승인되면 데이터를 볼 수 있습니다.'}
      >
        {tab === 'login' ? <LoginForm /> : <EmailCodeForm mode="signup" />}
        {/* 로그인 버튼 밑 — 회원가입 ↔ 로그인 전환 */}
        <p className="gate-switch">
          {tab === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
          <Button variant="link" data-btn={tab === 'login' ? 'gate-signup' : 'gate-login'} onClick={() => setTab(tab === 'login' ? 'signup' : 'login')}>
            {tab === 'login' ? '회원가입' : '로그인'}
          </Button>
        </p>
      </GateCard>
    );
  }

  if (role === 'pending') {
    return (
      <GateCard icon={<Clock size="1.25rem" aria-hidden="true" />} title="승인을 기다리고 있습니다" desc="관리자가 가입 요청을 확인하고 있습니다. 승인되면 바로 볼 수 있습니다.">
        <GateActions recheck />
      </GateCard>
    );
  }

  if (role === null) {
    return (
      <GateCard icon={<ShieldOff size="1.25rem" aria-hidden="true" />} title="권한을 확인하지 못했습니다" desc="잠시 뒤 다시 시도해 주세요.">
        <button type="button" className="btn acc btn-login" data-btn="access-retry" onClick={refreshRole}>
          다시 시도
        </button>
        <GateActions />
      </GateCard>
    );
  }

  // 요청 기록 없음(none)·거절(rejected)·해제(revoked)
  return (
    <GateCard
      icon={<ShieldOff size="1.25rem" aria-hidden="true" />}
      title={role === 'none' ? '승인 요청이 필요합니다' : '열람 권한이 없습니다'}
      desc={role === 'none' ? '이름과 소속을 적어 관리자에게 승인을 요청해 주세요.' : '관리자가 열람 권한을 승인하지 않았거나 해제했습니다. 필요하면 다시 요청해 주세요.'}
    >
      <RequestAgainForm />
      <GateActions />
    </GateCard>
  );
};
