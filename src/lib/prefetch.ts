/**
 * 첫 데이터 요청 미리 보내기 — 처음 접속(기억한 권한이 없을 때)은 권한 확인(웹앱 whoami, 2~4초)이 끝나야
 * 화면이 열려 데이터 요청이 시작됐다. 권한 확인과 함께 데이터 요청을 먼저 출발시켜 두고, 화면이 열리면 그 응답을 쓴다.
 * 데이터는 웹앱이 로그인 토큰과 명단으로 막으므로(권한이 없으면 login_required) 미리 받아도 새지 않는다.
 * 주소(토큰 포함)가 같을 때만 쓰고, 1분 안에 아무도 가져가지 않으면 버린다.
 */
const KEEP_MS = 60 * 1000;

let pending: { url: string; at: number; body: Promise<unknown> } | null = null;

/** url 을 미리 받아 둔다 (JSON) */
export function prefetchJson(url: string): void {
  const body = fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))));
  body.catch(() => undefined); // 아무도 가져가지 않은 실패가 경고로 남지 않게
  pending = { url, at: Date.now(), body };
  window.setTimeout(() => {
    if (pending?.body === body) pending = null;
  }, KEEP_MS);
}

/** 같은 주소를 미리 받고 있으면 그 응답을 넘기고 비운다 (없으면 null) */
export function takePrefetched<T>(url: string): Promise<T> | null {
  if (!pending || pending.url !== url || Date.now() - pending.at > KEEP_MS) return null;
  const body = pending.body as Promise<T>;
  pending = null;
  return body;
}
