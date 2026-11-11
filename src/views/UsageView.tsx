import React, { useEffect, useMemo, useState } from 'react';
import type { ViewId } from '../types/dashboard';
import { MultiChart } from '../components/charts/MultiChart';
import { KpiCard, KpiDetailItems, KpiPlaceholder, KpiSection } from '../components/charts/KpiCard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { ViewNote } from '../components/common/Note';
import { Notice } from '../components/common/Notice';
import { SegmentedControl, type SegmentOption } from '../components/common/SegmentedControl';
import { SkelTable } from '../components/common/SkeletonView';
import { NumTd } from '../components/common/TableRows';
import { Th } from '../components/common/Th';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { loadUsageStats, USAGE_TRACKING_ON, type UsageDay, type UsageStats } from '../lib/usage';
import { VIEW_TITLES } from '../utils/constants';
import { fromDayKey, toDayKey } from '../utils/dayRange';
import { fmt } from '../utils/format';

const TITLE = '이용 현황';

type PeriodDays = 7 | 30 | 90;
const PERIOD_OPTIONS: SegmentOption<PeriodDays>[] = [
  { value: 7, label: '최근 7일' },
  { value: 30, label: '최근 30일' },
  { value: 90, label: '최근 90일' },
];

type DeviceScope = 'all' | 'staff';
const DEVICE_OPTIONS: SegmentOption<DeviceScope>[] = [
  { value: 'all', label: '전체 기기' },
  { value: 'staff', label: '로그인 기기 제외', title: '한 번이라도 로그인했던 기기(관리자)를 빼고 봅니다' },
];

const addDays = (key: string, n: number) => {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
};

/** from~to 의 날짜 목록 */
const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** 초 → "1시간 5분" · "12분 30초" · "40초" */
const durationText = (sec: number) => {
  const s = Math.round(sec);
  if (s <= 0) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
  if (m) return s % 60 && m < 10 ? `${m}분 ${s % 60}초` : `${m}분`;
  return `${s}초`;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (key: string) => `${+key.slice(5, 7)}/${+key.slice(8, 10)}`;
const dayWithWeekday = (key: string) => `${key.slice(2).replace(/-/g, '.')} (${WEEKDAYS[fromDayKey(key).getDay()]})`;

const viewTitle = (id: string) => VIEW_TITLES[id as ViewId] ?? id;

const sum = (rows: UsageDay[], k: 'visits' | 'pageviews' | 'seconds') => rows.reduce((a, r) => a + r[k], 0);

type Loaded = { cur: UsageStats; prev: UsageStats } | { error: string; setupNeeded: boolean } | null;

/** 직원 이용 현황 — 방문(기기당 하루 1회)·페이지뷰·체류시간. 로그인한 관리자만 본다 */
export const UsageView: React.FC = () => {
  const [days, setDays] = useState<PeriodDays>(30);
  const [scope, setScope] = useState<DeviceScope>('all');
  const [loaded, setLoaded] = useState<Loaded>(null);

  const today = toDayKey(new Date());
  const from = addDays(today, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    const exclude = scope === 'staff';
    Promise.all([loadUsageStats(from, today, exclude), loadUsageStats(prevFrom, prevTo, exclude)]).then(([cur, prev]) => {
      if (!alive) return;
      if (!cur.ok) setLoaded({ error: cur.message, setupNeeded: cur.setupNeeded });
      else if (!prev.ok) setLoaded({ error: prev.message, setupNeeded: prev.setupNeeded });
      else setLoaded({ cur: cur.stats, prev: prev.stats });
    });
    return () => {
      alive = false;
    };
  }, [from, today, prevFrom, prevTo, scope]);

  // 기록이 없는 날도 0 으로 채운다
  const daily = useMemo(() => {
    if (!loaded || !('cur' in loaded)) return [];
    const byDate = new Map(loaded.cur.daily.map((d) => [d.date, d]));
    return daysBetween(from, today).map((date) => byDate.get(date) ?? { date, visits: 0, pageviews: 0, seconds: 0 });
  }, [loaded, from, today]);

  const cmpLabel = `직전 ${days}일 대비`;

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <>
        <KpiSection>
          {['방문', '방문 기기', '페이지뷰', '평균 체류시간'].map((l) => (
            <KpiPlaceholder key={l} label={l} message="불러오는 중…" />
          ))}
        </KpiSection>
        <Card name="usage-loading">
          <SkelTable rows={6} />
        </Card>
      </>
    );
  } else if ('error' in loaded) {
    body = loaded.setupNeeded ? (
      <Notice tone="warn">
        이용 현황 테이블이 아직 없습니다. Supabase SQL Editor 에서 <code>supabase/usage.sql</code> 을 실행하면 그때부터 기록이 쌓입니다.
      </Notice>
    ) : (
      <Notice tone="warn">이용 현황을 불러오지 못했습니다 ({loaded.error})</Notice>
    );
  } else {
    const { cur, prev } = loaded;
    const visits = sum(cur.daily, 'visits');
    const pageviews = sum(cur.daily, 'pageviews');
    const seconds = sum(cur.daily, 'seconds');
    const prevVisits = sum(prev.daily, 'visits');
    const prevPageviews = sum(prev.daily, 'pageviews');
    const prevSeconds = sum(prev.daily, 'seconds');
    // 직전 기간이 수집 시작 전이면 비교하지 않는다
    const hasPrev = !!cur.since && cur.since <= prevTo;
    const avgSec = visits ? seconds / visits : 0;
    const prevAvgSec = prevVisits ? prevSeconds / prevVisits : 0;
    const activeDays = daily.filter((d) => d.visits > 0).length;

    body = (
      <>
        <KpiSection id="usage-kpis">
          <KpiCard
            label="방문"
            value={`${fmt(visits)}회`}
            cur={visits}
            prev={hasPrev ? prevVisits : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['하루 평균', `${(visits / days).toFixed(1)}회`], ['이용한 날', `${activeDays}일`]]} />}
          />
          <KpiCard
            label="방문 기기"
            value={`${fmt(cur.devices)}대`}
            cur={cur.devices}
            prev={hasPrev ? prev.devices : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['접속 IP', `${fmt(cur.ips)}개`]]} />}
          />
          <KpiCard
            label="페이지뷰"
            value={`${fmt(pageviews)}회`}
            cur={pageviews}
            prev={hasPrev ? prevPageviews : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['방문당', visits ? `${(pageviews / visits).toFixed(1)}회` : '–']]} />}
          />
          <KpiCard
            label="평균 체류시간"
            value={durationText(avgSec)}
            cur={avgSec || null}
            prev={hasPrev && prevAvgSec ? prevAvgSec : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['총 체류', durationText(seconds)]]} />}
          />
        </KpiSection>

        <MultiChart
          id="chUsage"
          title="일별 방문 · 페이지뷰"
          labels={daily.map((d) => dayLabel(d.date))}
          series={
            visits || pageviews
              ? [
                  { k: '방문', c: '--c-it', v: daily.map((d) => d.visits) },
                  { k: '페이지뷰', c: '--c-g', v: daily.map((d) => d.pageviews) },
                ]
              : []
          }
          unit="회"
          emptyMessage="이 기간에 기록된 방문이 없습니다"
        />

        <Card name="usage-views" id="usage-views" tableWrap title="화면별 이용" subtitle="(페이지뷰 많은 순)">
          {cur.views.length ? (
            <table className="stk usage-table">
              <colgroup>
                <col />
                <col className="col-us-count" />
                <col className="col-us-count" />
                <col className="col-us-duration" />
                <col className="col-us-duration" />
              </colgroup>
              <thead>
                <tr>
                  <Th>화면</Th>
                  <Th className="n" tip="방문|그 화면을 연 기기 수를 날마다 더한 값 (같은 기기는 하루 1회)">방문</Th>
                  <Th className="n">페이지뷰</Th>
                  <Th className="n">총 체류시간</Th>
                  <Th className="n" tip="평균 체류|총 체류시간 ÷ 페이지뷰">평균 체류</Th>
                </tr>
              </thead>
              <tbody>
                {cur.views.map((v) => (
                  <tr key={v.view}>
                    <td>{viewTitle(v.view)}</td>
                    <NumTd value={v.visits} unit="회" />
                    <NumTd value={v.pageviews} unit="회" />
                    <NumTd>{durationText(v.seconds)}</NumTd>
                    <NumTd>{v.pageviews ? durationText(v.seconds / v.pageviews) : '–'}</NumTd>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="이 기간에 기록된 화면 이용이 없습니다." />
          )}
        </Card>

        <Card name="usage-daily" id="usage-daily" tableWrap title="일별 이용" subtitle="(최근 날짜부터)">
          <table className="stk usage-table">
            <colgroup>
              <col />
              <col className="col-us-count" />
              <col className="col-us-count" />
              <col className="col-us-duration" />
              <col className="col-us-duration" />
            </colgroup>
            <thead>
              <tr>
                <Th>날짜</Th>
                <Th className="n" tip="방문|그날 접속한 기기 수 (같은 기기는 하루 1회)">방문</Th>
                <Th className="n">페이지뷰</Th>
                <Th className="n">체류시간</Th>
                <Th className="n" tip="방문당 체류|체류시간 ÷ 방문">방문당 체류</Th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{dayWithWeekday(d.date)}</td>
                  <NumTd value={d.visits || null} unit="회" />
                  <NumTd value={d.pageviews || null} unit="회" />
                  <NumTd>{durationText(d.seconds)}</NumTd>
                  <NumTd>{d.visits ? durationText(d.seconds / d.visits) : '–'}</NumTd>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  const since = loaded && 'cur' in loaded ? loaded.cur.since : null;

  return (
    <View name="usage" title={TITLE}>
      <ViewHeader title={TITLE} description="직원들이 광고 인사이트를 얼마나 자주, 얼마나 오래 보는지 보여 줍니다." status="live" />
      <ViewNote>
        ※ 방문은 같은 기기(브라우저)에서 하루(한국 시간)에 여러 번 열어도 1회로 셉니다. 체류시간은 탭이 보이는 동안만 재고, 5분 넘게 조작이 없으면
        뺍니다. 개발 서버(localhost) 접속은 기록하지 않습니다.{since && ` 수집 시작 ${since.replace(/-/g, '.')}.`}
        {!USAGE_TRACKING_ON && ' (지금 창은 개발 환경이라 기록되지 않습니다)'}
      </ViewNote>
      <div className="usage-tools">
        <SegmentedControl<PeriodDays> id="seg-usage-period" options={PERIOD_OPTIONS} value={days} onChange={setDays} />
        <SegmentedControl<DeviceScope> id="seg-usage-scope" options={DEVICE_OPTIONS} value={scope} onChange={setScope} />
      </div>
      {body}
    </View>
  );
};
