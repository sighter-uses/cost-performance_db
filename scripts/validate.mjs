// フェーズ1の検証スクリプト。
//
// 目的はただ一つ ——「楽天の商品データから度数と容量を機械的に取り出せるか」を測ること。
// 抽出率が 90% 出れば製品は成立する。70% を切るなら設計をやり直す。

import { parseItem } from './lib/parse.mjs';
import { writeFileSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* .env が無ければ環境変数を使う */ }

const APP_ID = (process.env.RAKUTEN_APP_ID ?? '').trim();
if (!APP_ID) {
  console.error('RAKUTEN_APP_ID が未設定です。.env.example を .env にコピーして記入してください。');
  process.exit(1);
}
// applicationId は「10」から始まる数字列。シークレットやアフィリエイトIDとの取り違えが起きやすいので
// APIを叩く前に弾く —— 400が返ってから原因を探すより、ここで理由を言うほうが速い。
if (!/^[0-9]+$/.test(APP_ID)) {
  const syms = [...new Set(APP_ID.replace(/[0-9a-zA-Z]/g, '').split(''))].join(' ');
  console.error('RAKUTEN_APP_ID の形式が不正です。');
  console.error(`  現在の値: ${APP_ID.length}文字 / 数字以外の文字を含む${syms ? ` (記号: ${syms})` : ''}`);
  console.error('  applicationId は「10」から始まる数字だけの列です。');
  console.error('  アプリケーションシークレット（UUID形式）やアフィリエイトID（ドット区切り）と');
  console.error('  取り違えていないか、楽天のアプリ情報画面で確認してください。');
  process.exit(1);
}

const API = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
const GENRE_API = 'https://app.rakuten.co.jp/services/api/IchibaGenre/Search/20140222';
const TARGET = Number(process.argv[2] ?? 1000);
const HITS = 30;                    // APIの1ページあたり上限
const INTERVAL_MS = 1200;           // レート制限回避

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${await res.text()}`);
  return res.json();
}

/** 酒類のジャンルIDをルートから探索する（IDをハードコードしない） */
async function findLiquorGenres() {
  const root = await call(`${GENRE_API}?applicationId=${APP_ID}&genreId=0&format=json`);
  const children = root.children ?? [];
  const matched = children
    .map(c => c.child)
    .filter(g => /酒|ビール|洋酒|ワイン/.test(g.genreName));
  return matched;
}

async function fetchPage(genreId, page) {
  const url = `${API}?applicationId=${APP_ID}&genreId=${genreId}&hits=${HITS}&page=${page}&format=json`;
  return call(url);
}

const genres = await findLiquorGenres();
if (genres.length === 0) {
  console.error('酒類ジャンルが見つかりませんでした。ジャンル構成が変わった可能性があります。');
  process.exit(1);
}
console.log('対象ジャンル:', genres.map(g => `${g.genreName}(${g.genreId})`).join(', '));
console.log('');

const items = [];
outer:
for (const g of genres) {
  for (let page = 1; page <= 100; page++) {
    let json;
    try {
      json = await fetchPage(g.genreId, page);
    } catch (e) {
      console.error(`  取得失敗 genre=${g.genreId} page=${page}: ${e.message}`);
      break;
    }
    const batch = (json.Items ?? []).map(x => x.Item ?? x);
    if (batch.length === 0) break;
    items.push(...batch.map(it => ({ ...it, _genre: g.genreName })));
    process.stdout.write(`\r取得中: ${items.length} / ${TARGET} 件`);
    if (items.length >= TARGET) break outer;
    await sleep(INTERVAL_MS);
  }
}
console.log('\n');

// ---- 解析 ----
let ok = 0;
const failed = { abv: [], volume: [] };
const results = [];

for (const it of items) {
  const r = parseItem({
    itemName: it.itemName,
    itemCaption: it.itemCaption,
    itemPrice: it.itemPrice,
  });
  results.push({ itemName: it.itemName, itemPrice: it.itemPrice, genre: it._genre, ...r });
  if (r.ok) ok++;
  else failed[r.reason].push(it.itemName);
}

const rate = items.length ? (ok / items.length) * 100 : 0;

console.log('='.repeat(56));
console.log(`  総件数        ${items.length}`);
console.log(`  抽出成功      ${ok}`);
console.log(`  度数が取れず  ${failed.abv.length}`);
console.log(`  容量が取れず  ${failed.volume.length}`);
console.log(`  抽出率        ${rate.toFixed(1)}%`);
console.log('='.repeat(56));
console.log(rate >= 90 ? '  判定: 合格。設計どおり進められる。'
          : rate >= 70 ? '  判定: 保留。パーサーを改善すれば届く見込み。'
          :              '  判定: 不合格。設計を作り直す。');
console.log('');

console.log('--- 度数が取れなかった例（先頭10件）---');
failed.abv.slice(0, 10).forEach(n => console.log('  ' + n.slice(0, 70)));
console.log('');
console.log('--- 容量が取れなかった例（先頭10件）---');
failed.volume.slice(0, 10).forEach(n => console.log('  ' + n.slice(0, 70)));

writeFileSync('data/validation.json', JSON.stringify({ rate, ok, total: items.length, results }, null, 2));
console.log('\n詳細を data/validation.json に保存しました。');
