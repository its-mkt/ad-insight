import React from 'react';
import { KpiSection } from '../charts/KpiCard';

interface SkeletonViewProps {
  /** 화면 제목은 데이터 없이도 알 수 있으므로 그대로 보여 준다 */
  title: string;
  /** dashboard: KPI + 차트 2개 + 표 / table: 표 위주 화면 (키워드 · 데이터 연결) */
  variant?: 'dashboard' | 'table';
  /** 로그인 전 둘러보기 — 불러오는 중이 아니라 가려 둔 자리라 깜빡이지 않고, 읽기 프로그램에도 그렇게 알린다 */
  locked?: boolean;
}

/** 회색 자리표시 막대 (공용 .skel 색·깜빡임) */
export const SkelBar: React.FC<{ w?: string; h?: string; className?: string }> = ({ w, h, className = '' }) => (
  <span className={`skel ${className}`.trim()} style={{ width: w, height: h }} aria-hidden="true" />
);
const Bar = SkelBar;

/** 실제 표 안(tbody)에 넣는 자리표시 행 — widths 는 칸마다 막대 너비 */
export const SkelRows: React.FC<{ rows?: number; widths: string[] }> = ({ rows = 5, widths }) => (
  <>
    {Array.from({ length: rows }, (_, i) => (
      <tr key={i} className="skel-tr" aria-hidden="true">
        {widths.map((w, ci) => (
          <td key={ci}>
            <Bar w={w} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/** 표 모양 자리표시 (표를 아직 그릴 수 없을 때 카드 안에 둔다) */
export const SkelTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="skel-table" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="skel-row">
        <Bar w="24%" />
        <Bar w="12%" />
        <Bar w="12%" />
        <Bar w="12%" />
        <Bar w="16%" />
      </div>
    ))}
  </div>
);

/** KPI 카드 한 칸 자리표시 — 첫 로딩(SkeletonView)과 화면 안에서 값을 받는 동안 같이 쓴다 */
export const SkelKpi: React.FC = () => (
  <div className="kpi skel-kpi">
    <Bar w="55%" h="0.75rem" />
    <Bar w="70%" h="1.5rem" className="skel-kpi-v" />
    <Bar w="40%" h="0.75rem" />
  </div>
);

/** 차트 카드 자리표시 (제목 · 그래프 · 범례 자리) */
export const SkelChartCard: React.FC = () => (
  <div className="card skel-card">
    <Bar w="40%" h="1rem" />
    <Bar h="12rem" className="skel-chart" />
    <Bar w="50%" h="0.75rem" />
  </div>
);

// 순위형 막대 카드 (카테고리별 소진 · 유입 매체 비중 등)
const LIST_WIDTHS = ['90%', '70%', '55%', '40%', '28%', '18%'];
/** 순위형 막대 목록 자리표시 — 카드 안에 둔다 (유입 매체 비중 등) */
export const SkelList: React.FC = () => (
  <>
    {LIST_WIDTHS.map((w) => (
      <div key={w} className="skel-list">
        <Bar w="5.5rem" h="0.75rem" />
        <span className="skel-list-track">
          <Bar w={w} h="1.25rem" />
        </span>
        <Bar w="3rem" h="0.75rem" />
      </div>
    ))}
  </>
);
const ListCard: React.FC = () => (
  <div className="card skel-card">
    <Bar w="40%" h="1rem" />
    <SkelList />
  </div>
);

const TableCard: React.FC<{ rows: number }> = ({ rows }) => (
  <div className="card skel-card">
    <Bar w="30%" h="1rem" />
    <SkelTable rows={rows} />
  </div>
);

/** 첫 데이터가 오기 전(캐시 없음) 실제 화면과 같은 틀로 회색 자리표시를 보여 준다 */
export const SkeletonView: React.FC<SkeletonViewProps> = ({ title, variant = 'dashboard', locked }) => (
  <div className={`view on skel-view${locked ? ' skel-locked' : ''}`} aria-busy={!locked}>
    <span className="sr-only" role="status">
      {locked ? `${title} 데이터는 로그인하면 볼 수 있습니다.` : `${title} 데이터를 불러오는 중입니다.`}
    </span>
    <div className="mod-h" aria-hidden="true">
      <div>
        <h2>{title}</h2>
        <Bar w="18rem" h="0.875rem" className="skel-desc" />
      </div>
    </div>

    <div aria-hidden="true">
      {variant === 'dashboard' && (
        <>
          <KpiSection>
            {Array.from({ length: 4 }, (_, i) => (
              <SkelKpi key={i} />
            ))}
          </KpiSection>
          <div className="grid">
            {Array.from({ length: 2 }, (_, i) => (
              <SkelChartCard key={i} />
            ))}
          </div>
          <div className="grid">
            <ListCard />
            <ListCard />
          </div>
        </>
      )}
      <TableCard rows={variant === 'table' ? 8 : 5} />
    </div>
  </div>
);
