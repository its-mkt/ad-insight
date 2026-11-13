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
  plugins: [
    react(),
    {
      name: 'serve-local-data-and-config',
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
          if (req.url?.startsWith('/js/config.js')) {
            const filePath = path.resolve(__dirname, 'js/config.js');
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
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
