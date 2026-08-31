// 蒸留酒の商品データを収集し、解析結果を data/items.json に保存する。
//
// 抽出できなかった商品は捨てる。誤った単価を出すより、載せないほうがよい。
//
// 収集は2パスに分ける。楽天は同じ商品でも店舗ごとにページが分かれるためレビューが分散し、
// 通常の取得ではレビュー付き商品が5%程度しか含まれない。評価を軸にした比較が成り立たないので、
// hasReviewFlag でレビュー付きだけを狙う2本目を回す。

import { writeFileSync } from 'node:fs';
import { parseItem } from './lib/parse.mjs';
import { loadCredentials, findTargetGenres, fetchItems, HITS, INTERVAL_MS, sleep } from './lib/rakuten.mjs';

const TARGET = Number(process.argv[2] ?? 3000);
const creds = loadCredentials();

const genres = await findTargetGenres(creds);
if (genres.length === 0) {
  console.error('対象ジャンルが見つかりませんでした。ジャンル構成が変わった可能性があります。');
  process.exit(1);
}
console.log(`\n対象ジャンル ${genres.length}件: ${genres.map(g => g.name).join(', ')}\n`);

/** ジャンルを巡回しながら target 件集める。1ジャンルが枠を食い潰すと分布が偏るため。 */
async function collect(label, extra, target) {
  const out = [];
  const exhausted = new Set();
  const maxPage = Math.max(1, Math.ceil(target / genres.length / HITS));

  for (let page = 1; page <= maxPage && out.length < target; page++) {
    for (const g of genres) {
      if (out.length >= target) break;
      if (exhausted.has(g.id)) continue;
      let batch;
      try {
        batch = await fetchItems(creds, g.id, page, extra);
      } catch (e) {
        console.error(`\n  取得失敗 ${g.name} page=${page}: ${e.message}`);
        exhausted.add(g.id);
        continue;
      }
      if (batch.length === 0) { exhausted.add(g.id); continue; }
      out.push(...batch.map(it => ({ ...it, _genre: g.name })));
      process.stdout.write(`\r${label}: ${out.length} / ${target} 件   `);
      await sleep(INTERVAL_MS);
    }
  }
  console.log('');
  return out;
}

// 1本目: 幅広く。価格比較の母集団になる。
const broad = await collect('広く収集', { sort: 'standard' }, Math.round(TARGET * 0.6));
// 2本目: レビュー付きのみ。評価を軸にした比較の母集団になる。
const reviewed = await collect('レビュー付き', { hasReviewFlag: '1', sort: '-reviewCount' }, Math.round(TARGET * 0.4));

const raw = [...broad, ...reviewed];
console.log('');

// ---- 解析して、使えるものだけ残す ----
const items = [];
const dropped = { abv: 0, volume: 0, price: 0 };
const seen = new Map();

for (const it of raw) {
  const name = it.itemName ?? '';
  const price = it.itemPrice;
  if (typeof price !== 'number' || price <= 0) { dropped.price++; continue; }

  const r = parseItem({ itemName: name, itemCaption: it.itemCaption ?? '', itemPrice: price });
  if (!r.ok) { dropped[r.reason]++; continue; }

  const entry = {
    name, price,
    url: it.affiliateUrl || it.itemUrl,
    image: it.mediumImageUrls?.[0]?.imageUrl ?? it.mediumImageUrls?.[0] ?? null,
    shop: it.shopName ?? '',
    genre: it._genre,
    reviewAverage: Number(it.reviewAverage ?? 0),
    reviewCount: Number(it.reviewCount ?? 0),
    abv: r.abv,
    volumeMl: r.volumeMl,
    setCount: r.setCount,
    totalMl: r.totalMl,
    pureAlcoholG: Math.round(r.pureAlcoholG * 10) / 10,
    yenPerUnit: Math.round(r.yenPerUnit * 10) / 10,
    yenPerMl: Math.round(r.yenPerMl * 100) / 100,
  };

  // 同一商品が複数店舗から出る。名前と価格が同じものは1件に寄せ、
  // レビュー数が多いほうを残す —— 評価の情報量が大きいほうが有用なため。
  const key = `${name}|${price}`;
  const prev = seen.get(key);
  if (!prev || entry.reviewCount > prev.reviewCount) seen.set(key, entry);
}

items.push(...seen.values());
items.sort((a, b) => a.yenPerUnit - b.yenPerUnit);

const withReview = items.filter(i => i.reviewCount > 0);
const out = {
  fetchedAt: new Date().toISOString(),
  source: '楽天市場商品検索API (IchibaItem/Search/20260701)',
  unitGrams: 20,
  genres: genres.map(g => g.name),
  stats: {
    fetched: raw.length,
    listed: items.length,
    withReview: withReview.length,
    dropped,
    extractionRate: raw.length ? Math.round((items.length / raw.length) * 1000) / 10 : 0,
  },
  items,
};

writeFileSync('data/items.json', JSON.stringify(out, null, 2));

console.log('='.repeat(54));
console.log(`  取得          ${raw.length} 件（広く ${broad.length} / レビュー付き ${reviewed.length}）`);
console.log(`  掲載          ${items.length} 件（重複除去後）`);
console.log(`  うちレビュー有 ${withReview.length} 件`);
console.log(`  除外          度数欠 ${dropped.abv} / 容量欠 ${dropped.volume} / 価格欠 ${dropped.price}`);
console.log('='.repeat(54));
console.log('\ndata/items.json に保存しました。');
