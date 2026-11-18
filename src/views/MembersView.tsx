import React from 'react';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { ViewNote } from '../components/common/Note';
import { MemberApprovals } from '../components/admin/MemberApprovals';

const TITLE = '계정 관리';

/** 가입 요청 승인·거절과 열람 권한 해제 — 로그인한 관리자에게만 그려진다 (App 에서 막는다) */
export const MembersView: React.FC = () => (
  <View name="members" title={TITLE} className="members-view">
    <ViewHeader title={TITLE} description="광고 인사이트 가입 요청을 승인·거절하고, 승인된 계정의 열람 권한을 해제합니다." status="live" />
    <ViewNote>
      ※ 승인된 계정과 관리자만 데이터를 볼 수 있습니다. 해제하면 그 계정은 바로 데이터를 받지 못하고 접속 화면만 보이며(온코어 데이터는 최대 5분 뒤), 다시 승인할 수 있습니다. 관리자 계정은 이 목록에 나오지 않습니다.
    </ViewNote>
    <MemberApprovals />
  </View>
);
