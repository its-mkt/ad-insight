import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { TextInput } from '../common/TextInput';
import { Field } from '../Layout/AccountSettings';
import { GateError } from '../Layout/LoginForm';
import { editMember } from '../../hooks/useMembers';
import { isOrgName, isPersonName, missingProfileText, splitAffiliation } from '../../lib/authErrors';

export interface MemberEditTarget {
  email: string;
  name: string;
  /** 명단의 소속 ('회사 · 팀') */
  team: string;
}

interface MemberEditModalProps {
  /** 고칠 계정 — null 이면 창을 닫는다 */
  target: MemberEditTarget | null;
  /** 닫기 (취소·저장 모두) */
  onClose: () => void;
}

/**
 * 계정 정보 수정 창 — 소유자·운영자가 계정 관리 표의 관리(톱니) 메뉴에서 연다.
 * 담당자·회사·팀만 고치고 이메일은 로그인·승인 기준이라 바꾸지 않는다. 입력 규칙은 내 계정 설정과 같다
 */
export const MemberEditModal: React.FC<MemberEditModalProps> = ({ target, onClose }) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 열 때마다 그 계정의 지금 값으로 채운다
  useEffect(() => {
    if (!target) return;
    const org = splitAffiliation(target.team || '');
    setName(target.name || '');
    setCompany(org.company);
    setTeam(org.team);
    setError('');
  }, [target]);

  if (!target) return null;
  const org = splitAffiliation(target.team || '');
  const dirty = name.trim() !== (target.name || '') || company.trim() !== org.company || team.trim() !== org.team;
  // 저장에 실패했을 때 비어 있거나 규칙에 맞지 않는 칸만 붉게
  const err = (v: string, ok = isOrgName) => (error && (!v.trim() || !ok(v)) ? ' err' : '');

  const save = async () => {
    const missing = missingProfileText(name, company, team, '담당자');
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    const res = await editMember(target.email, { name, company, team });
    setSaving(false);
    if (res.error) setError(res.error);
    else onClose();
  };

  return (
    <Modal open onClose={() => !saving && onClose()} labelledBy="member-edit-title" className="acct-modal member-edit-modal" dismissible={!saving}>
      <h2 id="member-edit-title">계정 정보 수정</h2>
      <form
        className="gate-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !saving) void save();
        }}
      >
        <Field label="이메일" help="로그인·승인 기준이라 바꿀 수 없습니다.">
          <TextInput className="gate-input" value={target.email} readOnly disabled />
        </Field>
        <Field label="담당자">
          <TextInput className={`gate-input${err(name, isPersonName)}`} name="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="회사">
          <TextInput className={`gate-input${err(company)}`} name="organization" value={company} maxLength={40} placeholder="예: 아이티켓" onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="팀">
          <TextInput className={`gate-input${err(team)}`} name="team" value={team} maxLength={40} placeholder="예: 마케팅팀" onChange={(e) => setTeam(e.target.value)} />
        </Field>
        {error && <GateError message={error} />}
        <div className="member-edit-actions">
          <Button type="button" onClick={onClose} disabled={saving} data-btn="member-edit-cancel">
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty || saving} data-btn="member-edit-save">
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
