import React from 'react';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { ViewNote } from '../components/common/Note';
import { MemberApprovals } from '../components/admin/MemberApprovals';

const TITLE = '계정 관리';

/** 가입 요청 승인·거절과 열람 권한 해제 — 최고 관리자·관리자에게만 그려진다 (App 에서 막는다) */
export const MembersView: React.FC = () => (
  <View name="members" title={TITLE} className="members-view">
    <ViewHeader title={TITLE} description="광고 인사이트 가입 요청을 승인·거절하고, 승인된 계정의 등급(뷰어·운영자)과 열람 권한을 관리합니다." status="live" />
    <ViewNote>
      ※ 승인된 계정만 데이터를 볼 수 있습니다. 등급: 뷰어(대시보드) · 운영자(+원문 데이터·계정 승인·이용 현황·데이터 연결) · 소유자(전부, 등급 변경·삭제). 해제하면 바로 접속 화면만 보이고(온코어는 최대 5분 뒤) 다시 승인할 수 있습니다. 소유자는 맨 위에 표시되며 이 화면에서 바꿀 수 없습니다.
    </ViewNote>
    <MemberApprovals />
  </View>
);
