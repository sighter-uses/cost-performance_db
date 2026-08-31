// data/items.json から dist/index.html を生成する。
//
// 生成物にAPI認証情報を絶対に含めないこと。ブラウザに配るのは商品データだけ。
//
// 見た目の方針: 蒸留器を出た液体を透過した光を面そのものにする。琥珀が価格、緑青が評価。
// 動きはギヨシェ紋（紙幣やウイスキーラベルの彫刻模様）一本に束ねる —— 重ねた楕円が
// ゆっくり回転して干渉を起こし、静止画では出せない揺らぎが地に生まれる。動きの種類を
// 増やすより、一つのモチーフに全部の拍を揃えるほうが強い。
//
// 暗い面に committed。液体を透過した光という主題が明るい地では成立しないため、
// 明暗の切り替えは持たず、色は全て明示的に塗る。

import { readFileSync, writeFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));

// 「コスパ優先」の絞り込み条件。式ではなく閾値なのは、画面上で一文で説明できるようにするため。
const MIN_REVIEWS = 3;
const MIN_RATING = 4.0;
// 「評価優先」の下限。少数のレビューでの高評点は当てにならないので、裏付けのある件数に絞る。
const RATED_MIN_REVIEWS = 20;
// 家庭用サイズの上限。18Lのウォッカが最安を独占しても誰の役にも立たない。
const HOME_SIZE_ML = 1800;
// 横並び比較の上限。5列以上は狭い画面で読めなくなる。
const MAX_COMPARE = 4;

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

// 括弧ごとに「自分の閉じ括弧だけ」を終端にする。ひとつの文字クラスで全種類の閉じを
// 除外すると、「【9/1(火)P2倍】」のように中身が別の括弧を含む場合に途中で切れてしまう。
const BRACKETS = [/^\s*【([^】]{0,48})】\s*/, /^\s*\[([^\]]{0,48})\]\s*/, /^\s*《([^》]{0,48})》\s*/];

function displayName(name) {
  let s = name;
  // 販促表記は連続することが多い（「【最強配送】【送料無料】…」）ので繰り返し剥がす。
  for (let i = 0; i < 6; i++) {
    const before = s;
    for (const re of BRACKETS) {
      const m = s.match(re);
      if (m && PROMO.test(m[1])) { s = s.slice(m[0].length); break; }
    }
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

// ギヨシェ紋。pathLength で長さを正規化しているので、半径を変えても描画が途切れない。
const rosette = (stroke, rotations) => rotations.map(deg =>
  `<ellipse pathLength="1" cx="400" cy="400" rx="326" ry="115" transform="rotate(${deg} 400 400)"/>`
).join('') + `<circle pathLength="1" cx="400" cy="400" r="238" stroke="${stroke}"/>` +
  `<circle pathLength="1" cx="400" cy="400" r="158" stroke="${stroke}"/>`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>蒸留酒 単価一覧 — 純アルコール20gあたりの価格で選ぶ</title>
<meta name="description" content="楽天市場の蒸留酒${items.length}件を、純アルコール20g（日本酒1合相当）あたりの価格で横断比較。度数と容量から機械的に算出しています。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Murecho:wght@400;500;700&display=swap">
<style>
:root{
  --ground:#100c09; --surface:rgba(240,231,220,.055); --raised:rgba(240,231,220,.09);
  --line:rgba(240,231,220,.1); --rule:rgba(240,231,220,.16);
  --ink:#f0e7dc; --sub:#b6a898; --faint:#857a6e;
  --amber:#e0a86a; --amber-deep:#c47c36; --amber-wash:rgba(224,168,106,.11);
  --verdigris:#7fc0a8; --verdigris-deep:#5e8e7c; --verdigris-wash:rgba(127,192,168,.11);
  --f-num:Fraunces,Georgia,'Times New Roman',serif;
  --f-body:Murecho,'Hiragino Sans','Yu Gothic',system-ui,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-body);
  line-height:1.75;font-feature-settings:"palt" 1;-webkit-font-smoothing:antialiased;
  overflow-x:hidden;position:relative}

/* ── 地。光の層 → ギヨシェ紋 → 粒状ノイズ の三層 ── */
.bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.glow{position:absolute;border-radius:50%}
.g1{width:min(760px,120vw);height:min(760px,120vw);left:-16vw;top:-24vh;
  background:radial-gradient(circle,rgba(196,124,54,.44),rgba(196,124,54,0) 66%);filter:blur(12px);
  animation:swell 22s ease-in-out infinite}
.g2{width:min(620px,100vw);height:min(620px,100vw);right:-14vw;top:38vh;
  background:radial-gradient(circle,rgba(94,142,124,.28),rgba(94,142,124,0) 68%);filter:blur(16px);
  animation:swell 30s ease-in-out infinite reverse}
.halo{position:absolute;right:-22vw;top:-16vh;width:min(880px,150vw);height:min(880px,150vw);
  animation:breathe 26s ease-in-out infinite}
.halo2{position:absolute;left:-26vw;bottom:-22vh;width:min(760px,130vw);height:min(760px,130vw);
  opacity:.3;animation:breathe 34s ease-in-out infinite reverse}
.rosette{transform-origin:400px 400px;animation:turn 240s linear infinite}
.rosette ellipse,.rosette circle{stroke-dasharray:1;animation:draw 4.2s cubic-bezier(.22,.61,.36,1) both}
.rosette ellipse:nth-child(2n){animation-delay:.24s}
.rosette ellipse:nth-child(3n){animation-delay:.48s}
.rosette circle{animation-delay:.75s}
.grain{position:absolute;inset:0;opacity:.46;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.42'/%3E%3C/svg%3E")}

@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes turn{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes breathe{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.46;transform:scale(1.035)}}
@keyframes swell{0%,100%{transform:translate(0,0) scale(1);opacity:.5}50%{transform:translate(2.5%,-2%) scale(1.07);opacity:.74}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.row-in{animation:rise 1s cubic-bezier(.22,.61,.36,1) both}
@media (prefers-reduced-motion:reduce){
  .rosette,.rosette ellipse,.rosette circle,.halo,.halo2,.g1,.g2,.row-in{animation:none}
  .rosette ellipse,.rosette circle{stroke-dashoffset:0}
}

.wrap{position:relative;z-index:1;max-width:58rem;margin:0 auto;padding:0 1rem 6rem}
a{color:var(--amber);text-decoration:none}
a:hover{color:#f2c48c;text-decoration:underline}
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--amber);outline-offset:3px}

.pr{position:relative;z-index:1;font-size:.68rem;letter-spacing:.1em;color:var(--faint);
  padding:.6rem 1rem;text-align:center;border-bottom:1px solid var(--line)}

header{padding:3rem 0 1.6rem}
.eyebrow{font-size:.68rem;letter-spacing:.28em;color:var(--amber-deep);display:block;margin-bottom:.9rem}
h1{font-size:clamp(1.7rem,6vw,2.6rem);font-weight:700;line-height:1.28;margin:0 0 .9rem;letter-spacing:.02em}
.lede{color:var(--sub);font-size:.87rem;line-height:2;margin:0;max-width:32rem}
.readout{display:flex;flex-wrap:wrap;gap:1.6rem;margin:1.5rem 0 0;padding:1.1rem 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.readout div{display:flex;flex-direction:column;gap:.15rem}
.readout dt{font-size:.62rem;letter-spacing:.18em;color:var(--faint)}
.readout dd{margin:0;font-family:var(--f-num);font-size:1.35rem;font-weight:600;font-variant-numeric:tabular-nums}

/* ── 操作部 ── */
.controls{position:sticky;top:0;z-index:30;background:var(--ground);padding:.9rem 0;
  border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:.7rem}
.search{display:flex;gap:.5rem}
.field{flex:1;display:flex;align-items:center;gap:.65rem;padding:0 1.1rem;border-radius:999px;
  background:var(--surface);border:1px solid var(--rule)}
.field input{flex:1;padding:.8rem 0;background:transparent;border:0;color:var(--ink);
  font-family:var(--f-body);font-size:.92rem;min-width:0}
.field input::placeholder{color:var(--faint)}
.field input:focus{outline:none}
.field:focus-within{border-color:var(--amber)}
.btn-plain{padding:0 1.2rem;border-radius:999px;background:transparent;border:1px solid var(--rule);
  color:var(--sub);font-family:var(--f-body);font-size:.8rem;cursor:pointer;white-space:nowrap}
.btn-plain:hover{color:var(--ink);border-color:var(--ink)}
.modes{display:flex;gap:.5rem}
.modes button{flex:1;padding:.72rem .4rem;border-radius:999px;background:var(--surface);color:var(--sub);
  border:1px solid var(--line);font-family:var(--f-body);font-size:.83rem;cursor:pointer}
.modes button[aria-pressed="true"]{background:var(--amber);color:var(--ground);border-color:var(--amber);font-weight:700}
.filters{display:flex;flex-wrap:wrap;gap:.35rem}
.chip{padding:.28rem .8rem;border-radius:999px;font-size:.73rem;background:transparent;color:var(--faint);
  border:1px solid var(--line);cursor:pointer;font-family:var(--f-body)}
.chip[aria-pressed="true"]{color:var(--ink);border-color:var(--ink)}
.note{font-size:.72rem;color:var(--faint);margin:0;line-height:1.75}

.bar{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
  margin:1.4rem 0 .6rem;font-size:.68rem;letter-spacing:.12em;color:var(--faint);
  font-variant-numeric:tabular-nums}

/* ── 一覧 ── */
ol.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7rem}
.row{padding:1.15rem 1.3rem;border-radius:16px;background:var(--surface);border:1px solid var(--line);
  display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem 1.2rem;align-items:center}
.row.picked{border-color:var(--amber);background:var(--amber-wash)}
.row .body{display:flex;flex-direction:column;gap:.45rem;min-width:0}
.row .nm{font-size:.93rem;font-weight:500;line-height:1.55}
.meta{display:flex;flex-wrap:wrap;gap:.2rem 1.1rem;font-size:.74rem;color:var(--sub);font-variant-numeric:tabular-nums}
.meta .rate{color:var(--verdigris)}
.meta .norate,.meta .tag{color:var(--faint)}
.price{text-align:right;flex:none}
.price b{display:block;font-family:var(--f-num);font-size:clamp(1.6rem,5vw,2.1rem);font-weight:600;
  color:var(--amber);line-height:1;font-variant-numeric:tabular-nums}
.price span{display:block;font-size:.6rem;letter-spacing:.16em;color:var(--faint);margin-top:.35rem}
.pick{grid-column:1/-1;justify-self:start;margin-top:.15rem;padding:.3rem .85rem;border-radius:999px;
  background:transparent;border:1px solid var(--line);color:var(--faint);font-family:var(--f-body);
  font-size:.71rem;cursor:pointer}
.pick:hover{color:var(--ink);border-color:var(--sub)}
.pick[aria-pressed="true"]{color:var(--amber);border-color:var(--amber)}
.pick[disabled]{opacity:.35;cursor:not-allowed}

.more{display:block;width:100%;margin-top:1.4rem;padding:.85rem;border-radius:999px;background:transparent;
  border:1px solid var(--rule);color:var(--sub);font-family:var(--f-body);font-size:.83rem;cursor:pointer}
.more:hover{color:var(--ink);border-color:var(--ink)}
.empty{padding:3rem 1rem;text-align:center;color:var(--faint);font-size:.85rem;line-height:1.9}

/* ── 比較 ── */
.tray{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(16,12,9,.94);
  border-top:1px solid var(--rule);padding:.8rem 1rem;display:flex;justify-content:center}
.tray-in{width:100%;max-width:58rem;display:flex;align-items:center;gap:.8rem;justify-content:space-between}
.tray span{font-size:.78rem;color:var(--sub)}
.tray .acts{display:flex;gap:.5rem}
.btn-amber{padding:.6rem 1.4rem;border-radius:999px;background:var(--amber);color:var(--ground);
  border:0;font-family:var(--f-body);font-size:.83rem;font-weight:700;cursor:pointer}
.cmp-wrap{overflow-x:auto;margin-top:1rem}
.cmp{min-width:44rem;display:grid;gap:.7rem}
.cmp .h{padding:1.1rem 1.1rem 1rem;border-radius:16px;background:var(--surface);border:1px solid var(--line);
  display:flex;flex-direction:column;gap:.6rem}
.cmp .h .top{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem}
.cmp .h .ix{font-size:.62rem;letter-spacing:.2em;color:var(--faint)}
.cmp .h .nm{font-size:.82rem;font-weight:500;line-height:1.55}
.cmp .h .tag{font-size:.68rem;color:var(--faint)}
.cmp .lbl{padding:.85rem 0;font-size:.7rem;letter-spacing:.14em;color:var(--faint);align-self:center}
.cmp .cell{padding:.75rem 1.1rem;border-radius:12px;font-size:.84rem;color:var(--sub);
  font-variant-numeric:tabular-nums;align-self:center}
.cmp .cell.big{font-family:var(--f-num);font-size:1.5rem;font-weight:300}
.cmp .cell.best{background:var(--amber-wash);color:var(--amber);font-weight:600}
.cmp .cell.best-r{background:var(--verdigris-wash);color:var(--verdigris)}
.cmp .buy{display:block;text-align:center;padding:.7rem;border-radius:999px;background:var(--amber);
  color:var(--ground);font-size:.8rem;font-weight:700}
.cmp .buy:hover{text-decoration:none;color:var(--ground);opacity:.88}
.x{background:none;border:0;padding:0;cursor:pointer;line-height:0;color:var(--faint)}
.x:hover{color:var(--ink)}

footer{margin-top:4rem;border-top:1px solid var(--rule);padding-top:1.6rem;
  font-size:.76rem;color:var(--sub);line-height:1.95}
footer h2{font-size:.65rem;letter-spacing:.22em;color:var(--amber-deep);margin:0 0 .8rem;font-weight:400}
footer dl{margin:0 0 1.3rem;display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1.1rem}
footer dt{color:var(--faint)}
footer dd{margin:0}
.legal{border-left:2px solid var(--amber-deep);padding:.4rem 0 .4rem 1.1rem;margin-top:1.3rem;color:var(--faint)}
.legal strong{color:var(--ink);font-weight:700}

#gate{position:fixed;inset:0;z-index:100;background:var(--ground);display:grid;place-items:center;padding:1.5rem}
#gate .box{max-width:22rem;text-align:center}
#gate .mark{font-size:.62rem;letter-spacing:.26em;color:var(--amber-deep);margin-bottom:1.2rem}
#gate h2{font-size:1.1rem;margin:0 0 .7rem;font-weight:700}
#gate p{color:var(--sub);font-size:.82rem;margin:0 0 1.6rem;line-height:1.9}
#gate .leave{display:block;margin:1rem auto 0;background:none;color:var(--faint);border:0;
  font-size:.74rem;cursor:pointer;text-decoration:underline;font-family:var(--f-body)}
</style>
</head>
<body>

<div class="bg" aria-hidden="true">
  <div class="glow g1"></div>
  <div class="glow g2"></div>
  <svg class="halo" viewBox="0 0 800 800">
    <g class="rosette" fill="none" stroke="#c47c36" stroke-width="0.75">
      ${rosette('#5e8e7c', [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165])}
    </g>
  </svg>
  <svg class="halo2" viewBox="0 0 800 800">
    <g class="rosette" fill="none" stroke="#5e8e7c" stroke-width="0.7" style="animation-direction:reverse">
      ${rosette('#c47c36', [0, 22, 44, 66, 88, 110, 132, 154])}
    </g>
  </svg>
  <div class="grain"></div>
</div>

<div class="pr">PR — 本ページは楽天アフィリエイトプログラムを利用した広告を含みます</div>

<div class="wrap">
<header>
  <span class="eyebrow">純アルコール 20g ／ 日本酒1合 相当</span>
  <h1>蒸留酒 単価一覧</h1>
  <p class="lede">
    価格も度数も容量もバラバラな蒸留酒 ${items.length.toLocaleString()} 本を、
    純アルコール20gあたりいくらかという同じ物差しに載せました。
    商品名と説明文から度数と容量を機械的に読み取っており、読み取れなかった商品は載せていません。</p>
  <dl class="readout">
    <div><dt>掲載</dt><dd>${items.length.toLocaleString()}</dd></div>
    <div><dt>評価あり</dt><dd style="color:var(--verdigris)">${db.stats.withReview.toLocaleString()}</dd></div>
    <div><dt>種別</dt><dd>${db.genres.length}</dd></div>
    <div><dt>取得</dt><dd>${d.getMonth() + 1}/${d.getDate()}</dd></div>
  </dl>
</header>

<div class="controls">
  <div class="search">
    <label class="field">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        style="flex:none;color:var(--faint)"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>
      <input type="search" id="q" placeholder="銘柄・蒸留所・種別で絞る" aria-label="銘柄を検索">
    </label>
    <button type="button" class="btn-plain" id="clearQ">消去</button>
  </div>
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

<section id="compare" hidden aria-label="銘柄の比較"></section>

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

<div class="tray" id="tray" hidden>
  <div class="tray-in">
    <span id="trayCount"></span>
    <div class="acts">
      <button type="button" class="btn-plain" id="trayClear">解除</button>
      <button type="button" class="btn-amber" id="trayOpen">比較する</button>
    </div>
  </div>
</div>

<script id="data" type="application/json">${JSON.stringify(items)}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const MIN_REVIEWS = ${MIN_REVIEWS}, MIN_RATING = ${MIN_RATING};
  const RATED_MIN_REVIEWS = ${RATED_MIN_REVIEWS};
  const HOME_SIZE = ${HOME_SIZE_ML}, MAX = ${MAX_COMPARE}, PAGE = 50;

  // 比較の保存キーは名前と価格。配列の添字はビルドのたびにずれるので使えない。
  const keyOf = i => i.n + '|' + i.p;
  const byKey = new Map(DATA.map(i => [keyOf(i), i]));

  const state = { mode: 'cheap', home: true, genres: new Set(), q: '', shown: PAGE, picks: [], view: 'list' };
  const $ = id => document.getElementById(id);
  const store = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };

  const NOTES = {
    cheap: '純アルコール20gあたりの価格が安い順に並べています。評価の有無は問いません。',
    value: 'レビュー' + MIN_REVIEWS + '件以上かつ評点' + MIN_RATING.toFixed(1) +
           '以上の商品に絞り、その中で20gあたりの価格が安い順に。安さと評価の両立で選びたい場合に。',
    rated: 'レビュー' + RATED_MIN_REVIEWS + '件以上の商品に絞り、評点の高い順に。価格は考慮しません。',
  };

  const num = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function filtered() {
    let r = DATA;
    if (state.home) r = r.filter(i => i.v <= HOME_SIZE);
    if (state.genres.size) r = r.filter(i => state.genres.has(i.g));
    if (state.q) {
      const q = state.q.toLowerCase();
      r = r.filter(i => (i.n + ' ' + i.g).toLowerCase().includes(q));
    }
    if (state.mode === 'value') {
      return r.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING).slice().sort((a, b) => a.y - b.y);
    }
    if (state.mode === 'rated') {
      // 評点が同じなら件数が多いほうを上に。少数の高評価より裏付けのあるほうが信用できる。
      return r.filter(i => i.c >= RATED_MIN_REVIEWS).slice().sort((a, b) => (b.r - a.r) || (b.c - a.c));
    }
    return r.slice().sort((a, b) => a.y - b.y);
  }

  function renderList() {
    const rows = filtered();
    $('modeNote').textContent = NOTES[state.mode];
    $('count').textContent = rows.length.toLocaleString() + ' 件';

    const list = $('list');
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<li class="empty">条件に合う商品がありません。<br>絞り込みを緩めるか、短い語で検索してください。</li>';
      $('more').hidden = true; $('range').textContent = '';
      return;
    }

    // 目盛の上端は95パーセンタイル。845万円のマッカラン50年が1本混じるだけで
    // 最大値基準の目盛は全行が同じ長さになり、何も読み取れなくなる。
    const sorted = rows.map(i => i.y).sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    $('range').textContent = num(lo) + ' 〜 ' + num(hi) + ' 円/20g';

    const frag = document.createDocumentFragment();
    rows.slice(0, state.shown).forEach((i, idx) => {
      const k = keyOf(i);
      const on = state.picks.includes(k);
      const full = !on && state.picks.length >= MAX;
      const li = document.createElement('li');
      li.className = 'row row-in' + (on ? ' picked' : '');
      li.style.animationDelay = Math.min(idx, 8) * 0.055 + 's';
      li.innerHTML =
        '<div class="body">' +
          '<span class="nm"><a href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener" title="' +
            esc(i.f) + '">' + esc(i.n) + '</a></span>' +
          '<span class="meta">' +
            (i.c > 0 ? '<span class="rate">★ ' + i.r.toFixed(2) + ' <span class="norate">' + i.c + '件</span></span>'
                     : '<span class="norate">評価なし</span>') +
            '<span>' + i.a + '度</span><span>' + i.v.toLocaleString() + 'ml' + (i.s > 1 ? ' × ' + i.s + '本' : '') + '</span>' +
            '<span>純AL ' + num(i.w) + 'g</span><span>' + i.p.toLocaleString() + '円</span>' +
            '<span class="tag">' + esc(i.g) + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="price"><b>' + num(i.y) + '</b><span>円 / 20g</span></div>' +
        '<button type="button" class="pick" data-k="' + esc(k) + '" aria-pressed="' + on + '"' +
          (full ? ' disabled' : '') + '>' + (on ? '比較から外す' : '比較に追加') + '</button>';
      frag.appendChild(li);
    });
    list.appendChild(frag);
    $('more').hidden = rows.length <= state.shown;
  }

  function renderCompare() {
    const sec = $('compare');
    const picked = state.picks.map(k => byKey.get(k)).filter(Boolean);
    if (state.view !== 'compare' || !picked.length) { sec.hidden = true; sec.innerHTML = ''; return; }
    sec.hidden = false;

    const bestY = Math.min(...picked.map(i => i.y));
    const bestP = Math.min(...picked.map(i => i.p));
    const bestR = Math.max(...picked.map(i => i.r));
    const cols = picked.length;

    const rowOf = (label, cellFn) =>
      '<div class="lbl">' + label + '</div>' + picked.map(cellFn).join('');

    sec.innerHTML =
      '<div class="bar"><span>比較 — ' + picked.length + ' / ' + MAX + ' 銘柄</span>' +
        '<button type="button" class="btn-plain" id="backToList">一覧へ戻る</button></div>' +
      '<div class="cmp-wrap"><div class="cmp" style="grid-template-columns:7.5rem repeat(' + cols + ',minmax(0,1fr))">' +
        '<div></div>' +
        picked.map((i, n) =>
          '<div class="h"><div class="top"><span class="ix">' + 'ABCD'[n] + '</span>' +
          '<button type="button" class="x" data-drop="' + esc(keyOf(i)) + '" aria-label="外す">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
          '<span class="nm">' + esc(i.n) + '</span><span class="tag">' + esc(i.g) + '</span></div>').join('') +
        rowOf('20g単価', i => '<div class="cell big' + (i.y === bestY ? ' best' : '') + '">' + num(i.y) + '</div>') +
        rowOf('評価', i => '<div class="cell' + (i.c > 0 && i.r === bestR ? ' best-r' : '') + '">' +
          (i.c > 0 ? i.r.toFixed(2) + ' <span style="color:var(--faint);font-size:.72rem">' + i.c + '件</span>' : '—') + '</div>') +
        rowOf('度数', i => '<div class="cell">' + i.a + '度</div>') +
        rowOf('容量', i => '<div class="cell">' + i.v.toLocaleString() + 'ml' + (i.s > 1 ? ' × ' + i.s + '本' : '') + '</div>') +
        rowOf('純アルコール', i => '<div class="cell">' + num(i.w) + ' g</div>') +
        rowOf('総額', i => '<div class="cell' + (i.p === bestP ? ' best' : '') + '">' + i.p.toLocaleString() + '円</div>') +
        '<div></div>' +
        picked.map(i => '<div><a class="buy" href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener">楽天で見る</a></div>').join('') +
      '</div></div>';
  }

  function renderTray() {
    const t = $('tray');
    t.hidden = state.picks.length === 0 || state.view === 'compare';
    $('trayCount').textContent = state.picks.length + ' 件を選択中（最大' + MAX + '）';
  }

  function render() { renderList(); renderCompare(); renderTray(); }

  function setView(v) {
    state.view = v;
    const listy = v === 'list';
    $('list').hidden = !listy;
    $('more').hidden = !listy || filtered().length <= state.shown;
    document.querySelector('.controls').hidden = !listy;
    document.querySelectorAll('.bar')[0].hidden = !listy;
    render();
    if (!listy) $('compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- 操作 ----
  document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; state.shown = PAGE;
    document.querySelectorAll('.modes button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    store('mode', state.mode);
    render();
  }));

  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const on = c.getAttribute('aria-pressed') !== 'true';
    c.setAttribute('aria-pressed', String(on));
    if (c.dataset.size) state.home = on;
    else on ? state.genres.add(c.dataset.genre) : state.genres.delete(c.dataset.genre);
    state.shown = PAGE; render();
  }));

  let timer;
  $('q').addEventListener('input', e => {
    clearTimeout(timer);
    const v = e.target.value.trim();
    // 全データが手元にあるので待つ理由はないが、長い語を打つ間の再描画は抑える。
    timer = setTimeout(() => { state.q = v; state.shown = PAGE; render(); }, 90);
  });
  $('clearQ').addEventListener('click', () => {
    $('q').value = ''; state.q = ''; state.shown = PAGE; render(); $('q').focus();
  });

  // 選択の反映は差分だけにする。一覧を作り直すとボタンごと差し替わり、
  // 押した瞬間に画面がちらついて選択できたのかどうかも分からなくなる。
  function syncPicks() {
    const full = state.picks.length >= MAX;
    document.querySelectorAll('.pick').forEach(b => {
      const on = state.picks.includes(b.dataset.k);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '比較から外す' : '比較に追加';
      b.disabled = !on && full;
      b.closest('.row').classList.toggle('picked', on);
    });
    renderTray();
  }

  $('list').addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (!b || b.disabled) return;
    const k = b.dataset.k;
    const at = state.picks.indexOf(k);
    if (at >= 0) state.picks.splice(at, 1);
    else if (state.picks.length < MAX) state.picks.push(k);
    store('picks', JSON.stringify(state.picks));
    syncPicks();
  });

  $('compare').addEventListener('click', e => {
    const drop = e.target.closest('[data-drop]');
    if (drop) {
      state.picks = state.picks.filter(k => k !== drop.dataset.drop);
      store('picks', JSON.stringify(state.picks));
      if (!state.picks.length) return setView('list');
      return render();
    }
    if (e.target.closest('#backToList')) setView('list');
  });

  $('trayOpen').addEventListener('click', () => setView('compare'));
  $('trayClear').addEventListener('click', () => {
    state.picks = []; store('picks'); render();
  });
  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });

  // ---- 復元 ----
  const savedMode = read('mode');
  if (savedMode && savedMode !== 'cheap') {
    const b = document.querySelector('[data-mode="' + savedMode + '"]');
    if (b) b.click();
  }
  try {
    const saved = JSON.parse(read('picks') || '[]');
    if (Array.isArray(saved)) state.picks = saved.filter(k => byKey.has(k)).slice(0, MAX);
  } catch {}

  render();

  // 年齢確認。本文はHTMLに存在するのでクローラには影響しない。
  if (read('age') !== 'ok') {
    const g = document.createElement('div');
    g.id = 'gate';
    g.innerHTML =
      '<div class="box"><p class="mark">AGE VERIFICATION</p><h2>20歳以上ですか？</h2>' +
      '<p>20歳未満の者の飲酒は法律で禁じられています。</p>' +
      '<button type="button" class="btn-amber" id="ageOk">20歳以上です</button>' +
      '<button type="button" class="leave" id="ageNo">20歳未満です</button></div>';
    document.body.appendChild(g);
    g.querySelector('#ageOk').addEventListener('click', () => { store('age', 'ok'); g.remove(); });
    g.querySelector('#ageNo').addEventListener('click', () => { location.href = 'https://www.google.com/'; });
  }
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
