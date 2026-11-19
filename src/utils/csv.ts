/** CSV 값 한 칸 — 모든 칸을 " 로 감싸고 안의 " 는 "" 로 바꾼다 (이메일·카테고리 등에 " 가 들어가도 열이 밀리지 않게) */
const csvCell = (v?: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * 머리글 + 행 → CSV 문자열. 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM 을 붙이고, 줄은 \n 으로 나눈다.
 * 머리글은 감싸지 않고 그대로, 행의 칸은 모두 csvCell 로 감싼다
 */
export const toCsv = (headers: string[], rows: (string | number | undefined)[][]): string =>
  '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

/** CSV 문자열을 파일로 내려받는다 */
export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
