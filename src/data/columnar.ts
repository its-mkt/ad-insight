/**
 * 웹앱 응답의 열 형식 되돌리기 — 웹앱은 fmt=cols 로 물으면 표마다 { _cols: 열 이름들, _rows: 값 배열들 } 로 보낸다
 * (행마다 반복되던 열 이름을 한 번만 보내 12.6MB → 5.2MB, apps-script/Code.gs columnarPayload_).
 * 받은 즉시 예전과 같은 행 객체 배열로 되돌려, 그 뒤 코드(parseApi·캐시 저장)는 형식을 몰라도 된다.
 * 옛 웹앱(fmt 를 모름)이 객체 형식으로 보내면 그대로 둔다. null 칸은 그 행에 없던 열이라 빼고 만든다.
 */
type Columnar = { _cols: string[]; _rows: unknown[][] };

const isColumnar = (v: unknown): v is Columnar =>
  !!v && typeof v === 'object' && Array.isArray((v as Columnar)._cols) && Array.isArray((v as Columnar)._rows);

function toRows({ _cols: cols, _rows: rows }: Columnar): Record<string, unknown>[] {
  return rows.map((vals) => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) if (vals[i] !== null && vals[i] !== undefined) row[cols[i]] = vals[i];
    return row;
  });
}

/** 열 형식 표를 행 객체 배열로 되돌린 응답 (열 형식이 없으면 받은 그대로) */
export function expandColumnar<T extends object>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(payload)) {
    if (!isColumnar(v)) continue;
    out = out || { ...(payload as Record<string, unknown>) };
    out[k] = toRows(v);
  }
  return (out as T) || payload;
}
