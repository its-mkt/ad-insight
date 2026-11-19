import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Trash2 } from 'lucide-react';
import { useAuth, type AccountResult } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { Muted } from '../common/Muted';
import { Notice } from '../common/Notice';
import { SegmentedControl } from '../common/SegmentedControl';
import { TextInput } from '../common/TextInput';
import { GateError } from './LoginForm';
import { isOrgName, isPersonName } from '../../lib/authErrors';

/** 설정 창 탭 — 기본 정보 · 비밀번호 */
type AccountTab = 'profile' | 'password';

/** 고르기 전에 거르는 사진 크기 (올릴 때는 256px 로 줄인다) */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** 저장 결과 줄 — 실패는 붉은 안내, 경고는 주황 박스, 성공은 초록 박스 */
const ResultLine: React.FC<{ result: AccountResult | null; okText: string }> = ({ result, okText }) => {
  if (!result) return null;
  if (result.error) return <GateError message={result.error} />;
  return <Notice tone={result.warning ? 'warn' : 'ok'}>{result.warning || okText}</Notice>;
};

/** 이름표 + 입력칸 한 줄 */
export const Field: React.FC<{ label: string; help?: string; children: React.ReactNode }> = ({ label, help, children }) => (
  <label className="acct-field">
    <span className="acct-label">{label}</span>
    {children}
    {help && <Muted small>{help}</Muted>}
  </label>
);

/** 기본 정보 — 이름·회사·팀 (이메일은 승인 기준이라 바꾸지 않는다) */
const ProfilePanel: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [company, setCompany] = useState(user?.company || '');
  const [team, setTeam] = useState(user?.team || '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<AccountResult | null>(null);
  const dirty = name.trim() !== (user?.name || '') || company.trim() !== (user?.company || '') || team.trim() !== (user?.team || '');
  // 저장에 실패했을 때 비어 있거나 규칙에 맞지 않는 칸만 붉게 (이름은 isPersonName, 회사·팀은 isOrgName)
  const err = (v: string, ok = isOrgName) => (result?.error && (!v.trim() || !ok(v)) ? ' err' : '');

  const save = async () => {
    setSaving(true);
    setResult(await updateProfile({ name, company, team }));
    setSaving(false);
  };

  return (
    <form
      className="gate-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !saving) void save();
      }}
    >
      <Field label="이메일" help="로그인·승인 기준이라 바꿀 수 없습니다. 바꿔야 하면 관리자에게 요청해 주세요.">
        <TextInput className="gate-input" value={user?.email || ''} readOnly disabled />
      </Field>
      <Field label="담당자">
        <TextInput className={`gate-input${err(name, isPersonName)}`} name="name" autoComplete="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="회사">
        <TextInput className={`gate-input${err(company)}`} name="organization" autoComplete="organization" value={company} maxLength={40} placeholder="예: 아이티켓" onChange={(e) => setCompany(e.target.value)} />
      </Field>
      <Field label="팀">
        <TextInput className={`gate-input${err(team)}`} name="team" value={team} maxLength={40} placeholder="예: 마케팅팀" onChange={(e) => setTeam(e.target.value)} />
      </Field>
      <ResultLine result={result} okText="저장했습니다. 관리자 명단에도 반영했습니다." />
      <Button type="submit" variant="primary" className="btn-login" data-btn="account-save-profile" disabled={!dirty || saving}>
        {saving ? '저장하는 중' : '저장'}
      </Button>
    </form>
  );
};

/** 비밀번호 변경 — 현재 비밀번호 확인 후 새 비밀번호 */
const PasswordPanel: React.FC = () => {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<AccountResult | null>(null);
  const err = result?.error ? ' err' : '';

  const save = async () => {
    if (next !== next2) {
      setResult({ error: '새 비밀번호와 확인이 서로 다릅니다.' });
      return;
    }
    setSaving(true);
    const r = await changePassword(current, next);
    setSaving(false);
    setResult(r);
    if (!r.error) {
      setCurrent('');
      setNext('');
      setNext2('');
    }
  };

  return (
    <form
      className="gate-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void save();
      }}
    >
      <Field label="현재 비밀번호">
        <TextInput className={`gate-input${err}`} type="password" name="current-password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="새 비밀번호" help="6자 이상">
        <TextInput className={`gate-input${err}`} type="password" name="new-password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="새 비밀번호 확인">
        <TextInput className={`gate-input${err}`} type="password" name="new-password2" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} />
      </Field>
      <ResultLine result={result} okText="비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 씁니다." />
      <Button type="submit" variant="primary" className="btn-login" data-btn="account-save-password" disabled={saving || !current || !next || !next2}>
        {saving ? '바꾸는 중' : '비밀번호 바꾸기'}
      </Button>
    </form>
  );
};

/** 위쪽 — 프로필 사진(바꾸기·지우기) + 제목·이메일 */
const AccountHead: React.FC<{ roleLabel: string }> = ({ roleLabel }) => {
  const { user, updateAvatar } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AccountResult | null>(null);

  const run = async (file: Blob | null) => {
    if (file && file.size > MAX_PHOTO_BYTES) {
      setResult({ error: '10MB 이하 사진을 골라 주세요.' });
      return;
    }
    setBusy(true);
    setResult(await updateAvatar(file));
    setBusy(false);
  };

  return (
    <>
      <div className="acct-head">
        <Avatar src={user?.avatarUrl} name={user?.name || user?.email} size="xl" as="div" />
        <div className="acct-head-info">
          <h2 id="account-settings-title">내 계정 설정</h2>
          <Muted small>
            {user?.email} · {roleLabel}
          </Muted>
          <div className="acct-photo-actions">
            <Button size="xs" icon={Camera} data-btn="account-photo" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '올리는 중' : user?.avatarUrl ? '사진 바꾸기' : '사진 올리기'}
            </Button>
            {user?.avatarUrl && (
              <Button size="xs" icon={Trash2} data-btn="account-photo-remove" disabled={busy} onClick={() => void run(null)}>
                지우기
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // 같은 파일을 다시 골라도 바뀌게
              if (f) void run(f);
            }}
          />
        </div>
      </div>
      {result?.error && <GateError message={result.error} />}
    </>
  );
};

interface AccountSettingsProps {
  open: boolean;
  onClose: () => void;
  /** 프로필 메뉴와 같은 권한 이름 (관리자·열람) */
  roleLabel: string;
}

/** 내 계정 설정 창 — 프로필 사진·이름·회사·팀, 비밀번호. 헤더 아래 쌓임에 갇히지 않게 body 에 띄운다 */
export const AccountSettings: React.FC<AccountSettingsProps> = ({ open, onClose, roleLabel }) => {
  const [tab, setTab] = useState<AccountTab>('profile');
  // 다시 열면 첫 탭(기본 정보)부터
  useEffect(() => {
    if (open) setTab('profile');
  }, [open]);

  if (!open) return null;
  return createPortal(
    <Modal open={open} onClose={onClose} labelledBy="account-settings-title" className="acct-modal">
      <AccountHead roleLabel={roleLabel} />
      <SegmentedControl<AccountTab>
        options={[
          { value: 'profile', label: '기본 정보' },
          { value: 'password', label: '비밀번호' },
        ]}
        value={tab}
        onChange={setTab}
        dataKey="account-tab"
      />
      {tab === 'profile' ? <ProfilePanel /> : <PasswordPanel />}
    </Modal>,
    document.body
  );
};
