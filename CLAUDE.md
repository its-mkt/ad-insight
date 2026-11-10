# its-ad-insight 프로젝트 규칙

## UI 컴포넌트 재사용 규칙

화면·표·차트를 만들거나 고칠 때는 **`src/components/common/` 의 공용 컴포넌트를 먼저 쓴다.**
같은 모양의 마크업(`<div className="…">` 직접 작성)을 새로 복사해 넣지 않는다.

### 작업 순서
1. 만들기 전에 아래 표와 `src/components/common/`, `src/components/charts/` 를 먼저 확인한다
2. 맞는 컴포넌트가 있으면 그대로 쓰고, 모자라면 **props 를 추가해 확장**한다 (기존 사용처의 DOM·클래스는 바꾸지 않는다)
3. 없으면 새로 만들되, **같은 마크업이 2곳 이상**에 쓰일 것 같으면 처음부터 `common/` 에 공용으로 만든다
4. 같은 패턴이 2곳 이상 복사돼 있는 걸 발견하면, 하던 작업 범위 안에서 공용 컴포넌트로 치환한다
5. 새 공용 컴포넌트는 props 마다 한 줄 JSDoc(한국어)을 달고, 아래 표에도 추가한다

### 쓸 컴포넌트 (요소 → 컴포넌트)

| 만들려는 것 | 쓸 것 |
|---|---|
| 화면 바깥 틀 (`view on`) | `View` (`name`, `title`) |
| 화면 제목·설명 | `ViewHeader`, 출처 줄 `SecSrc` |
| 화면 위 "※ 기준·집계 방식" 안내 | `ViewNote` |
| 박스 + 제목(+보조 제목) | `Card` (`name`, `title`, `subtitle`, `tableWrap`) |
| KPI 카드 / 묶음 / 데이터 없음 | `KpiCard`, `KpiSection`, `KpiPlaceholder` |
| 증감(▲▼) 표시 | `DeltaSpan`, 카드는 `KpiCard` |
| 막대 목록(카테고리·유입 경로) 증감 칸 | `BarDelta` |
| 견적 접수처 판별·KPI 접수처 건수 / CTR 표기 | `originOf`·`originGroupCounts` (`utils/quoteOrigin`), `ctrText` (`utils/format`) |
| KPI 큰 값 + 작고 흐린 보조 값 / 견적·판매 함께 | `KpiSubValue`, `QuoteSalesValue` (`charts/KpiCard`, 판매 건수는 `salesInMonths`·`salesInRange`) |
| 버튼 / 링크 모양 버튼 | `Button`, `ButtonLink` |
| 새 탭 외부 링크 | `ExtLink` (직접 `target="_blank"` 쓰지 않는다) |
| 광고 API 출처 각주 | `AdApiSource` + `TableFootnote` |
| 탭 / 구간 선택 | `TabButton`, `SegmentedControl` |
| 더보기·접기 | `MoreButton`, `ShowMoreButton` |
| 뱃지 | `StatusBadge`, `MediaPill` |
| 매핑 흐름도 이름표 | `Chip` |
| 흐린 보조 글자 / "(진행 중)" | `Muted`, `PendingTag` |
| 차트 범례 / 기준·비교 범례 | `Legend`+`LegendItem`, `CompareLegend` |
| 표 머리글 (정렬 없음/있음) | `Th`, `SortableTh` |
| 표 숫자 칸 (오른쪽 정렬, 단위, 굵게, 빈 값 `–`) | `NumTd` |
| 표 합계 줄 | `TotalRow` |
| 1차 > 2차 펼침 줄 | `TreeParentRow`, `TreeChildRow`, `childLabelOf` |
| 강조색 그룹 펼침 줄 (키워드 표 광고그룹·구매 제품) | `GroupAccordionRow` (`title`, `icon`, `count`, `open`, `canOpen`, `tone`, `plain`), 하위 줄 `GroupChildRow` |
| 표 펼침 줄 앞 화살표(›) | `AccordionChevron` (`open`, `variant`, `placeholder`) — `ChevronRight` 를 직접 쓰지 않는다 |
| 월별 표 한 줄 / 월 머리글 | `MonthRow`, `MonthHeadCells` |
| 빈 상태 | `EmptyState` (`message`, `subMessage`) |
| 로딩 자리표시 | `SkelBar`, `SkelRows`, `SkelTable`, `SkeletonView` |
| 알림 박스 | `Notice` |
| 표 하단 출처·단위 | `TableFootnote` |
| 드롭다운·월 선택·페이지 | `Dropdown`, `MonthPicker`, `PeriodNav`, `Pagination` |
| 일 선택·기간 선택 달력 | `DatePicker` (`PeriodNav` 의 `onSelectDayRange` 로 연결) |

### 표 열 너비
- 숫자·날짜·유입 경로 칸은 `src/styles/_variables.scss` 의 공통 너비를 쓴다: `--col-date`(날짜) · `--col-count`(건수·수량·노출·클릭·전환) · `--col-rate`(비율) · `--col-unit-price`(CPC·CPA 단가) · `--col-amount`(금액) · `--col-source`(유입 경로)
- 이름 칸은 너비를 주지 않아 남는 폭을 쓰게 하고, 표 `min-width` 는 숫자 칸 합 + 이름 칸 최소 폭으로 잡는다
- 새 종류가 필요하면 표마다 rem 을 적지 말고 토큰을 추가한다

### 금지
- 위 표에 있는 요소를 `className` 만 복사해 인라인으로 다시 만들기
  (예: `<td className="n">…</td>` 대신 `NumTd`, `<div className="empty">` 대신 `EmptyState`)
- 공용 컴포넌트를 고치면서 기존 화면의 렌더 결과(DOM 구조·클래스·문구)를 바꾸기
- 한 화면에서만 쓰는 상태·로직을 `common/` 에 넣기 (공용은 표현만 담당)

### 확인
- 변경 후 `npx tsc -p tsconfig.json --noEmit --noUnusedLocals` 와 `npx vite build` 통과
- 줄바꿈이 CRLF 인 파일이 있으므로 여러 줄 문자열 치환 스크립트는 `\r\n` 을 먼저 정리한다
