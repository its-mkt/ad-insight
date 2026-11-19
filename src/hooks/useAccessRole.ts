import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { type AccessRole, currentAccessToken, fetchAccessRole, prefetchDashboardData } from '../lib/access';
import { readRoleCache, writeRoleCache } from '../lib/roleCache';

/**
 * 계정이 바뀌거나 다시 확인을 요청하면 열람 권한을 웹앱에 묻는다 (토큰 갱신처럼 계정이 그대로면 묻지 않는다).
 * 웹앱 확인은 2~4초 걸리므로, 이 계정이 최근에 받은 권한이 있으면 그 권한으로 바로 화면을 열고 뒤에서 다시 확인한다.
 * 데이터는 웹앱이 토큰으로 따로 막으므로 기억한 권한이 틀려도 데이터가 새지 않는다 (해제되면 다시 확인 후 잠김)
 * @param sessionLoading 저장된 로그인을 확인하는 중이면 묻지 않고 기다린다
 * @param userKey 계정 키 ('' 비로그인 · 'uid|' 실제 계정 · 'uid|dev' 개발용 테스트 계정)
 * @param roleTick 바뀔 때마다 다시 묻는다 (refreshRole)
 */
export function useAccessRole(sessionLoading: boolean, userKey: string, roleTick: number): { role: AccessRole | null; roleLoading: boolean } {
  const [role, setRole] = useState<AccessRole | null>(null);
  const [roleLoading, setRoleLoading] = useState<boolean>(true);
  // 데이터 요청을 미리 보낸 계정 — 계정마다 첫 확인 때 한 번만 (승인 대기 화면의 30초 재확인마다 보내지 않게)
  const prefetchedFor = useRef('');

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    if (!userKey) {
      setRole('guest');
      setRoleLoading(false);
      return;
    }
    if (userKey.endsWith('|dev')) {
      setRole('admin');
      setRoleLoading(false);
      return;
    }
    const uid = userKey.split('|')[0];
    const remembered = readRoleCache(uid);
    if (remembered) {
      setRole(remembered);
      setRoleLoading(false);
    } else setRoleLoading(true);
    currentAccessToken()
      .then((token) => {
        // 기억한 권한이 없어 확인을 기다리는 동안 데이터 요청도 함께 출발시킨다 (확인 2~4초 + 데이터 5~7초가 겹치게)
        if (!remembered && prefetchedFor.current !== uid) {
          prefetchedFor.current = uid;
          prefetchDashboardData(token);
        }
        return fetchAccessRole(token);
      })
      .then((next) => {
        if (!alive) return;
        // 만료된 로그인은 지우고 로그인 화면으로 (setTimeout: 인증 콜백 안에서 Supabase 를 다시 부르면 멈출 수 있다)
        if (next === 'invalid') setTimeout(() => supabase.auth.signOut(), 0);
        // 확인에 실패(null)했는데 기억한 권한이 있으면 그대로 둔다 — 웹앱 일시 장애로 잠기지 않게
        if (next === null && remembered) return;
        setRole(next);
        writeRoleCache(uid, next);
      })
      .finally(() => alive && setRoleLoading(false));
    return () => {
      alive = false;
    };
  }, [sessionLoading, userKey, roleTick]);

  return { role, roleLoading };
}
