/**
 * Apps Script 코드 문법 검사 — 편집기에 붙여 넣기 전에 저장이 안 되는 오류(따옴표 중첩, 문자열 안 줄바꿈 등)를 잡는다.
 * 실행하지 않고 문법만 본다 (vm.Script 컴파일). 오류가 있으면 파일:줄과 함께 실패한다.
 * 사용: npm run check:gas (빌드 때도 먼저 돈다)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DIR = path.resolve(import.meta.dirname, '..', 'apps-script');
const files = fs.readdirSync(DIR).filter((f) => /\.(gs|js)$/.test(f));
let failed = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (err) {
    failed++;
    // 스택 첫 줄에 파일:줄, 다음 줄들에 문제 위치가 있다
    console.error(`✗ ${f}\n${String(err.stack || err).split('\n').slice(0, 4).join('\n')}\n`);
  }
}
if (failed) {
  console.error(`Apps Script 문법 오류 ${failed}개 파일 — 고친 뒤 다시 실행하세요.`);
  process.exit(1);
}
console.log(`Apps Script 문법 확인: ${files.length}개 파일 통과 (${files.join(', ')})`);
