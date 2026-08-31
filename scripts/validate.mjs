// フェーズ1の検証スクリプト。
//
// 目的はただ一つ ——「楽天の商品データから度数と容量を機械的に取り出せるか」を測ること。
// 抽出率が 90% 出れば製品は成立する。70% を切るなら設計をやり直す。
//
// 対象は蒸留酒と果実酒に限る。日本酒は商品名に度数を書かない慣習があり抽出できないが、
// そもそもスコープ外なので、混ぜて測ると数字の意味が失われる。

import { parseItem } from './lib/parse.mjs';
import { writeFileSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* .env が無ければ環境変数を使う */ }

const APP_ID = (process.env.RAKUTEN_APP_ID ?? '').trim();
const ACCESS_KEY = (process.env.RAKUTEN_ACCESS_KEY ?? '').trim();

// 2026年の仕様変更で applicationId(UUID) と accessKey の両方が必須になった。
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

const ITEM_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const GENRE_API = 'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';

const TARGET = Number(process.argv[2] ?? 1000);
const HITS = 30;           // APIの1ページあたり上限
const INTERVAL_MS = 1400;  // レート制限回避
const MAX_RETRY = 4;

// 蒸留酒・果実酒のみ。日本酒・清酒は除く。
const IN_SCOPE = /焼酎|ウイスキー|ウィスキー|ブランデー|ジン|ラム|ウォッカ|テキーラ|スピリッツ|ワイン|梅酒|果実酒|リキュール/;
const OUT_SCOPE = /日本酒|清酒/;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function url(base, params) {
  const q = new URLSearchParams({ applicationId: APP_ID, accessKey: ACCESS_KEY, format: 'json', ...params });
  return `${base}?${q}`;
}

/**
 * APIを叩く。429 は一時的なので指数バックオフで粘る。
 * 前回はここで諦めたせいで、洋酒ジャンルが丸ごと欠測した。
 */
async function call(base, params) {
  let wait = 2000;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const res = await fetch(url(base, params));
    const body = await res.text();
    if (res.ok) return JSON.parse(body);

    if (res.status === 429 && attempt < MAX_RETRY) {
      const hinted = Number(body.match(/again in (\d+) second/i)?.[1]);
      const delay = Number.isFinite(hinted) ? (hinted + 1) * 1000 : wait;
      process.stdout.write(`\r  429のため ${delay / 1000}秒待機して再試行 (${attempt}/${MAX_RETRY - 1})   `);
      await sleep(delay);
      wait *= 2;
      continue;
    }
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  throw new Error('リトライ上限に達しました');
}

/** ジャンル木を2段たどり、蒸留酒・果実酒のサブジャンルだけを集める */
async function findTargetGenres() {
  const nameOf = g => g.nameJa ?? g.genreName ?? '';
  const childrenOf = j => (j.children ?? []).map(c => c.child ?? c);

  const roots = childrenOf(await call(GENRE_API, { genreId: '0' }))
    .filter(g => /酒|ビール|洋酒|ワイン/.test(nameOf(g)));

  const found = [];
  for (const root of roots) {
    await sleep(INTERVAL_MS);
    const subs = childrenOf(await call(GENRE_API, { genreId: String(root.genreId) }));
    for (const s of subs) {
      const name = nameOf(s);
      if (IN_SCOPE.test(name) && !OUT_SCOPE.test(name)) {
        found.push({ id: s.genreId, name, root: nameOf(root) });
      }
    }
  }
  return found;
}

const genres = await findTargetGenres();
console.log('');
if (genres.length === 0) {
  console.error('対象ジャンルが見つかりませんでした。ジャンル構成が変わった可能性があります。');
  process.exit(1);
}
console.log(`対象ジャンル ${genres.length}件:`);
for (const g of genres) console.log(`  ${g.root} > ${g.name} (${g.id})`);
console.log('');

// ジャンルを総なめせず巡回する。1ジャンルが枠を食い潰すと分布が偏るため。
const perGenre = Math.max(1, Math.ceil(TARGET / genres.length / HITS));
const items = [];
const exhausted = new Set();

for (let page = 1; page <= perGenre && items.length < TARGET; page++) {
  for (const g of genres) {
    if (items.length >= TARGET) break;
    if (exhausted.has(g.id)) continue;
    let json;
    try {
      json = await call(ITEM_API, { genreId: String(g.id), hits: String(HITS), page: String(page) });
    } catch (e) {
      console.error(`\n  取得失敗 ${g.name} page=${page}: ${e.message}`);
      exhausted.add(g.id);
      continue;
    }
    const batch = (json.Items ?? json.items ?? []).map(x => x.Item ?? x);
    if (batch.length === 0) { exhausted.add(g.id); continue; }
    items.push(...batch.map(it => ({ ...it, _genre: g.name })));
    process.stdout.write(`\r取得中: ${items.length} / ${TARGET} 件   `);
    await sleep(INTERVAL_MS);
  }
}
console.log('\n');

if (items.length === 0) {
  console.error('商品を1件も取得できませんでした。認証かエンドポイントを確認してください。');
  process.exit(1);
}

// ---- 解析 ----
const results = [];
const stats = {};
let ok = 0, withCaption = 0;
const failed = { abv: [], volume: [] };

for (const it of items) {
  const itemName = it.itemName ?? it.name ?? '';
  const itemCaption = it.itemCaption ?? it.caption ?? '';
  if (itemCaption) withCaption++;

  const r = parseItem({ itemName, itemCaption, itemPrice: it.itemPrice ?? it.price });
  results.push({ itemName, itemPrice: it.itemPrice ?? it.price, genre: it._genre, ...r });

  stats[it._genre] ??= { total: 0, ok: 0 };
  stats[it._genre].total++;

  if (r.ok) { ok++; stats[it._genre].ok++; }
  else failed[r.reason].push(itemName);
}

const rate = (ok / items.length) * 100;

console.log('='.repeat(58));
console.log(`  総件数        ${items.length}`);
console.log(`  抽出成功      ${ok}`);
console.log(`  度数が取れず  ${failed.abv.length}`);
console.log(`  容量が取れず  ${failed.volume.length}`);
console.log(`  抽出率        ${rate.toFixed(1)}%`);
console.log('='.repeat(58));
console.log(rate >= 90 ? '  判定: 合格。設計どおり進められる。'
  : rate >= 70 ? '  判定: 保留。パーサーを改善すれば届く見込み。'
    : '  判定: 不合格。設計を作り直す。');
console.log('');

console.log('--- ジャンル別 ---');
for (const [g, s] of Object.entries(stats).sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)) {
  console.log(`  ${g.padEnd(16)} ${String(s.total).padStart(4)}件  ${(s.ok / s.total * 100).toFixed(1).padStart(5)}%`);
}
console.log(`\n  商品説明が入っていた割合: ${(withCaption / items.length * 100).toFixed(1)}%`);
console.log('');

console.log('--- 度数が取れなかった例（先頭10件）---');
failed.abv.slice(0, 10).forEach(n => console.log('  ' + n.slice(0, 68)));
console.log('');
console.log('--- 容量が取れなかった例（先頭10件）---');
failed.volume.slice(0, 10).forEach(n => console.log('  ' + n.slice(0, 68)));

writeFileSync('data/validation.json', JSON.stringify({ rate, ok, total: items.length, stats, results }, null, 2));
console.log('\n詳細を data/validation.json に保存しました。');
