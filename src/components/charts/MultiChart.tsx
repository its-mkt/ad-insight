import React, { useState } from 'react';
import type { ChartType, SeriesItem } from '../../types/dashboard';
import { axisC, fmt, measureSvgText, niceMax, rem } from '../../utils/format';
import { useElementWidth } from '../../hooks/useElementWidth';
import { SegmentedControl } from '../common/SegmentedControl';
import { EmptyState } from '../common/EmptyState';
import { Legend, LegendItem } from '../common/Legend';

interface MultiChartProps {
  id: string;
  title: React.ReactNode;
  labels: string[];
  series: SeriesItem[];
  unit: string;
  emptyMessage?: string;
  defaultType?: ChartType;
  /** 제목 오른쪽, 차트 종류 버튼 앞에 놓는 도구 (예: 보기 전환) */
  tools?: React.ReactNode;
}

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; title: string }[] = [
  { value: 'line', label: '꺾은선', title: '꺾은선' },
  { value: 'grouped', label: '그룹형', title: '그룹형' },
  { value: 'donut', label: '원형', title: '기간 구성비' },
];

export const MultiChart: React.FC<MultiChartProps> = ({
  id,
  title,
  labels,
  series,
  unit,
  emptyMessage = '표시할 데이터가 없습니다',
  defaultType = 'line',
  tools,
}) => {
  const [chartType, setChartType] = useState<ChartType>(defaultType);
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [hoverSlice, setHoverSlice] = useState<number | null>(null);
  const [hoverPie, setHoverPie] = useState<number | null>(null);
  const { ref: boxRef, width: W } = useElementWidth([series.length, labels.length]);

  const hasData = series.length > 0 && labels.length > 0;
  const r = rem();
  const H = 16 * r;
  const L = 3.5 * r;
  const R = 1.5 * r;
  const T = 1.5 * r;
  const B = 2 * r;
  const pw = Math.max(10, W - L - R);
  const ph = Math.max(10, H - T - B);
  const N = Math.max(1, labels.length);
  const S = Math.max(1, series.length);
  const bw = pw / N;

  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.v[i] || 0), 0));
  const maxSeries = Math.max(1, ...series.flatMap((s) => s.v));
  const max = niceMax(maxSeries);

  const getY = (v: number) => T + ph * (1 - Math.max(0, v || 0) / max);
  const getX = (i: number) => L + (i + 0.5) * bw;

  const handleSlicePointerMove = (e: React.PointerEvent<SVGRectElement>, idx: number) => {
    setHoverSlice(idx);
    const tip = document.getElementById('tip');
    if (!tip) return;
    const m = labels[idx];
    const total = totals[idx];
    const items = series
      .map((s) => ({ k: s.k, c: s.c, v: s.v[idx] || 0 }))
      .sort((a, b) => b.v - a.v);

    tip.innerHTML = `
      <div class="tip-box">
        <div class="tip-h"><span>${m} 실적</span><b>합계 ${fmt(total)}${unit}</b></div>
        <div class="tip-list">
          ${items
            .map(
              (it) => `
            <div class="tip-row">
              <span><i style="background:var(${it.c})"></i>${it.k}</span>
              <b>${fmt(it.v)}${unit}<small>(${total > 0 ? ((it.v / total) * 100).toFixed(1) : 0}%)</small></b>
            </div>
          `
            )
            .join('')}
        </div>
      </div>`;
    tip.style.opacity = '1';

    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let tx = e.clientX + 14;
    if (tx + tw > window.innerWidth - 16) tx = e.clientX - tw - 14;
    let ty = e.clientY - th / 2;
    if (ty < 12) ty = 12;
    if (ty + th > window.innerHeight - 12) ty = window.innerHeight - th - 12;
    tip.style.left = `${tx}px`;
    tip.style.top = `${ty}px`;
  };

  const handleSlicePointerLeave = () => {
    setHoverSlice(null);
    const tip = document.getElementById('tip');
    if (tip) tip.style.opacity = '0';
  };

  const renderDonutSvg = () => {
    const sums = series.map((s) => s.v.reduce((a, v) => a + (v || 0), 0));
    const sumAll = sums.reduce((a, v) => a + v, 0);
    const total = Math.max(1, sumAll); // 나눗셈용 — 가운데 합계는 실제 합(sumAll)을 보여 준다 (모두 0 이면 '1' 로 보이지 않게)
    const fsName = r * 0.7;
    const fsNameHover = r * 0.82;
    const fsPct = r * 0.75;
    const fsPctHover = r * 0.9;

    // 범례 자리는 가장 긴 이름과 비율이 겹치지 않을 만큼 잡는다 (마우스를 올려 글자가 커져도). 원 자리를 지키도록 최대 58%까지만 쓰고, 넘치는 이름은 말줄임
    const pctEnd = W - R * 0.5;
    const pctW = measureSvgText('100.0%', fsPctHover) * 1.05;
    const nameX = r * 0.88;
    const nameGap = r * 0.75;
    const nameMax = Math.max(r * 3, pctEnd * 0.58 - nameX - nameGap - pctW);
    const nameW = Math.min(nameMax, Math.max(...series.map((s) => measureSvgText(s.k, fsNameHover) * 1.04)));
    const lx = Math.min(W * 0.74, pctEnd - pctW - nameGap - nameW - nameX);
    const fitName = (text: string, fontSize: number, maxW: number) => {
      if (measureSvgText(text, fontSize) <= maxW) return text;
      let cut = text;
      while (cut.length > 1 && measureSvgText(`${cut}…`, fontSize) > maxW) cut = cut.slice(0, -1);
      return `${cut}…`;
    };

    const cx = lx * 0.54;
    const cy = H / 2;
    const ro = Math.min(lx * 0.486, H / 2 - r) * 0.88;
    const ri = ro * 0.58;
    const midR = (ro + ri) / 2;
    const sw = ro - ri;
    const circ = 2 * Math.PI * midR;
    const swBase = sw;
    const swHover = sw * 1.22;
    const swFade = sw * 0.72;

    let cumFrac = 0;
    const circles = series.map((s, si) => {
      const frac = sums[si] / total;
      const startFrac = cumFrac;
      cumFrac += frac;
      if (frac <= 0) return null;
      const dash = Math.max(0, circ * frac - 1.5);
      const curSw = hoverPie === null ? swBase : hoverPie === si ? swHover : swFade;
      return (
        <circle
          key={s.k}
          className="pie-seg"
          cx={cx}
          cy={cy}
          r={midR}
          fill="none"
          stroke={`var(${s.c})`}
          strokeWidth={curSw}
          strokeLinecap="butt"
          strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
          strokeDashoffset={(-(startFrac * circ)).toFixed(2)}
          transform={`rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
          onPointerEnter={() => setHoverPie(si)}
          onPointerLeave={() => setHoverPie(null)}
        />
      );
    });

    const rowH =Math.min((ph * 0.9) / S, 2.2 * r);
    const ly0 = cy - (S / 2 - 0.5) * rowH;

    const hoveredItem = hoverPie !== null ? series[hoverPie] : null;
    const hoveredPct = hoverPie !== null ? ((sums[hoverPie] / total) * 100).toFixed(1) : '';

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="채널별 구성비">
        {circles}
        <text
          className="pie-label"
          x={cx}
          y={cy - r * 0.2}
          textAnchor="middle"
          fill="var(--sub)"
          style={{ fontSize: `${hoverPie !== null ? r * 0.68 : r * 0.72}px` }}
        >
          {hoveredItem ? fitName(hoveredItem.k, r * 0.68, ri * 1.7) : '기간 합산'}
        </text>
        <text
          className="pie-value"
          x={cx}
          y={cy + r * 0.85}
          textAnchor="middle"
          fontWeight={600}
          fill="var(--ink)"
          style={{ fontSize: `${hoverPie !== null ? r * 1.1 : r * 0.95}px` }}
        >
          {hoveredItem ? `${hoveredPct}%` : fmt(sumAll)}
        </text>
        {series.map((s, si) => {
          const pctStr = ((sums[si] / total) * 100).toFixed(1);
          const ly = ly0 + si * rowH;
          const isHovered = hoverPie === si;
          return (
            <React.Fragment key={s.k}>
              <rect
                className="pie-dot"
                x={lx}
                y={ly - r * 0.55}
                width={r * 0.6}
                height={r * 0.6}
                fill={`var(${s.c})`}
                opacity={hoverPie === null || isHovered ? 1 : 0.35}
              />
              <text
                className="pie-leg-name"
                x={lx + nameX}
                y={ly}
                fill="var(--ink2)"
                style={{
                  fontSize: `${isHovered ? fsNameHover : fsName}px`,
                  fontWeight: isHovered ? 700 : 400,
                }}
              >
                <title>{s.k}</title>
                {fitName(s.k, isHovered ? fsNameHover : fsName, nameW)}
              </text>
              <text
                className="pie-leg-pct"
                x={W - R * 0.5}
                y={ly}
                textAnchor="end"
                fill={`var(${s.c})`}
                fontWeight={700}
                style={{ fontSize: `${isHovered ? fsPctHover : fsPct}px` }}
              >
                {pctStr}%
              </text>
            </React.Fragment>
          );
        })}
      </svg>
    );
  };

  const renderCartesianSvg = () => {
    const pad = Math.min(bw * 0.15, 12);
    const usable = bw - pad * 2;
    const subBw = Math.max(3, (usable - (S - 1) * 2) / S);

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} overflow="visible" role="img">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = T + ph * (1 - i / 4);
          return (
            <React.Fragment key={i}>
              <line
                className="g"
                x1={L}
                x2={W - R}
                y1={y}
                y2={y}
                strokeDasharray={i ? '3 3' : undefined}
              />
              <text x={L - 0.5 * r} y={y + 0.25 * r} textAnchor="end">
                {axisC((max * i) / 4)}
              </text>
            </React.Fragment>
          );
        })}

        {chartType === 'line' && (
          <>
            {series.map((s, si) => {
              const pts = labels.map((_, i) => ({ x: getX(i), y: getY(s.v[i]) }));
              const pathD = pts
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(' ');
              const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${(T + ph).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(T + ph).toFixed(1)} Z`;
              const dimmed = hoverSeries !== null && hoverSeries !== si;
              const active = hoverSeries === si;
              return (
                <React.Fragment key={s.k}>
                  <path
                    className={`chart-area s-${si}`}
                    d={areaD}
                    fill={`var(${s.c})`}
                    opacity={dimmed ? 0.02 : 0.08}
                  />
                  <path
                    className={`chart-line s-${si}`}
                    d={pathD}
                    stroke={`var(${s.c})`}
                    style={{
                      opacity: dimmed ? 0.15 : 1,
                      strokeWidth: active ? 3.5 : dimmed ? 1.5 : undefined,
                    }}
                  />
                </React.Fragment>
              );
            })}
            {series.map((s, si) => {
              const dimmed = hoverSeries !== null && hoverSeries !== si;
              return labels.map((_, i) => (
                <circle
                  key={`${s.k}-${i}`}
                  className={`chart-dot s-${si} p-${i}${hoverSlice === i ? ' on' : ''}`}
                  cx={getX(i)}
                  cy={getY(s.v[i])}
                  r={3.5}
                  fill="var(--card)"
                  stroke={`var(${s.c})`}
                  strokeWidth={2.5}
                  style={{ opacity: dimmed ? 0.15 : 1 }}
                />
              ));
            })}
            {labels.map((_, i) => {
              const x = getX(i);
              const pts = series
                .map((s, si) => ({ si, c: s.c, v: s.v[i] || 0, y: getY(s.v[i] || 0) }))
                .filter((pt) => pt.v > 0)
                .sort((a, b) => a.y - b.y);
              let lastY = -999;
              return pts.map((pt) => {
                let ty = pt.y - 7;
                if (ty < T + 8) ty = pt.y + 13;
                if (Math.abs(ty - lastY) < 13) ty = lastY + 13;
                lastY = ty;
                const dimmed = hoverSeries !== null && hoverSeries !== pt.si;
                return (
                  <text
                    key={`val-${pt.si}-${i}`}
                    className={`chart-val s-${pt.si} p-${i}`}
                    x={x}
                    y={ty}
                    fill={`var(${pt.c})`}
                    style={{ opacity: dimmed ? 0.15 : 1 }}
                  >
                    {fmt(pt.v)}
                  </text>
                );
              });
            })}
          </>
        )}

        {chartType === 'grouped' &&
          labels.map((_, i) => {
            let minBy = T + ph;
            const bars = series.map((s, si) => {
              const v = s.v[i] || 0;
              const bx = L + i * bw + pad + si * (subBw + 2);
              const by = getY(v);
              const bh = Math.max(v > 0 ? 2 : 0, T + ph - by);
              if (v > 0 && by < minBy) minBy = by;
              const dimmed = hoverSeries !== null && hoverSeries !== si;
              return (
                <React.Fragment key={`bar-${si}-${i}`}>
                  <rect
                    className={`chart-bar s-${si} p-${i}`}
                    x={bx}
                    y={by}
                    width={subBw}
                    height={bh}
                    fill={`var(${s.c})`}
                    style={{ opacity: dimmed ? 0.15 : 1 }}
                  />
                  {subBw >= 14 && v > 0 && (
                    <text
                      className={`chart-val s-${si} p-${i}`}
                      x={bx + subBw / 2}
                      y={by - 4}
                      fill={`var(${s.c})`}
                      style={{ opacity: dimmed ? 0.15 : 1 }}
                    >
                      {fmt(v)}
                    </text>
                  )}
                </React.Fragment>
              );
            });
            const groupCx = L + (i + 0.5) * bw;
            const groupTopY = Math.max(T + 8, minBy - 4);
            return (
              <React.Fragment key={`grp-${i}`}>
                {bars}
                {subBw < 14 && totals[i] > 0 && (
                  <text className="chart-val" x={groupCx} y={groupTopY} fill="var(--ink2)">
                    {fmt(totals[i])}
                  </text>
                )}
              </React.Fragment>
            );
          })}

        {labels.map((m, i) => (
          <text key={`lbl-${i}`} x={getX(i)} y={H - 0.5 * r} textAnchor="middle">
            {m}
          </text>
        ))}

        {hoverSlice !== null && (
          <line
            className="chart-cursor"
            x1={getX(hoverSlice)}
            x2={getX(hoverSlice)}
            y1={T}
            y2={T + ph}
          />
        )}

        {labels.map((_, i) => (
          <rect
            key={`slice-${i}`}
            className="chart-slice"
            x={L + i * bw}
            y={T}
            width={bw}
            height={ph}
            fill="transparent"
            onPointerMove={(e) => handleSlicePointerMove(e, i)}
            onPointerLeave={handleSlicePointerLeave}
          />
        ))}
      </svg>
    );
  };

  const typeControl = (
    <SegmentedControl<ChartType>
      mini
      dataChart={id}
      options={CHART_TYPE_OPTIONS}
      value={chartType}
      onChange={setChartType}
    />
  );

  return (
    <div className={`card card-chart ${id ? `card-chart-${id}` : ''}`} id={id ? `card-chart-${id}` : undefined} data-card={id || 'chart'}>
      <h3>
        {title}
        {tools ? (
          <div className="h3-tools">
            {tools}
            <span className="h3-tool-sep" />
            {typeControl}
          </div>
        ) : (
          typeControl
        )}
      </h3>
      <div className="ch" id={id} ref={boxRef}>
        {!hasData ? (
          <EmptyState message={emptyMessage} />
        ) : chartType === 'donut' ? (
          renderDonutSvg()
        ) : (
          renderCartesianSvg()
        )}
      </div>
      {hasData && (
        <Legend unit={unit}>
          {series.map((s, si) => (
            <LegendItem
              key={s.k}
              className="leg-item"
              data-si={si}
              color={s.c}
              onMouseEnter={() => setHoverSeries(si)}
              onMouseLeave={() => setHoverSeries(null)}
            >
              {s.k}
            </LegendItem>
          ))}
        </Legend>
      )}
    </div>
  );
};
