import React, { useEffect, useState } from 'react';
import { ChartNoAxesCombined, Clock, Layers, Lock, MailCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { SkeletonView } from '../common/SkeletonView';
import { Modal } from '../common/Modal';
import { DevLoginButton, GateError, LoginForm, ProfileFields, SignupForm, SignupSteps } from './LoginForm';
import { currentAccessToken, fetchAccessRole } from '../../lib/access';
import { GuestPreview } from './GuestPreview';

/** 권한 확인이 이보다 오래 걸리면 새로 고침 안내를 띄운다 */
const ACCESS_SLOW_MS = 10 * 1000;

/** 승인 대기 화면이 승인 여부를 다시 묻는 간격 */
const PENDING_POLL_MS = 30 * 1000;

type GateTab = 'login' | 'signup';

interface GateCardProps {
  icon: React.ReactNode;
  title: string;
  desc: React.ReactNode;
  children?: React.ReactNode;
}

/** 접속 카드 안쪽 — 아이콘·제목·설명·폼 */
const GateCardBody: React.FC<GateCardProps> = ({ icon, title, desc, children }) => (
  <>
    <div className="gate-icon">{icon}</div>
    <h2 id="access-gate-title">{title}</h2>
    <p>{desc}</p>
    {children}
  </>
);

/** 접속 화면 왼쪽 서비스 소개 — 처음 온 사람이 무엇을 보는 곳이고 어떻게 들어가는지 알 수 있게 (휴대폰에서는 제목·한 줄 소개만) */
const GateBrand: React.FC = () => (
  <aside className="access-gate-brand">
    <span className="gate-brand-mark" aria-hidden="true">
      <ChartNoAxesCombined size="1.25rem" />
    </span>
    <p className="gate-brand-name">아이티스 광고 인사이트</p>
    <p className="gate-brand-lead">광고 성과·견적·방문 흐름을 한 화면에서 봅니다.</p>
    <ul className="gate-brand-points">
      <li>
        <ShieldCheck size="1rem" aria-hidden="true" />
        관리자가 승인한 계정만 열람
      </li>
      <li>
        <MailCheck size="1rem" aria-hidden="true" />
        이메일 인증을 거친 실제 계정만 가입
      </li>
      <li>
        <Layers size="1rem" aria-hidden="true" />
        한 계정으로 광고 인사이트·애널리틱스
      </li>
    </ul>
    <p className="gate-brand-foot">계정·권한 문의는 마케팅팀으로 연락해 주세요.</p>
  </aside>
);

/** 접속 화면 한 장 — 왼쪽 서비스 소개 + 오른쪽 카드 (카드 안쪽은 로그인 모달과 같은 모양) */
const GateCard: React.FC<GateCardProps> = (props) => (
  <div className="login-backdrop access-gate">
    <div className="access-gate-shell">
      <GateBrand />
      <div className="card login-modal" role="main" aria-labelledby="access-gate-title">
        <GateCardBody {...props} />
      </div>
    </div>
  </div>
);

/** 로그인한 계정으로 승인을 (다시) 요청 — 요청 기록이 없거나 거절·해제된 경우 */
const RequestAgainForm: React.FC = () => {
  const { user, requestAccess } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [company, setCompany] = useState(user?.company || '');
  const [team, setTeam] = useState(user?.team || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await requestAccess(name, company, team);
    setSubmitting(false);
    if (res.error) setError(res.error);
  };

  return (
    <form className="gate-form" onSubmit={handleSubmit}>
      <ProfileFields name={name} company={company} team={team} onName={setName} onCompany={setCompany} onTeam={setTeam} err={!!error} autoFocus />
      {error && <GateError message={error} />}
      <Button variant="primary" type="submit" className="btn-login" data-btn="request-access" disabled={submitting}>
        {submitting ? '보내는 중...' : '승인 요청 보내기'}
      </Button>
    </form>
  );
};

/** 로그아웃·다시 확인 버튼 줄 */
const GateActions: React.FC = () => {
  const { logout, user } = useAuth();
  return (
    <div className="gate-actions">
      {user?.email && <span className="gate-account">{user.email}</span>}
      <Button type="button" data-btn="gate-logout" onClick={() => void logout()}>
        로그아웃
      </Button>
    </div>
  );
};

/**
 * 승인 대기 상태 줄 — 30초마다, 그리고 이 탭으로 돌아올 때 승인 여부를 조용히 묻는다.
 * 승인(또는 거절·해제)되면 그때만 권한을 다시 확인해 화면을 바꾼다 (평소에는 확인 중 화면으로 깜빡이지 않게 직접 묻는다)
 */
const PendingWatch: React.FC = () => {
  const { refreshRole } = useAuth();
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const next = await fetchAccessRole(await currentAccessToken());
      if (!alive) return;
      setCheckedAt(new Date());
      if (next && next !== 'pending') refreshRole();
    };
    const timer = window.setInterval(() => void check(), PENDING_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshRole]);
  const hm = checkedAt.toTimeString().slice(0, 5);
  return (
    <p className="gate-pending" role="status">
      <span className="gate-pending-dot" aria-hidden="true" />
      승인 여부를 자동으로 확인하고 있습니다 · {hm} 확인
    </p>
  );
};

/**
 * 접속 관문 — 관리자 또는 승인된 계정만 대시보드(children)를 연다.
 * 그 밖에는 대시보드를 아예 그리지 않아 데이터 요청도 나가지 않는다 (경쟁사·봇이 데이터를 보지 못하게, 2026-11-18 사용자 결정).
 */
/**
 * 접속 권한 확인 중 — 대시보드 뼈대 위 화면 가운데에 확인 중 카드를 띄운다 (닫을 수 없음).
 * 금방 끝나면 깜빡이지 않게 카드는 잠깐 늦게 나타나고(CSS), 오래 걸리면 새로 고침을 안내한다.
 */
const AccessChecking: React.FC = () => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), ACCESS_SLOW_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="access-loading">
      <div className="access-loading-bar" aria-hidden="true" />
      <SkeletonView title="아이티스 광고 인사이트" />
      <Modal open onClose={() => undefined} dismissible={false} labelledBy="access-checking-title" className="access-checking" backdropClassName="access-checking-backdrop">
        <div className="gate-icon gate-icon-spin">
          <Lock size="1.25rem" aria-hidden="true" />
        </div>
        <h2 id="access-checking-title">접속 권한을 확인하고 있습니다</h2>
        <p role="status">
          {slow ? (
            <>
              평소보다 오래 걸리고 있습니다.
              <br />
              잠시 뒤에도 그대로면 새로 고침해 주세요.
            </>
          ) : (
            <>
              승인된 계정인지 확인하는 중입니다.
              <br />
              잠시만 기다려 주세요.
            </>
          )}
        </p>
        {slow && (
          <Button variant="primary" className="btn-login" data-btn="access-reload" onClick={() => window.location.reload()}>
            새로 고침
          </Button>
        )}
      </Modal>
    </div>
  );
};

export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isSignedIn, role, canView, refreshRole, signupInProgress } = useAuth();
  const [tab, setTab] = useState<GateTab>('login');
  // 회원가입에서 이미 가입된 이메일로 넘어왔을 때 로그인 폼에 미리 채울 값 (바뀔 때마다 폼을 새로 그린다)
  const [loginPreset, setLoginPreset] = useState<{ email: string; reset: boolean; seq: number } | null>(null);

  // 권한을 다시 확인하는 동안에도 이미 보고 있던 화면은 그대로 둔다
  if (canView) return <>{children}</>;

  // 회원가입 도중(이메일 인증은 됐고 정보 입력 전) — 로그인 상태가 됐어도 권한 확인·승인 요청 화면으로 넘기지 않고 가입 폼을 그대로 둔다
  const signingUp = signupInProgress && !canView;

  // 권한 확인 중 — 대부분 승인된 사람이므로 잠금 카드 대신 대시보드 모양 로딩을 보여 준다 (화면이 열릴 때 들썩이지 않게)
  if (loading && !signingUp) {
    return <AccessChecking />;
  }

  // 로그인 전 — 화면 틀은 둘러볼 수 있게 두고, 숫자 자리 위에 로그인 카드를 띄운다 (데이터는 받지 않는다)
  if (!isSignedIn || signingUp) {
    return (
      <GuestPreview app={children} keepOpen={signingUp}>
        <GateCardBody
          icon={<Lock size="1.25rem" aria-hidden="true" />}
          title={tab === 'login' && !signingUp ? '로그인하면 볼 수 있습니다' : '회원가입 및 열람 요청'}
          desc={tab === 'login' && !signingUp ? '승인된 계정만 데이터를 볼 수 있습니다.' : '이메일 인증 → 정보 입력 → 관리자 승인 순서로 진행합니다. 승인되면 데이터를 볼 수 있습니다.'}
        >
          {tab === 'login' && !signingUp ? (
            <LoginForm key={loginPreset?.seq ?? 0} showDevLogin={false} initialEmail={loginPreset?.email} initialResetting={loginPreset?.reset} />
          ) : (
            <SignupForm
              onExistingAccount={(email, next) => {
                setLoginPreset((prev) => ({ email, reset: next === 'reset', seq: (prev?.seq ?? 0) + 1 }));
                setTab('login');
              }}
            />
          )}
          {/* 로그인 버튼 밑 — 회원가입 ↔ 로그인 전환 */}
          {!signingUp && (
          <p className="gate-switch">
            {tab === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
            <Button variant="link" data-btn={tab === 'login' ? 'gate-signup' : 'gate-login'} onClick={() => setTab(tab === 'login' ? 'signup' : 'login')}>
              {tab === 'login' ? '회원가입' : '로그인'}
            </Button>
          </p>
          )}
          {tab === 'login' && !signingUp && <DevLoginButton />}
        </GateCardBody>
      </GuestPreview>
    );
  }

  if (role === 'pending') {
    return (
      <GateCard
        icon={<Clock size="1.25rem" aria-hidden="true" />}
        title="승인을 기다리고 있습니다"
        desc={
          <>
            관리자가 가입 요청을 확인하고 있습니다.
            <br />
            승인되면 이 화면이 자동으로 열립니다.
          </>
        }
      >
        <SignupSteps current={2} />
        <PendingWatch />
        <GateActions />
      </GateCard>
    );
  }

  if (role === null) {
    return (
      <GateCard icon={<ShieldOff size="1.25rem" aria-hidden="true" />} title="권한을 확인하지 못했습니다" desc="잠시 뒤 다시 시도해 주세요.">
        <Button variant="primary" type="button" className="btn-login" data-btn="access-retry" onClick={refreshRole}>
          다시 시도
        </Button>
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
