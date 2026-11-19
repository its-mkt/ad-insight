import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { transferOwner } from '../../hooks/useMembers';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Notice } from '../common/Notice';
import { TextInput } from '../common/TextInput';
import { Field } from '../Layout/AccountSettings';
import { GateError } from '../Layout/LoginForm';

interface OwnerTransferModalProps {
  /** 소유자 권한을 받을 운영자 — null 이면 창을 닫는다 */
  target: { email: string; name: string } | null;
  /** 닫기 (취소·완료 모두) */
  onClose: () => void;
}

/** 넘기기 단계 — 안내 → 받는 사람 이메일 다시 입력 → 내 비밀번호 확인 */
type Step = 'notice' | 'confirm' | 'password';

/**
 * 소유자 권한 넘기기 창 — 되돌리기 어려운 동작이라 세 단계를 거친다.
 * 웹앱도 소유자인지·받는 사람이 승인된 운영자인지·10분 안에 비밀번호로 다시 로그인했는지 한 번 더 확인한다
 */
export const OwnerTransferModal: React.FC<OwnerTransferModalProps> = ({ target, onClose }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('notice');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 다른 사람을 고르면 처음 단계부터
  useEffect(() => {
    setStep('notice');
    setConfirm('');
    setPassword('');
    setError('');
  }, [target?.email]);

  if (!target) return null;
  const who = target.name ? `${target.name} 님(${target.email})` : target.email;
  const confirmOk = confirm.trim().toLowerCase() === target.email.toLowerCase();

  const submit = async () => {
    setBusy(true);
    setError('');
    const res = await transferOwner(target.email, confirm, password, user);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      if (res.step) setStep(res.step);
      return;
    }
    onClose();
  };

  return (
    <Modal open onClose={() => !busy && onClose()} labelledBy="owner-transfer-title" className="owner-transfer-modal" dismissible={!busy}>
      <h2 id="owner-transfer-title">소유자 권한 넘기기</h2>
      <form
        className="gate-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'notice') setStep('confirm');
          else if (step === 'confirm' && confirmOk) setStep('password');
          else if (step === 'password' && password && !busy) void submit();
        }}
      >
        {step === 'notice' && (
          <>
            <p>{who}에게 소유자 권한을 넘깁니다.</p>
            <Notice tone="warn">
              넘기면 나는 바로 운영자가 되어 견적 원본 관리·등급 변경·계정 삭제를 할 수 없습니다. 내가 다시 되돌릴 수 없고, 새 소유자만 돌려줄 수 있습니다.
              화면 안의 권한만 넘어가며 권한 시트·웹앱·Supabase 의 실제 소유권은 그대로입니다.
            </Notice>
            <Button type="submit" variant="primary" className="btn-login" data-btn="owner-transfer-next">
              계속
            </Button>
          </>
        )}
        {step === 'confirm' && (
          <>
            <Field label="받는 사람 이메일" help={`확인을 위해 ${target.email} 을 그대로 입력해 주세요.`}>
              <TextInput className="gate-input" name="owner-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
            </Field>
            <Button type="submit" variant="primary" className="btn-login" data-btn="owner-transfer-confirm" disabled={!confirmOk}>
              다음
            </Button>
          </>
        )}
        {step === 'password' && (
          <>
            <Field label="내 비밀번호" help="본인 확인을 위해 지금 로그인한 계정의 비밀번호를 입력해 주세요.">
              <TextInput className="gate-input" type="password" name="current-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            {error && <GateError message={error} />}
            <Button type="submit" variant="primary" className="btn-login" data-btn="owner-transfer-submit" disabled={!password || busy}>
              {busy ? '넘기는 중' : '소유자 권한 넘기기'}
            </Button>
          </>
        )}
      </form>
    </Modal>
  );
};
