// OG画像（SNSで共有したときのカード）を design/og-image.html から書き出す。
//
//   npm run og
//
// Edge か Chrome をヘッドレスで起動して 1200×630 を撮り、ffmpeg で JPEG にする。
// PNG のままだと写真なので 1MB を超える。出力は dist/og.jpg、
// build.mjs はこれがあれば og:image として宣言する。

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = BROWSERS.find(p => existsSync(p));
if (!browser) {
  console.error('Edge / Chrome が見つかりません。環境変数 CHROME_PATH で場所を指定してください。');
  process.exit(1);
}

const src = pathToFileURL(resolve('design/og-image.html')).href + '#shot';
const work = mkdtempSync(join(tmpdir(), 'og-'));
const png = join(work, 'og.png');

try {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${join(work, 'profile')}`,
    '--force-device-scale-factor=1', '--window-size=1200,630',
    // 書体（Google Fonts）と背景写真の読み込みを待つ
    '--virtual-time-budget=10000',
    `--screenshot=${png}`, src,
  ], { stdio: 'ignore' });

  if (!existsSync(png)) throw new Error('スクリーンショットが作られませんでした');

  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '2', '-pix_fmt', 'yuvj420p', 'dist/og.jpg']);
  console.log(`dist/og.jpg  ${Math.round(statSync('dist/og.jpg').size / 1024)}KB`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
