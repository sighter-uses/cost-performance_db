// フェーズ1の検証スクリプト。
//
// 目的はただ一つ ——「楽天の商品データから度数と容量を機械的に取り出せるか」を測ること。
// 抽出率が 90% 出れば製品は成立する。70% を切るなら設計をやり直す。

import { parseItem } from './lib/parse.mjs';
import { writeFileSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* .env が無ければ環境変数を使う */ }

const APP_ID = (process.env.RAKUTEN_APP_ID ?? '').trim();
const ACCESS_KEY = (process.env.RAKUTEN_ACCESS_KEY ?? '').trim();

// 2026年の仕様変更で applicationId(UUID) と accessKey の両方が必須になった。
// 片方だけだと HTTP 400 になるので、叩く前に理由を言う。
const missing = [
  !APP_ID && 'RAKUTEN_APP_ID',
  !ACCESS_KEY && 'RAKUTEN_ACCESS_KEY',
].filter(Boolean);
if (missing.length) {
  console.error(`${missing.join(' と ')} が未設定です。`);
  console.error('楽天のアプリ情報画面にある「アプリケーションID」と「アクセスキー」を');
  console.error('.env に記入してください（.env.example を参照）。');
  process.exit(1);
}

const ITEM_API  = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const GENRE_API = 'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';
const TARGET = Number(process.argv[2] ?? 1000);
const HITS = 30;          // APIの1ページあたり上限
const INTERVAL_MS = 1200; // レート制限回避

const sleep = ms => new Promise(r => setTimeout(r, ms));

function auth(params) {
  return new URLSearchParams({ applicationId: APP_ID, accessKey: ACCESS_KEY, format: 'json', ...params });
}

async function call(base, params) {
  const res = await fetch(`${base}?${auth(params)}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/** 酒類のジャンルIDをルートから探索する（IDをハードコードしない） */
async function findLiquorGenres() {
  const root = await call(GENRE_API, { genreId: '0' });
  const children = (root.children ?? []).map(c => c.child ?? c);
  return children
    .map(g => ({ id: g.genreId, name: g.nameJa ?? g.genreName ?? '' }))
    .filter(g => /酒|ビール|洋酒|ワイン/.test(g.name));
}

const genres = await findLiquorGenres();
if (genres.length === 0) {
  console.error('酒類ジャンルが見つかりませんでした。ジャンル構成が変わった可能性があります。');
  process.exit(1);
}
console.log('対象ジャンル:', genres.map(g => `${g.name}(${g.id})`).join(', '));
console.log('');

const items = [];
let shapeLogged = false;

outer:
for (const g of genres) {
  for (let page = 1; page <= 100; page++) {
    let json;
    try {
      json = await call(ITEM_API, { genreId: String(g.id), hits: String(HITS), page: String(page) });
    } catch (e) {
      console.error(`\n  取得失敗 genre=${g.id} page=${page}: ${e.message}`);
      break;
    }
    const batch = (json.Items ?? json.items ?? []).map(x => x.Item ?? x);
    if (batch.length === 0) {
      // 応答構造が変わっている可能性。一度だけ最上位キーを出して診断できるようにする
      if (!shapeLogged) {
        console.error('\n  商品が0件。応答の最上位キー:', Object.keys(json).join(', '));
        shapeLogged = true;
      }
      break;
    }
    items.push(...batch.map(it => ({ ...it, _genre: g.name })));
    process.stdout.write(`\r取得中: ${items.length} / ${TARGET} 件`);
    if (items.length >= TARGET) break outer;
    await sleep(INTERVAL_MS);
  }
}
console.log('\n');

if (items.length === 0) {
  console.error('商品を1件も取得できませんでした。認証かエンドポイントを確認してください。');
  process.exit(1);
}

// ---- 解析 ----
let ok = 0;
const failed = { abv: [], volume: [] };
const results = [];

for (const it of items) {
  const r = parseItem({
    itemName: it.itemName ?? it.name ?? '',
    itemCaption: it.itemCaption ?? it.caption ?? '',
    itemPrice: it.itemPrice ?? it.price,
  });
  results.push({ itemName: it.itemName ?? it.name, itemPrice: it.itemPrice ?? it.price, genre: it._genre, ...r });
  if (r.ok) ok++;
  else failed[r.reason].push(it.itemName ?? it.name ?? '(名称なし)');
}

const rate = (ok / items.length) * 100;

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
