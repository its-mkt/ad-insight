import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 릴리즈 표기: 배포(=main 반영) 날짜 기준 YY.MM.DD, 같은 날 두 번째부터 -2, -3 …
 * main 의 first-parent 커밋 하나가 배포(push) 하나에 해당하므로, HEAD 와 같은 날(KST)인 커밋 수가 그날의 배포 순번이다.
 * git 을 못 읽으면(압축본 등) 빌드 날짜만 쓴다.
 */
function releaseInfo(): { tag: string; commit: string } {
  const kstDay = (sec: number) => new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, '.');
  try {
    const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const [sha, headSec] = git('log -1 --format=%h%x20%ct').split(' ');
    const day = kstDay(Number(headSec));
    const n = git('log --first-parent --format=%ct HEAD')
      .split('\n')
      .filter((s) => kstDay(Number(s)) === day).length;
    return { tag: `v${day}${n > 1 ? `-${n}` : ''}`, commit: sha };
  } catch {
    return { tag: `v${kstDay(Date.now() / 1000)}`, commit: '' };
  }
}
const release = releaseInfo();

/**
 * 마우스 기기에서만 호버 — `:hover` 가 든 규칙을 모두 `@media (hover: hover) and (pointer: fine)` 안으로 옮긴다.
 * 휴대폰·태블릿은 누르면 :hover 가 걸린 채 남아(눌렀던 버튼 바탕이 그대로 남는 등) 호버 효과를 끈다.
 * 트랙패드·마우스를 연결한 태블릿은 조건을 만족해 호버가 보인다. 스타일 파일마다 감싸지 않고 여기서 한 번에 처리한다.
 * `a:hover, a:focus-visible` 처럼 섞인 선택자는 :hover 쪽만 떼어 옮긴다.
 */
const HOVER_MEDIA = '(hover: hover) and (pointer: fine)';
const HOVER_RE = /:hover\b/;
// postcss 를 직접 의존성으로 두지 않아 타입은 쓰는 만큼만 적는다
type CssNode = { type: string; name?: string; params?: string; parent?: CssNode };
type CssRule = CssNode & {
  selector: string;
  selectors: string[];
  clone(over: { selectors: string[] }): CssRule;
  before(node: unknown): void;
  replaceWith(node: unknown): void;
  remove(): void;
};
const hoverOnlyOnPointerDevices = {
  postcssPlugin: 'hover-only-on-pointer-devices',
  Rule(rule: CssRule, { AtRule }: { AtRule: new (o: { name: string; params: string }) => { append(n: unknown): void } }) {
    if (!HOVER_RE.test(rule.selector)) return;
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && p.name === 'media' && p.params === HOVER_MEDIA) return;
    }
    const hover = rule.selectors.filter((s) => HOVER_RE.test(s));
    const rest = rule.selectors.filter((s) => !HOVER_RE.test(s));
    const media = new AtRule({ name: 'media', params: HOVER_MEDIA });
    media.append(rule.clone({ selectors: hover }));
    if (rest.length === 0) {
      rule.replaceWith(media);
    } else {
      rule.selectors = rest;
      rule.before(media);
    }
  },
};

/** 로컬 데이터 파일 요청 — 배포 경로(/ad-insight/)가 붙은 주소와 붙지 않은 주소 모두 */
const LOCAL_DATA_URL = /^(\/ad-insight)?\/data\/latest\.json/;

export default defineConfig(({ command }) => ({
  // 배포 주소가 공용 도메인 아래 경로(https://its.itket.com/ad-insight/)라 파일을 그 경로 기준으로 찾는다.
  // 화면 주소가 /ad-insight/itket/quotes 처럼 깊어져도 같다. 개발 서버도 같은 경로(localhost:2000/ad-insight/)로 연다
  base: '/ad-insight/',
  // 로컬 개발 서버에서는 배포본과 헷갈리지 않게 -dev 를 붙인다
  define: {
    __APP_RELEASE__: JSON.stringify(command === 'serve' ? `${release.tag}-dev` : release.tag),
    __APP_COMMIT__: JSON.stringify(release.commit),
  },
  css: {
    postcss: { plugins: [hoverOnlyOnPointerDevices] },
  },
  plugins: [
    react(),
    {
      name: 'serve-local-data',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (LOCAL_DATA_URL.test(req.url || '')) {
            const filePath = path.resolve(__dirname, 'data/latest.json');
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (LOCAL_DATA_URL.test(req.url || '')) {
            const filePath = path.resolve(__dirname, 'data/latest.json');
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
      closeBundle() {
        const src = path.resolve(__dirname, 'data/latest.json');
        const destDir = path.resolve(__dirname, 'dist/data');
        if (fs.existsSync(src)) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(src, path.join(destDir, 'latest.json'));
        }
        // GitHub Pages 는 /itket/quotes 같은 경로에 파일이 없으면 404.html 을 준다 — 같은 앱을 띄워 주소로 화면을 고른다
        const indexHtml = path.resolve(__dirname, 'dist/index.html');
        if (fs.existsSync(indexHtml)) fs.copyFileSync(indexHtml, path.resolve(__dirname, 'dist/404.html'));
      },
    },
  ],
  server: {
    port: 2000,
    strictPort: true,
  },
  preview: {
    port: 2000,
    strictPort: true,
  },
}));
