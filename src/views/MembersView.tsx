import React from 'react';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { ViewNote } from '../components/common/Note';
import { MemberApprovals } from '../components/admin/MemberApprovals';

const TITLE = '계정 관리';

/** 가입 요청 승인·거절과 열람 권한 해제 — 최고 관리자·관리자에게만 그려진다 (App 에서 막는다) */
export const MembersView: React.FC = () => (
  <View name="members" title={TITLE} className="members-view">
    <ViewHeader title={TITLE} description="광고 인사이트 가입 요청을 승인·거절하고, 승인된 계정의 등급(일반·관리자)과 열람 권한을 관리합니다." status="live" />
    <ViewNote>
      ※ 승인된 계정만 데이터를 볼 수 있습니다. 등급 — 일반: 대시보드만 · 관리자: 대시보드와 원문 데이터·계정 관리(일반 계정 승인·거절·해제)·이용 현황·데이터 연결 · 최고 관리자: 전부(견적 원본 관리·등급 변경·삭제 포함). 해제하면 그 계정은 바로 데이터를 받지 못하고 접속 화면만 보이며(온코어 데이터는 최대 5분 뒤), 다시 승인할 수 있습니다. 최고 관리자 계정은 이 목록에 나오지 않습니다.
    </ViewNote>
    <MemberApprovals />
  </View>
);
