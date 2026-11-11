import React from 'react';
import type { SyncStatus } from '../../types/dashboard';
import { View } from './View';
import { ViewHeader } from './ViewHeader';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

interface LoginGateProps {
  /** 화면 id (View name) */
  name: string;
  /** 화면 제목 */
  title: string;
  /** 화면 설명 */
  description: string;
  status: SyncStatus;
  /** 가린 이유 한 줄 */
  message: string;
  /** 보조 설명 */
  subMessage?: string;
  /** 로그인 창 열기 */
  onLogin: () => void;
  /** 대신 볼 수 있는 기간으로 옮기는 버튼 글자와 동작 (없으면 버튼을 숨긴다) */
  alt?: { label: string; onClick: () => void };
}

/** 로그인해야 볼 수 있는 기간·화면 자리에 보여 주는 안내 */
export const LoginGate: React.FC<LoginGateProps> = ({ name, title, description, status, message, subMessage, onLogin, alt }) => (
  <View name={name} title={title}>
    <ViewHeader title={title} description={description} status={status} />
    <Card name={`${name}-gate`} id={`${name}-gate`}>
      <EmptyState message={message} subMessage={subMessage} />
      <div className="login-gate-actions">
        {alt && (
          <Button id={`btn-${name}-gate-alt`} data-btn="gate-alt" onClick={alt.onClick}>
            {alt.label}
          </Button>
        )}
        <Button variant="primary" id={`btn-${name}-gate-login`} data-btn="gate-login" onClick={onLogin}>
          로그인
        </Button>
      </div>
    </Card>
  </View>
);
