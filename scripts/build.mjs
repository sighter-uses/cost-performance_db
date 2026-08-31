// data/items.json から dist/index.html を生成する。
//
// 生成物にAPI認証情報を絶対に含めないこと。ブラウザに配るのは商品データだけ。
//
// 見た目の方針: 蒸留器の素材から色を取る。磨かれた銅を価格に、酸化した緑青を評価に割り当てる。
// 装飾ではなく意味の割り当てなので、色を見れば何の数字か分かる。暗い面を既定にするのは、
// 数字の多い画面が読みやすいことと、この主題が置かれる場所（バー・蒸留所）に合わせるため。

import { readFileSync, writeFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));

// 「コスパ優先」の絞り込み条件。式ではなく閾値なのは、画面上で一文で説明できるようにするため。
const MIN_REVIEWS = 3;
const MIN_RATING = 4.0;
// 「評価優先」の下限。少数のレビューでの高評点は当てにならないので、裏付けのある件数に絞る。
const RATED_MIN_REVIEWS = 20;
// 家庭用サイズの上限。18Lのウォッカが最安を独占しても誰の役にも立たない。
const HOME_SIZE_ML = 1800;

// 楽天の商品名は販促文字列が前置される。「【9/1限定 全品P3倍＆300円OFFクーポン】《パック》…」
// 読むべき情報は商品そのものなので、先頭の販促ブロックだけ落とす。元の名前はリンクのtitleに残す。
const PROMO = /限定|クーポン|OFF|オフ|ポイント|P\d+倍|倍[!！]?$|送料無料|セール|期間|エントリー|買い回り|マラソン|お買い物|割引|特価|配送|あす楽|即日|最短|翌日|在庫|新入荷|入荷|予約|数量|お一人様|税込|円\)|円）/;

// 括弧で囲まれていない先頭の売り文句。「送料無料 ウィルキンソン…」のような形。
const BARE_PROMO = [
  /^\s*送料無料[!！]?\s*/,
  /^\s*1本あたり[\d,]+円\s*[（(]税込[）)]\s*/,
  /^\s*あす楽[^\s]*\s+/,
  /^\s*[Pp]\d+倍\s+/,
];

function displayName(name) {
  let s = name;
  // 販促表記は連続することが多い（「【最強配送】【送料無料】…」）ので繰り返し剥がす。
  for (let i = 0; i < 6; i++) {
    const before = s;
    const m = s.match(/^\s*[【\[（(《]([^】\]）)》]{0,40})[】\]）)》]\s*/);
    if (m && PROMO.test(m[1])) s = s.slice(m[0].length);
    for (const p of BARE_PROMO) s = s.replace(p, '');
    if (s === before) break;
  }
  return s.replace(/\s+/g, ' ').trim() || name;
}

const items = db.items.map(i => ({
  n: displayName(i.name),
  f: i.name,
  p: i.price,
  u: i.url,
  g: i.genre,
  a: i.abv,
  v: i.volumeMl,
  s: i.setCount,
  w: i.pureAlcoholG,
  y: i.yenPerUnit,
  r: i.reviewAverage,
  c: i.reviewCount,
}));

const genres = [...new Set(items.map(i => i.g))].sort();
const qualified = items.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING).length;
const ratedCount = items.filter(i => i.c >= RATED_MIN_REVIEWS).length;
const d = new Date(db.fetchedAt);
const stamp = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>蒸留酒コスパ比較 — 純アルコール20gあたりの価格で選ぶ</title>
<meta name="description" content="楽天市場の蒸留酒${items.length}件を、純アルコール20g（日本酒1合相当）あたりの価格で横断比較。度数と容量から機械的に算出しています。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;600&family=Murecho:wght@400;500;700&display=swap">
<style>
/* 既定は暗い面。明るい面はシステム設定と明示指定の両方で切り替わる。 */
:root{
  --ground:#0e1315; --surface:#151b1e; --raised:#1b2327;
  --line:#232c30; --rule:#313d41;
  --ink:#e4eae8; --sub:#95a3a2; --faint:#68767a;
  --copper:#cf9256; --copper-dim:#4a3520;
  --verdigris:#63a894;
  --f-num:"Martian Mono",ui-monospace,monospace;
  --f-body:"Murecho","Hiragino Sans","Yu Gothic",system-ui,sans-serif;
}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){
  --ground:#eef1f0; --surface:#fbfcfc; --raised:#f4f6f6;
  --line:#dde3e2; --rule:#c3cdcc;
  --ink:#0e1315; --sub:#4c5a5b; --faint:#7a8788;
  --copper:#9c5a24; --copper-dim:#e8d8c6;
  --verdigris:#2c7562;
}}
:root[data-theme="light"]{
  --ground:#eef1f0; --surface:#fbfcfc; --raised:#f4f6f6;
  --line:#dde3e2; --rule:#c3cdcc;
  --ink:#0e1315; --sub:#4c5a5b; --faint:#7a8788;
  --copper:#9c5a24; --copper-dim:#e8d8c6;
  --verdigris:#2c7562;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-body);
  line-height:1.7;font-feature-settings:"palt" 1;-webkit-font-smoothing:antialiased}
.wrap{max-width:58rem;margin:0 auto;padding:0 1rem 5rem}

/* 広告表示。景表法の要請なので隠さず最初に出す。 */
.pr{font-family:var(--f-num);font-size:.6rem;letter-spacing:.1em;color:var(--faint);
  padding:.6rem 1rem;text-align:center;border-bottom:1px solid var(--line);background:var(--surface)}

/* ── 計器盤としてのヘッダ ── */
header{padding:2.4rem 0 1.4rem}
.eyebrow{font-family:var(--f-num);font-size:.58rem;letter-spacing:.22em;color:var(--copper);
  margin-bottom:.9rem;text-transform:uppercase}
h1{font-size:clamp(1.5rem,5vw,2.3rem);font-weight:700;line-height:1.3;margin:0 0 .9rem;letter-spacing:.01em}
h1 em{font-style:normal;color:var(--copper)}
.lede{color:var(--sub);font-size:.88rem;margin:0;max-width:34rem;line-height:1.9}
.readout{display:flex;flex-wrap:wrap;gap:1.6rem;margin-top:1.5rem;padding-top:1.2rem;
  border-top:1px solid var(--line)}
.readout div{display:flex;flex-direction:column;gap:.1rem}
.readout dt{font-family:var(--f-num);font-size:.55rem;letter-spacing:.16em;color:var(--faint)}
.readout dd{margin:0;font-family:var(--f-num);font-size:1rem;color:var(--ink);font-variant-numeric:tabular-nums}

/* ── 操作部 ── */
.controls{position:sticky;top:0;z-index:20;background:var(--ground);padding:.85rem 0 .9rem;
  border-bottom:1px solid var(--rule)}
.modes{display:flex;gap:.4rem;margin-bottom:.75rem}
.modes button{flex:1;appearance:none;background:transparent;color:var(--faint);
  font-family:var(--f-body);font-size:.82rem;font-weight:500;padding:.55rem .4rem;cursor:pointer;
  border:1px solid var(--line);border-radius:0}
.modes button[aria-pressed="true"]{color:var(--ground);background:var(--copper);border-color:var(--copper);font-weight:700}
.modes button:focus-visible{outline:2px solid var(--copper);outline-offset:2px}
.filters{display:flex;flex-wrap:wrap;gap:.32rem}
.chip{appearance:none;font-family:var(--f-body);font-size:.72rem;padding:.24rem .62rem;cursor:pointer;
  background:transparent;color:var(--faint);border:1px solid var(--line);border-radius:0}
.chip[aria-pressed="true"]{color:var(--ink);border-color:var(--ink)}
.chip:focus-visible{outline:2px solid var(--copper);outline-offset:2px}
.note{font-size:.72rem;color:var(--faint);margin:.7rem 0 0;line-height:1.7}

.bar{display:flex;justify-content:space-between;align-items:baseline;
  margin:1.3rem 0 .4rem;font-family:var(--f-num);font-size:.62rem;letter-spacing:.1em;color:var(--faint)}

/* ── 一覧。各行を計器の読み取り面として組む ── */
ol.list{list-style:none;margin:0;padding:0}
.row{padding:.95rem 0 .8rem;border-bottom:1px solid var(--line);
  display:grid;grid-template-columns:1.9rem minmax(0,1fr) auto;gap:.1rem .7rem;align-items:baseline}
.rank{font-family:var(--f-num);font-size:.62rem;color:var(--faint);padding-top:.35rem}
.name{min-width:0;font-size:.87rem;line-height:1.6;font-weight:500}
.name a{color:var(--ink);text-decoration:none;text-underline-offset:3px}
.name a:hover{text-decoration:underline;text-decoration-color:var(--copper)}
.name a:focus-visible{outline:2px solid var(--copper);outline-offset:3px}
.price{font-family:var(--f-num);font-size:1.02rem;font-weight:600;color:var(--copper);
  font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;letter-spacing:-.02em}
.price i{font-style:normal;font-size:.52rem;color:var(--faint);letter-spacing:.06em;margin-left:.25rem}
.meta{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:.1rem .8rem;margin-top:.3rem;
  font-family:var(--f-num);font-size:.6rem;color:var(--sub);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.meta .rate{color:var(--verdigris)}
.meta .norate{color:var(--faint)}
.meta .tag{color:var(--faint)}
/* 相対位置の目盛。一覧を眺めるだけで価格帯が掴めるようにする。 */
.scale{grid-column:2/-1;height:2px;background:var(--copper-dim);margin-top:.55rem;position:relative}
.scale span{position:absolute;inset:0 auto 0 0;background:var(--copper);display:block}

.more{display:block;width:100%;margin-top:1.5rem;padding:.8rem;background:transparent;
  border:1px solid var(--rule);color:var(--sub);font-family:var(--f-body);font-size:.8rem;cursor:pointer}
.more:hover{color:var(--ink);border-color:var(--ink)}
.more:focus-visible{outline:2px solid var(--copper);outline-offset:2px}
.empty{padding:2.5rem 1rem;text-align:center;color:var(--faint);font-size:.85rem}

/* ── 散布図 ── */
.chart{display:none;margin:2rem 0 0;border-top:1px solid var(--line);padding-top:1.2rem}
@media (min-width:52rem){.chart{display:block}}
.chart h2{font-family:var(--f-num);font-size:.58rem;letter-spacing:.18em;margin:0 0 .3rem;color:var(--copper);text-transform:uppercase}
.chart p{font-size:.74rem;color:var(--faint);margin:0 0 .9rem}
.chart svg{width:100%;height:auto;display:block}

footer{margin-top:3.5rem;border-top:1px solid var(--rule);padding-top:1.5rem;
  font-size:.76rem;color:var(--sub);line-height:1.95}
footer h2{font-family:var(--f-num);font-size:.58rem;letter-spacing:.18em;color:var(--copper);
  margin:0 0 .8rem;text-transform:uppercase}
footer dl{margin:0 0 1.3rem;display:grid;grid-template-columns:max-content 1fr;gap:.15rem 1rem}
footer dt{color:var(--faint);font-family:var(--f-num);font-size:.62rem}
footer dd{margin:0}
.legal{border-left:2px solid var(--copper);padding:.5rem 0 .5rem 1rem;margin-top:1.3rem;color:var(--faint)}
.legal strong{color:var(--ink);font-weight:700}

#gate{position:fixed;inset:0;z-index:100;background:var(--ground);display:grid;place-items:center;padding:1.5rem}
#gate .box{max-width:22rem;text-align:center}
#gate .mark{font-family:var(--f-num);font-size:.58rem;letter-spacing:.22em;color:var(--copper);margin-bottom:1.2rem}
#gate h2{font-size:1.05rem;margin:0 0 .7rem;font-weight:700}
#gate p{color:var(--sub);font-size:.8rem;margin:0 0 1.6rem}
#gate button{font-family:var(--f-body);font-size:.86rem;padding:.7rem 2.2rem;cursor:pointer;
  background:var(--copper);color:var(--ground);border:0;font-weight:700}
#gate .leave{display:block;margin:1rem auto 0;background:none;color:var(--faint);
  border:0;font-size:.74rem;cursor:pointer;text-decoration:underline}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="pr">PR — 本ページは楽天アフィリエイトプログラムを利用した広告を含みます</div>

<div class="wrap">
<header>
  <p class="eyebrow">純アルコール 20g / 日本酒1合 相当</p>
  <h1>蒸留酒を<em>単価</em>で比べる</h1>
  <p class="lede">
    価格も度数も容量もバラバラな蒸留酒を、同じ物差しに載せます。
    商品名と説明文から度数と容量を機械的に読み取り、純アルコール20gあたりいくらかを算出しました。
    読み取れなかった商品は載せていません。
  </p>
  <dl class="readout">
    <div><dt>掲載</dt><dd>${items.length.toLocaleString()}</dd></div>
    <div><dt>評価あり</dt><dd>${db.stats.withReview.toLocaleString()}</dd></div>
    <div><dt>種別</dt><dd>${db.genres.length}</dd></div>
    <div><dt>取得</dt><dd>${d.getMonth() + 1}/${d.getDate()}</dd></div>
  </dl>
</header>

<div class="controls">
  <div class="modes" role="group" aria-label="並び順">
    <button type="button" data-mode="cheap" aria-pressed="true">安さ優先</button>
    <button type="button" data-mode="value" aria-pressed="false">コスパ優先</button>
    <button type="button" data-mode="rated" aria-pressed="false">評価優先</button>
  </div>
  <div class="filters">
    <button type="button" class="chip" data-size="home" aria-pressed="true">家庭用サイズ</button>
    ${genres.map(g => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('\n    ')}
  </div>
  <p class="note" id="modeNote"></p>
</div>

<div class="bar"><span id="count"></span><span id="range"></span></div>
<ol class="list" id="list"></ol>
<button type="button" class="more" id="more" hidden>さらに表示</button>

<section class="chart" id="chart" hidden>
  <h2>評価 × 価格</h2>
  <p>横軸が純アルコール20gあたりの価格、縦軸がレビュー評点。左上にあるほど「安くて評価が高い」。円の大きさはレビュー件数。</p>
  <svg id="scatter" viewBox="0 0 720 290" role="img" aria-label="評価と価格の散布図"></svg>
</section>

<footer>
  <h2>このデータについて</h2>
  <dl>
    <dt>取得日</dt><dd>${stamp}</dd>
    <dt>データ元</dt><dd>${esc(db.source)}</dd>
    <dt>対象</dt><dd>${db.genres.map(esc).join('、')}</dd>
    <dt>掲載</dt><dd>${items.length.toLocaleString()} 件（うち評価あり ${db.stats.withReview.toLocaleString()} 件）</dd>
    <dt>除外</dt><dd>度数が読み取れなかった ${db.stats.dropped.abv.toLocaleString()} 件、容量が読み取れなかった ${db.stats.dropped.volume.toLocaleString()} 件</dd>
    <dt>計算式</dt><dd>純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8。これを20gあたりの価格に換算</dd>
  </dl>
  <p>価格は取得時点のもので、実際の販売価格・在庫と異なる場合があります。購入前に販売ページでご確認ください。ポイント還元は含めていません。</p>
  <div class="legal">
    <strong>20歳未満の者の飲酒は法律で禁じられています。</strong><br>
    妊娠中や授乳期の飲酒は胎児・乳児の発育に影響するおそれがあります。飲酒運転は法律で禁止されています。
    このサイトは20歳以上の方を対象としており、過度な飲酒を勧めるものではありません。
  </div>
</footer>
</div>

<script id="data" type="application/json">${JSON.stringify(items)}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const MIN_REVIEWS = ${MIN_REVIEWS}, MIN_RATING = ${MIN_RATING};
  const RATED_MIN_REVIEWS = ${RATED_MIN_REVIEWS};
  const HOME_SIZE = ${HOME_SIZE_ML}, PAGE = 50;
  const state = { mode: 'cheap', home: true, genres: new Set(), shown: PAGE };
  const $ = id => document.getElementById(id);

  const NOTES = {
    cheap: '純アルコール20gあたりの価格が安い順に並べています。評価の有無は問いません。',
    value: 'レビュー' + MIN_REVIEWS + '件以上かつ評点' + MIN_RATING.toFixed(1) +
           '以上の商品に絞り、その中で20gあたりの価格が安い順に並べています。安さと評価の両立で選びたい場合に。',
    rated: 'レビュー' + RATED_MIN_REVIEWS + '件以上の商品に絞り、評点の高い順に並べています。' +
           '価格は考慮しません。おいしいものを知りたい場合に。',
  };

  function filtered() {
    let r = DATA;
    if (state.home) r = r.filter(i => i.v <= HOME_SIZE);
    if (state.genres.size) r = r.filter(i => state.genres.has(i.g));

    if (state.mode === 'value') {
      r = r.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING);
      return r.slice().sort((a, b) => a.y - b.y);
    }
    if (state.mode === 'rated') {
      r = r.filter(i => i.c >= RATED_MIN_REVIEWS);
      // 評点が同じなら件数が多いほうを上に。少数の高評価より裏付けのあるほうが信用できる。
      return r.slice().sort((a, b) => (b.r - a.r) || (b.c - a.c));
    }
    return r.slice().sort((a, b) => a.y - b.y);
  }

  const num = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
  const safe = s => s.replace(/[<>&"]/g, '');

  function render() {
    const rows = filtered();
    $('modeNote').textContent = NOTES[state.mode];
    $('count').textContent = rows.length.toLocaleString() + ' ITEMS';

    const list = $('list');
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<li class="empty">条件に合う商品がありません。絞り込みを緩めてください。</li>';
      $('more').hidden = true; $('chart').hidden = true; $('range').textContent = '';
      return;
    }

    // 目盛は表示中の集合が基準。ただし上端は95パーセンタイルで切る ——
    // 845万円のマッカラン50年のような正真正銘の高額品が1つ混じるだけで、
    // 最大値を基準にした目盛は全行が2%になって何も読み取れなくなる。
    const sorted = rows.map(i => i.y).sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const logLo = Math.log(Math.max(lo, 1));
    const logSpan = Math.max(Math.log(Math.max(hi, 2)) - logLo, 0.01);
    $('range').textContent = num(lo) + ' — ' + num(hi) + ' 円 / 20g（上位5%を除く）';

    const frag = document.createDocumentFragment();
    rows.slice(0, state.shown).forEach((i, idx) => {
      const li = document.createElement('li');
      li.className = 'row';
      const rate = i.c > 0
        ? '<span class="rate">' + i.r.toFixed(2) + ' ★ ' + i.c + '</span>'
        : '<span class="norate">評価なし</span>';
      const set = i.s > 1 ? ' ×' + i.s : '';
      // 価格は低い側に密集するので対数で割り付ける。線形だと上位が全て同じ長さになり、
      // 「この中でどのくらい安いのか」が読み取れない。
      const w = Math.max(1.5, Math.min(100, ((Math.log(i.y) - logLo) / logSpan) * 100));
      li.innerHTML =
        '<span class="rank">' + String(idx + 1).padStart(2, '0') + '</span>' +
        '<span class="name"><a href="' + i.u + '" target="_blank" rel="nofollow sponsored noopener" title="' +
          safe(i.f) + '">' + safe(i.n) + '</a></span>' +
        '<span class="price">' + num(i.y) + '<i>円/20g</i></span>' +
        '<span class="meta">' + rate +
          '<span>' + i.a + '°</span><span>' + i.v.toLocaleString() + 'ml' + set + '</span>' +
          '<span>純AL ' + num(i.w) + 'g</span><span>' + i.p.toLocaleString() + '円</span>' +
          '<span class="tag">' + i.g + '</span></span>' +
        '<span class="scale"><span style="width:' + w.toFixed(1) + '%"></span></span>';
      frag.appendChild(li);
    });
    list.appendChild(frag);
    $('more').hidden = rows.length <= state.shown;
    drawChart(rows.filter(i => i.c >= MIN_REVIEWS));
  }

  function drawChart(rows) {
    const chart = $('chart'), svg = $('scatter');
    if (rows.length < 8) { chart.hidden = true; return; }
    chart.hidden = false;
    const W = 720, H = 290, m = { t: 12, r: 12, b: 30, l: 38 };
    const xMax = Math.min(Math.max(...rows.map(i => i.y)), 600);
    const x = v => m.l + (Math.min(v, xMax) / xMax) * (W - m.l - m.r);
    const y = v => m.t + (1 - (v - 3) / 2) * (H - m.t - m.b);

    let s = '';
    for (let g = 3; g <= 5; g += 0.5) {
      s += '<line x1="' + m.l + '" y1="' + y(g) + '" x2="' + (W - m.r) + '" y2="' + y(g) +
           '" stroke="var(--line)" stroke-width="1"/>' +
           '<text x="' + (m.l - 7) + '" y="' + (y(g) + 3.5) + '" text-anchor="end" font-size="9" ' +
           'font-family="Martian Mono,monospace" fill="var(--faint)">' + g.toFixed(1) + '</text>';
    }
    for (let i = 0; i <= 4; i++) {
      const v = (xMax / 4) * i;
      s += '<text x="' + x(v) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="9" ' +
           'font-family="Martian Mono,monospace" fill="var(--faint)">' + Math.round(v) + '</text>';
    }
    rows.forEach(i => {
      const r = Math.min(2.6 + Math.log10(i.c + 1) * 2.4, 8);
      s += '<circle cx="' + x(i.y).toFixed(1) + '" cy="' + y(Math.max(3, i.r)).toFixed(1) +
           '" r="' + r.toFixed(1) + '" fill="var(--verdigris)" fill-opacity="0.4" ' +
           'stroke="var(--verdigris)" stroke-opacity="0.7" stroke-width="0.8"><title>' +
           safe(i.n).slice(0, 40) + ' — ' + num(i.y) + '円/20g ★' + i.r.toFixed(2) + '</title></circle>';
    });
    svg.innerHTML = s;
  }

  document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; state.shown = PAGE;
    document.querySelectorAll('.modes button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    try { localStorage.setItem('mode', state.mode); } catch {}
    render();
  }));

  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const on = c.getAttribute('aria-pressed') !== 'true';
    c.setAttribute('aria-pressed', String(on));
    if (c.dataset.size) state.home = on;
    else on ? state.genres.add(c.dataset.genre) : state.genres.delete(c.dataset.genre);
    state.shown = PAGE; render();
  }));

  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });

  try {
    const saved = localStorage.getItem('mode');
    if (saved && saved !== 'cheap') {
      const b = document.querySelector('[data-mode="' + saved + '"]');
      if (b) b.click();
    }
  } catch {}
  render();

  // 年齢確認。本文はHTMLに存在するのでクローラには影響しない。
  try {
    if (localStorage.getItem('age') !== 'ok') {
      const g = document.createElement('div');
      g.id = 'gate';
      g.innerHTML =
        '<div class="box"><p class="mark">AGE VERIFICATION</p><h2>20歳以上ですか？</h2>' +
        '<p>20歳未満の者の飲酒は法律で禁じられています。</p>' +
        '<button type="button" id="ageOk">20歳以上です</button>' +
        '<button type="button" class="leave" id="ageNo">20歳未満です</button></div>';
      document.body.appendChild(g);
      g.querySelector('#ageOk').addEventListener('click', () => {
        try { localStorage.setItem('age', 'ok'); } catch {}
        g.remove();
      });
      g.querySelector('#ageNo').addEventListener('click', () => { location.href = 'https://www.google.com/'; });
    }
  } catch {}
})();
</script>
</body>
</html>
`;

// 生成物に accessKey が混入していないか必ず検査してから書き出す。
// applicationId はアフィリエイトURLに仕様として含まれる公開識別子なので対象外だが、
// accessKey が漏れると第三者にAPIを叩かれる。ここを通さない限り公開しない。
function assertNoSecrets(output) {
  let env = '';
  try { env = readFileSync('.env', 'utf8'); } catch { return; }
  const secret = env.match(/^RAKUTEN_ACCESS_KEY=(.+)$/m)?.[1]?.trim();
  if (secret && secret.length >= 8 && output.includes(secret)) {
    console.error('中止: 生成物に RAKUTEN_ACCESS_KEY が含まれています。');
    process.exit(1);
  }
}
assertNoSecrets(html);

writeFileSync('dist/index.html', html);
console.log(`dist/index.html を生成しました（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB / ${items.length} 件 / コスパ優先 ${qualified} 件 / 評価優先 ${ratedCount} 件）`);
console.log('秘密鍵の混入チェック: 通過');
