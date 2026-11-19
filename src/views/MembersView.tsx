import React from 'react';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { ViewNote } from '../components/common/Note';
import { MemberApprovals } from '../components/admin/MemberApprovals';
import { OwnerCard } from '../components/admin/OwnerCard';

const TITLE = '계정 관리';

/** 가입 요청 승인·거절과 열람 권한 해제 — 최고 관리자·관리자에게만 그려진다 (App 에서 막는다) */
export const MembersView: React.FC = () => (
  <View name="members" title={TITLE} className="members-view">
    <ViewHeader title={TITLE} description="광고 인사이트 가입 요청을 승인·거절하고, 승인된 계정의 등급(뷰어·운영자)과 열람 권한을 관리합니다." status="live" />
    <ViewNote>
      ※ 뷰어 대시보드 · 운영자 +원문 데이터·계정 승인·이용 현황 · 소유자 전체 권한
    </ViewNote>
    <OwnerCard />
    <MemberApprovals />
  </View>
);
