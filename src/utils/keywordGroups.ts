import type { CampaignKeywordBucket, KeywordGroup, KeywordRow } from '../types/dashboard';

const sumClk = (list: KeywordRow[]) => list.reduce((a, k) => a + k.clk, 0);

/** 키워드 행을 광고그룹별로 묶는다 (광고비 큰 순, 같으면 클릭 많은 순) */
export function groupKeywordRows(rows: KeywordRow[]): KeywordGroup[] {
  const groups: Record<string, KeywordGroup> = {};
  rows.forEach((k) => {
    const key = [k.media, k.campaign, k.adgroup].join('\u0001');
    if (!groups[key]) {
      groups[key] = { media: k.media, campaign: k.campaign, adgroup: k.adgroup, cost: 0, list: [] };
    }
    groups[key].list.push(k);
    groups[key].cost += k.cost;
  });
  return Object.values(groups).sort((a, b) => b.cost - a.cost || sumClk(b.list) - sumClk(a.list));
}

/** 광고그룹을 캠페인 이름 단위로 묶는다 (같은 이름은 Google·Naver 합산), 광고비 큰 순 */
export function campaignBuckets(groups: KeywordGroup[]): CampaignKeywordBucket[] {
  const map: Record<string, CampaignKeywordBucket> = {};
  groups.forEach((g) => {
    const key = g.campaign.trim();
    if (!map[key]) map[key] = { medias: [], campaign: key, cost: 0, groups: [] };
    if (!map[key].medias.includes(g.media)) {
      map[key].medias.push(g.media);
      map[key].medias.sort();
    }
    map[key].groups.push(g);
    map[key].cost += g.cost;
  });
  return Object.values(map).sort((a, b) => b.cost - a.cost);
}

/** 이름 비교용 — 대소문자·공백 무시 (네이버 캠페인 이름이 "DELL서버" → "Dell 서버" 처럼 바뀌어도 같은 광고그룹으로 잇는다) */
const nameKey = (r: { media: string; campaign: string; adgroup: string }) =>
  [r.media, r.campaign, r.adgroup].map((s) => String(s ?? '').toLowerCase().replace(/\s+/g, '')).join('\u0001');

/**
 * 키워드 그룹에 광고그룹 실적(spend)을 붙인다 — 그룹 줄이 키워드 합이 아니라 광고그룹 전체 실적이 되어 다른 화면의 광고비와 같아지고,
 * 키워드에 잡히지 않은 몫은 표에서 "등록 키워드 외 실적" 줄로 보인다.
 * spend 는 호출하는 쪽에서 기간·매체·SA/DA 를 이미 거른 행이다. addMissing 이면 키워드가 하나도 없는 광고그룹도 넣는다.
 */
export function withGroupTotals(
  groups: KeywordGroup[],
  spend: { media: string; campaign: string; adgroup: string; cost: number; imp: number; clk: number; conv: number }[],
  addMissing = false
): KeywordGroup[] {
  const sums = new Map<string, { media: string; campaign: string; adgroup: string; cost: number; imp: number; clk: number; conv: number }>();
  spend.forEach((r) => {
    const k = nameKey(r);
    const cur = sums.get(k);
    if (cur) {
      cur.cost += r.cost;
      cur.imp += r.imp;
      cur.clk += r.clk;
      cur.conv += r.conv;
    } else {
      sums.set(k, { media: r.media, campaign: r.campaign, adgroup: r.adgroup, cost: r.cost, imp: r.imp, clk: r.clk, conv: r.conv });
    }
  });
  const used = new Set<string>();
  const out = groups.map((g) => {
    const k = nameKey(g);
    const s = sums.get(k);
    if (!s) return g;
    used.add(k);
    return { ...g, cost: s.cost, totals: { imp: s.imp, clk: s.clk, conv: s.conv } };
  });
  if (addMissing) {
    sums.forEach((s, k) => {
      if (used.has(k) || (!s.cost && !s.imp)) return;
      out.push({ media: s.media, campaign: s.campaign, adgroup: s.adgroup, cost: s.cost, list: [], totals: { imp: s.imp, clk: s.clk, conv: s.conv } });
    });
  }
  return out.sort((a, b) => b.cost - a.cost || sumClk(b.list) - sumClk(a.list));
}
