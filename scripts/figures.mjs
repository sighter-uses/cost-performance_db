// PLAN.md が引用している数値を、現在のデータから全部出し直す。
//
// 記事を書く前に必ずこれを走らせること。PLAN.md に直接書いた数値は、
// データを取り直すたびに静かに古くなる —— 古いまま記事にすると、
// 読者がサイトと突き合わせた瞬間に矛盾する。
// 「毎回ここに戻る」を人の記憶に頼らせないための道具。
//
//   node scripts/figures.mjs

import { readFileSync } from 'node:fs';
import { hasRandomContents } from './lib/parse.mjs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));
// 掲載しているものと同じ集合で数える。build.mjs と食い違うと検算の意味がない。
const items = db.items.filter(i => !hasRandomContents(i.name));

const GENRES = ['ウォッカ', '焼酎', 'ジン', 'ラム', 'ウイスキー', 'テキーラ', 'ブランデー'];
const HOME_ML = 1800;

const med = list => {
  if (!list.length) return 0;
  const s = list.map(i => i.yenPerUnit).sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
};
const of = g => items.filter(i => i.genre === g);
const pad = (s, n) => String(s).padEnd(n);
const num = n => n.toLocaleString('ja-JP');

const d = new Date(new Date(db.fetchedAt).getTime() + 9 * 3600 * 1000);
console.log(`データ取得: ${d.toISOString().slice(0, 10)}  掲載 ${num(items.length)} 件`);
console.log(`（抽選商品 ${db.items.length - items.length} 件を除外した後の数）\n`);

console.log('## 中央値の定義表（PLAN.md の「数字の定義」に貼る）');
console.log('| 種別 | 全件（記事で使う） | 家庭用のみ（使わない） | 掲載数 |');
console.log('|---|---:|---:|---:|');
for (const g of GENRES) {
  const a = of(g);
  console.log(`| ${g} | ${med(a)}円 | ${med(a.filter(i => i.volumeMl <= HOME_ML))}円 | ${a.length} |`);
}
console.log(`| **全体** | **${med(items)}円** | ${med(items.filter(i => i.volumeMl <= HOME_ML))}円 | ${items.length} |`);

console.log('\n## 記事01 ウイスキー');
{
  const w = of('ウイスキー').slice().sort((a, b) => a.yenPerUnit - b.yenPerUnit);
  const big = w.filter(i => i.volumeMl >= 4000)[0];
  console.log(`  n=${w.length} / 中央値 ${med(w)}円 / 最安 ${w[0].yenPerUnit}円`);
  console.log(`  最安の商品: ${w[0].name.slice(0, 50)}`);
  if (big) console.log(`  4L以上の最安: ${big.yenPerUnit}円（中央値の 1/${(med(w) / big.yenPerUnit).toFixed(1)}）`);
  console.log(`  焼酎の中央値 ${med(of('焼酎'))}円 を下回るか: ${big && big.yenPerUnit < med(of('焼酎')) ? 'はい' : 'いいえ'}`);
}

console.log('\n## 記事06 テキーラの評価');
for (const g of GENRES) {
  const a = of(g);
  const has = a.filter(i => i.reviewCount > 0).length;
  const ten = a.filter(i => i.reviewCount >= 10).length;
  console.log(`  ${pad(g, 7)} n=${pad(a.length, 5)} 評価あり ${pad(has, 4)} (${(has / a.length * 100).toFixed(0)}%)  レビュー10件以上 ${ten}`);
}

console.log('\n## 記事08 度数帯別の中央値');
for (const [lo, hi, label] of [[0, 26, '20〜26度'], [26, 36, '26〜36度'], [36, 41, '36〜41度'],
  [41, 46, '41〜46度'], [46, 60, '46〜60度'], [60, 200, '60度超']]) {
  const a = items.filter(i => i.abv > lo && i.abv <= hi);
  if (a.length) console.log(`  ${pad(label, 9)} ${pad(med(a) + '円', 7)} n=${a.length}`);
}

console.log('\n## 記事09 容量帯別の中央値');
for (const [lo, hi, label] of [[0, 300, '300ml以下'], [300, 750, '300〜750ml'],
  [750, 1800, '750〜1800ml'], [1800, 1e9, '1.8L以上']]) {
  const a = items.filter(i => i.volumeMl > lo && i.volumeMl <= hi);
  if (a.length) console.log(`  ${pad(label, 12)} ${pad(med(a) + '円', 7)} n=${a.length}`);
}

console.log('\n## 記事11 セット品と単品');
{
  const set = items.filter(i => i.setCount > 1), one = items.filter(i => i.setCount === 1);
  console.log(`  セット ${med(set)}円 (${set.length}件) / 単品 ${med(one)}円 (${one.length}件)`);
  console.log(`  差: ${((1 - med(set) / med(one)) * 100).toFixed(1)}% 安い`);
}

console.log('\n## 記事12 ポイント倍率');
{
  const pt = items.filter(i => i.pointRate > 1);
  const c = {};
  pt.forEach(i => { c[i.pointRate] = (c[i.pointRate] ?? 0) + 1; });
  console.log(`  倍率つき ${pt.length} / ${items.length} = ${(pt.length / items.length * 100).toFixed(1)}%`);
  console.log('  内訳: ' + Object.entries(c).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}倍:${v}件`).join(' / '));
}

console.log('\n## 記事13 送料別フラグ');
{
  const flagged = items.filter(i => i.postageIncluded === false);
  const lying = flagged.filter(i => /送料無料/.test(i.name));
  console.log(`  送料別フラグ ${flagged.length}件 / うち商品名に「送料無料」 ${lying.length}件 (${(lying.length / flagged.length * 100).toFixed(1)}%)`);
}

console.log('\n## 記事15 高評価かつ中央値以下（評価4.5+ / レビュー10件+）');
for (const g of GENRES) {
  const a = of(g), m = med(a);
  console.log(`  ${pad(g, 7)} ${a.filter(i => i.reviewAverage >= 4.5 && i.reviewCount >= 10 && i.yenPerUnit <= m).length}本`);
}

console.log('\n## 記事16 データの幅');
{
  const s = items.slice().sort((a, b) => a.yenPerUnit - b.yenPerUnit);
  const top = s[s.length - 1];
  console.log(`  20g単価 ${s[0].yenPerUnit}円 〜 ${num(Math.round(top.yenPerUnit))}円（${Math.round(top.yenPerUnit / s[0].yenPerUnit)}倍）`);
  console.log(`  最高価格 ${num(Math.max(...items.map(i => i.price)))}円 / 最高度数 ${Math.max(...items.map(i => i.abv))}度`);
  console.log(`  最大容量 ${num(Math.max(...items.map(i => i.volumeMl)))}ml / 最小 ${Math.min(...items.map(i => i.volumeMl))}ml`);
  console.log(`  最多レビュー ${num(Math.max(...items.map(i => i.reviewCount)))}件`);
}

console.log('\n注意: ここに出ない数値を記事に書かないこと。');
console.log('書きたい数値が増えたら、このスクリプトに足してから書く。');
