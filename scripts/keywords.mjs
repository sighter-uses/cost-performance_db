// Google サジェストから、実際に打たれている語を取る。
//
// 記事を書く前にこれを走らせ、content/KEYWORDS.md を更新する。
// 頭の中で「こう検索されるはず」と決めると外す —— 実際、
// 「純アルコール」は健康の文脈でしか検索されておらず、
// 「酒 20g」は料理酒の分量検索に食われていた。どちらも走らせるまで分からなかった。
//
//   node scripts/keywords.mjs            画面に出す
//   node scripts/keywords.mjs out.txt    ファイルに書く（端末の文字コードを経由しない）

import { writeFileSync } from 'node:fs';

// ie/oe を付けないと Shift-JIS で返る。UTF-8 として保存すると化ける。
const ENDPOINT = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&ie=utf8&oe=utf8&q=';
const WAIT_MS = 350;

const TERMS = [
  // 種別 × コスパ。「コスパ最強」「ランキング」が付くかを見る
  'ウイスキー コスパ', '焼酎 コスパ', 'ジン コスパ', 'ラム酒 コスパ',
  'ウォッカ コスパ', 'テキーラ コスパ', 'ブランデー コスパ',
  // 価格の言い方
  '酒 コスパ', '酒 単価', '安い 酒 ランキング', 'コスパ最強 酒',
  // 大容量（記事01の主題）
  'ウイスキー 大容量', 'ウイスキー 4l', '焼酎 1.8l',
  // 1杯あたり（記事14の主題）
  'ウイスキー 1杯', 'ハイボール 一杯',
  // 我々が看板に使っている語。入口として機能するかの確認
  '蒸留酒', '純アルコール量', '酒 20g',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function suggest(term) {
  const res = await fetch(ENDPOINT + encodeURIComponent(term), { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text())[1] ?? [];
}

const lines = [`# Google サジェスト実測 — ${new Date().toISOString().slice(0, 10)}`, ''];
for (const term of TERMS) {
  try {
    const hits = await suggest(term);
    lines.push(`■ ${term}`);
    for (const h of hits.slice(0, 12)) lines.push(`    ${h}`);
  } catch (e) {
    lines.push(`■ ${term}  取得失敗: ${e.message}`);
  }
  await sleep(WAIT_MS);
}

const out = lines.join('\n');
const dest = process.argv[2];
if (dest) {
  writeFileSync(dest, out, 'utf8');
  console.log(`${dest} に書き出しました（${TERMS.length}語）。`);
  console.log('端末の文字コードによっては cat で化けます。エディタで開いてください。');
} else {
  console.log(out);
}
