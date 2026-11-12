/** Set 에 key 가 있으면 뺀, 없으면 넣은 새 Set — 펼침 줄 상태를 setState((prev) => toggledSet(prev, key)) 로 바꿀 때 쓴다 */
export function toggledSet<T>(prev: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
