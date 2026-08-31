// 度数が取れない商品について、商品説明文が救えているかを実測する。
// 「本文から取れるのでは」という問いに、推測ではなく数字で答えるための使い捨て診断。

import { parseAbv, parseVolume } from './lib/parse.mjs';
import { loadCredentials, findTargetGenres, fetchItems, INTERVAL_MS, sleep } from './lib/rakuten.mjs';

const SAMPLE = Number(process.argv[2] ?? 400);
const creds = loadCredentials();
const genres = await findTargetGenres(creds);

const raw = [];
outer:
for (let page = 1; page <= 20; page++) {
  for (const g of genres) {
    if (raw.length >= SAMPLE) break outer;
    try { raw.push(...await fetchItems(creds, g.id, page, { sort: 'standard' })); }
    catch { continue; }
    process.stdout.write(`\r取得: ${raw.length}/${SAMPLE}`);
    await sleep(INTERVAL_MS);
  }
}
console.log('\n');

let nameHas = 0, nameMissing = 0, captionRescued = 0, noCaption = 0, hopeless = 0;
const samples = [];

for (const it of raw) {
  const name = it.itemName ?? '';
  const cap = it.itemCaption ?? '';
  if (parseAbv(name) !== null) { nameHas++; continue; }
  nameMissing++;
  if (!cap) { noCaption++; continue; }
  if (parseAbv(cap) !== null) { captionRescued++; continue; }
  hopeless++;
  if (samples.length < 12) {
    // 度数らしき数字が本文にあるのに拾えていないケースを探すため、周辺を抜き出す
    const near = cap.match(/.{0,26}(?:度数?|アルコール|alc|vol|%|°)[^。\n]{0,26}/gi);
    samples.push({ name: name.slice(0, 48), hint: near ? near.slice(0, 3).join(' ／ ').slice(0, 130) : '（度数らしき記述なし）' });
  }
}

console.log('='.repeat(58));
console.log(`  サンプル              ${raw.length} 件`);
console.log(`  商品名から取得できた  ${nameHas} 件 (${(nameHas / raw.length * 100).toFixed(1)}%)`);
console.log(`  商品名に無かった      ${nameMissing} 件`);
console.log(`    └ 本文が救った      ${captionRescued} 件`);
console.log(`    └ 本文が空          ${noCaption} 件`);
console.log(`    └ 本文にも無い      ${hopeless} 件`);
console.log('='.repeat(58));
const total = nameHas + captionRescued;
console.log(`  最終的な取得率        ${(total / raw.length * 100).toFixed(1)}%`);
console.log(`  本文による上乗せ      +${(captionRescued / raw.length * 100).toFixed(1)}ポイント`);
console.log('');
console.log('--- 本文にも度数が見つからなかった例 ---');
samples.forEach(s => {
  console.log(`  ${s.name}`);
  console.log(`    本文の該当箇所: ${s.hint}`);
});
