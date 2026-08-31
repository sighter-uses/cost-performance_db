// data/items.json から dist/index.html を生成する。
//
// 生成物にAPI認証情報を絶対に含めないこと。ブラウザに配るのは商品データだけ。

import { readFileSync, writeFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));

// 「満足度優先」の絞り込み条件。式ではなく閾値にしているのは、
// 画面上で一文で説明できるようにするため。説明できない順位付けは信用されない。
const MIN_REVIEWS = 3;
const MIN_RATING = 4.0;
// 家庭用サイズの上限。18Lのウォッカが最安を独占しても誰の役にも立たない。
const HOME_SIZE_ML = 1800;

// ブラウザに渡す分だけに絞る。キーを短縮して転送量を抑える。
const items = db.items.map(i => ({
  n: i.name,
  p: i.price,
  u: i.url,
  g: i.genre,
  a: i.abv,
  v: i.volumeMl,
  s: i.setCount,
  t: i.totalMl,
  w: i.pureAlcoholG,
  y: i.yenPerUnit,
  r: i.reviewAverage,
  c: i.reviewCount,
}));

const genres = [...new Set(items.map(i => i.g))].sort();
const qualified = items.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING).length;
const fetchedAt = new Date(db.fetchedAt);
const stamp = `${fetchedAt.getFullYear()}年${fetchedAt.getMonth() + 1}月${fetchedAt.getDate()}日`;

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>蒸留酒コスパ比較 — 純アルコール20gあたりの価格で選ぶ</title>
<meta name="description" content="楽天市場の蒸留酒${items.length}件を、純アルコール20g（日本酒1合相当）あたりの価格で横断比較。度数と容量から機械的に算出しています。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap">
<style>
:root{
  --bg:#f7f6f3; --surface:#fffefc; --line:#e2ded6; --rule:#c9c3b8;
  --ink:#1d1b17; --sub:#5f5950; --faint:#8d867c;
  --accent:#8a5524; --accent-soft:#f0e5d8; --on-accent:#fffefc;
  --good:#2f6d4f; --warn:#9a3f2c;
  --f-body:"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",system-ui,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#14130f; --surface:#1c1a16; --line:#2c2924; --rule:#3d3931;
  --ink:#e9e5dd; --sub:#a8a196; --faint:#7d766b;
  --accent:#d09a5e; --accent-soft:#2e2519; --on-accent:#14130f;
  --good:#6aab88; --warn:#d08a72;
}}
:root[data-theme="dark"]{
  --bg:#14130f; --surface:#1c1a16; --line:#2c2924; --rule:#3d3931;
  --ink:#e9e5dd; --sub:#a8a196; --faint:#7d766b;
  --accent:#d09a5e; --accent-soft:#2e2519; --on-accent:#14130f;
  --good:#6aab88; --warn:#d08a72;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);
  line-height:1.75;font-feature-settings:"palt" 1;-webkit-font-smoothing:antialiased}
.wrap{max-width:60rem;margin:0 auto;padding:0 1rem 5rem}

/* ---- 広告表示。景表法の要請なので隠さず最初に出す ---- */
.pr{background:var(--accent-soft);color:var(--sub);font-size:.76rem;letter-spacing:.04em;
  padding:.55rem 1rem;text-align:center;border-bottom:1px solid var(--line)}

header{padding:2rem 0 1.2rem;border-bottom:2px solid var(--ink)}
h1{font-size:clamp(1.4rem,4.5vw,2rem);font-weight:900;line-height:1.35;margin:0 0 .5rem;letter-spacing:-.01em}
.lede{color:var(--sub);font-size:.92rem;margin:0;max-width:36rem}

/* ---- 操作部 ---- */
.controls{position:sticky;top:0;z-index:20;background:var(--bg);
  padding:.9rem 0;border-bottom:1px solid var(--line);margin-bottom:.2rem}
.modes{display:flex;gap:0;border:1px solid var(--rule);border-radius:2px;overflow:hidden;margin-bottom:.8rem}
.modes button{flex:1;appearance:none;border:0;background:var(--surface);color:var(--sub);
  font-family:inherit;font-size:.88rem;font-weight:500;padding:.7rem .5rem;cursor:pointer;
  border-right:1px solid var(--line)}
.modes button:last-child{border-right:0}
.modes button[aria-pressed="true"]{background:var(--accent);color:var(--on-accent);font-weight:700}
.modes button:focus-visible{outline:2px solid var(--accent);outline-offset:-4px}

.filters{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.chip{appearance:none;font-family:inherit;font-size:.78rem;padding:.3rem .7rem;cursor:pointer;
  background:var(--surface);color:var(--sub);border:1px solid var(--line);border-radius:999px}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.note{font-size:.78rem;color:var(--faint);margin:.7rem 0 0;line-height:1.7}
.count{font-family:var(--f-mono);font-size:.8rem;color:var(--sub);margin:1.1rem 0 .5rem;
  font-variant-numeric:tabular-nums}

/* ---- 一覧 ---- */
ol.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;background:var(--line)}
.row{background:var(--surface);padding:.9rem 1rem;display:grid;
  grid-template-columns:1fr auto;gap:.15rem .9rem;align-items:baseline}
.rank{font-family:var(--f-mono);font-size:.72rem;color:var(--faint);grid-column:1/-1}
.name{font-size:.9rem;line-height:1.6;font-weight:500;min-width:0}
.name a{color:var(--ink);text-decoration:none}
.name a:hover{text-decoration:underline;text-decoration-color:var(--accent)}
.name a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.unit{font-family:var(--f-mono);font-size:1.15rem;font-weight:500;color:var(--accent);
  font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.unit small{display:block;font-size:.62rem;color:var(--faint);font-weight:400;letter-spacing:.04em}
.meta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.15rem .9rem;
  font-family:var(--f-mono);font-size:.74rem;color:var(--sub);font-variant-numeric:tabular-nums}
.meta .star{color:var(--good)}
.meta .none{color:var(--faint)}
.more{display:block;width:100%;margin-top:1rem;padding:.8rem;background:var(--surface);
  border:1px solid var(--rule);color:var(--ink);font-family:inherit;font-size:.86rem;cursor:pointer}
.more:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.empty{background:var(--surface);padding:2rem 1rem;text-align:center;color:var(--sub);font-size:.9rem}

/* ---- 散布図（広い画面のみ） ---- */
.chart{display:none;margin:1.6rem 0 0;background:var(--surface);border:1px solid var(--line);padding:1rem}
@media (min-width:52rem){.chart{display:block}}
.chart h2{font-size:.82rem;font-weight:700;margin:0 0 .2rem;color:var(--sub);letter-spacing:.04em}
.chart p{font-size:.74rem;color:var(--faint);margin:0 0 .6rem}
.chart svg{width:100%;height:auto;display:block}

/* ---- footer ---- */
footer{margin-top:3rem;border-top:1px solid var(--rule);padding-top:1.4rem;
  font-size:.79rem;color:var(--sub);line-height:1.9}
footer h2{font-size:.72rem;font-family:var(--f-mono);letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);margin:0 0 .6rem;font-weight:500}
footer dl{margin:0 0 1.4rem;display:grid;grid-template-columns:max-content 1fr;gap:.2rem .9rem}
footer dt{color:var(--faint)}
footer dd{margin:0}
.legal{border:1px solid var(--rule);border-left:3px solid var(--warn);padding:.9rem 1rem;
  background:var(--surface);margin-top:1.2rem}
.legal strong{color:var(--ink)}

/* ---- 年齢確認。JSで描画するのでクローラは本文を読める ---- */
#gate{position:fixed;inset:0;z-index:100;background:var(--bg);display:grid;place-items:center;padding:1.5rem}
#gate .box{max-width:24rem;text-align:center}
#gate h2{font-size:1.1rem;margin:0 0 .8rem}
#gate p{color:var(--sub);font-size:.86rem;margin:0 0 1.4rem}
#gate button{font-family:inherit;font-size:.92rem;padding:.75rem 2rem;cursor:pointer;
  background:var(--accent);color:var(--on-accent);border:0}
#gate .leave{display:block;margin:.9rem auto 0;background:none;color:var(--faint);
  border:0;font-size:.8rem;cursor:pointer;text-decoration:underline}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="pr">本ページは楽天アフィリエイトプログラムを利用した広告を含みます（PR）</div>

<div class="wrap">
<header>
  <h1>蒸留酒コスパ比較</h1>
  <p class="lede">
    楽天市場の蒸留酒 ${items.length.toLocaleString()} 件を、
    <strong>純アルコール20g（日本酒1合相当）あたりの価格</strong>で横断比較します。
    商品名と商品説明から度数と容量を機械的に読み取って算出しており、読み取れなかった商品は掲載していません。
  </p>
</header>

<div class="controls">
  <div class="modes" role="group" aria-label="並び順">
    <button type="button" data-mode="cheap" aria-pressed="true">安さ優先</button>
    <button type="button" data-mode="rated" aria-pressed="false">満足度優先</button>
  </div>
  <div class="filters">
    <button type="button" class="chip" data-size="home" aria-pressed="true">家庭用サイズ</button>
    ${genres.map(g => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('\n    ')}
  </div>
  <p class="note" id="modeNote"></p>
</div>

<p class="count" id="count"></p>
<ol class="list" id="list"></ol>
<button type="button" class="more" id="more" hidden>さらに表示</button>

<section class="chart" id="chart" hidden>
  <h2>評価と価格の関係</h2>
  <p>横軸が純アルコール20gあたりの価格、縦軸がレビュー評点。左上にあるほど「安くて評価が高い」。</p>
  <svg id="scatter" viewBox="0 0 720 300" role="img" aria-label="評価と価格の散布図"></svg>
</section>

<footer>
  <h2>このデータについて</h2>
  <dl>
    <dt>取得日</dt><dd>${stamp}</dd>
    <dt>データ元</dt><dd>${esc(db.source)}</dd>
    <dt>対象</dt><dd>${db.genres.map(esc).join('、')}</dd>
    <dt>掲載件数</dt><dd>${items.length.toLocaleString()} 件（うちレビューあり ${db.stats.withReview.toLocaleString()} 件）</dd>
    <dt>除外</dt><dd>度数が読み取れなかった ${db.stats.dropped.abv.toLocaleString()} 件、容量が読み取れなかった ${db.stats.dropped.volume.toLocaleString()} 件</dd>
    <dt>計算式</dt><dd>純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8。これを20gあたりの価格に換算</dd>
  </dl>
  <p>
    価格は取得時点のもので、実際の販売価格・在庫と異なる場合があります。購入前に販売ページでご確認ください。
    ポイント還元は price に含めていません。
  </p>
  <div class="legal">
    <strong>20歳未満の者の飲酒は法律で禁じられています。</strong><br>
    妊娠中や授乳期の飲酒は、胎児・乳児の発育に影響するおそれがあります。飲酒運転は法律で禁止されています。
    このサイトは20歳以上の方を対象としており、過度な飲酒を勧めるものではありません。
  </div>
</footer>
</div>

<script id="data" type="application/json">${JSON.stringify(items)}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const MIN_REVIEWS = ${MIN_REVIEWS}, MIN_RATING = ${MIN_RATING}, HOME_SIZE = ${HOME_SIZE_ML};
  const PAGE = 50;

  const state = { mode: 'cheap', home: true, genres: new Set(), shown: PAGE };
  const $ = id => document.getElementById(id);

  const NOTES = {
    cheap: '純アルコール20gあたりの価格が安い順。レビューの有無は問いません。',
    rated: 'レビュー' + MIN_REVIEWS + '件以上かつ評点' + MIN_RATING.toFixed(1) +
           '以上の商品だけに絞り、その中で20gあたりの価格が安い順に並べています。',
  };

  function filtered() {
    let r = DATA;
    if (state.home) r = r.filter(i => i.v <= HOME_SIZE);
    if (state.genres.size) r = r.filter(i => state.genres.has(i.g));
    if (state.mode === 'rated') r = r.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING);
    return r.slice().sort((a, b) => a.y - b.y);
  }

  const yen = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

  function render() {
    const rows = filtered();
    $('modeNote').textContent = NOTES[state.mode];
    $('count').textContent = rows.length.toLocaleString() + ' 件';

    const list = $('list');
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<li class="empty">条件に合う商品がありません。絞り込みを緩めてください。</li>';
      $('more').hidden = true;
      $('chart').hidden = true;
      return;
    }

    const frag = document.createDocumentFragment();
    rows.slice(0, state.shown).forEach((i, idx) => {
      const li = document.createElement('li');
      li.className = 'row';
      const rating = i.c > 0
        ? '<span class="star">★' + i.r.toFixed(2) + '</span> <span>(' + i.c + '件)</span>'
        : '<span class="none">レビューなし</span>';
      const set = i.s > 1 ? ' × ' + i.s + '本' : '';
      li.innerHTML =
        '<span class="rank">' + (idx + 1) + '</span>' +
        '<span class="name"><a href="' + i.u + '" target="_blank" rel="nofollow sponsored noopener">' +
          i.n.replace(/[<>&]/g, '') + '</a></span>' +
        '<span class="unit">' + yen(i.y) + '<small>円 / 20g</small></span>' +
        '<span class="meta">' + rating +
          '<span>' + i.a + '度</span><span>' + i.v.toLocaleString() + 'ml' + set + '</span>' +
          '<span>純アルコール ' + yen(i.w) + 'g</span>' +
          '<span>' + i.p.toLocaleString() + '円</span>' +
          '<span>' + i.g + '</span></span>';
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

    const W = 720, H = 300, m = { t: 14, r: 14, b: 34, l: 42 };
    const xs = rows.map(i => i.y);
    const xMax = Math.min(Math.max(...xs), 600);
    const x = v => m.l + (Math.min(v, xMax) / xMax) * (W - m.l - m.r);
    const y = v => m.t + (1 - (v - 3) / 2) * (H - m.t - m.b);

    let s = '';
    for (let g = 3; g <= 5; g += 0.5) {
      s += '<line x1="' + m.l + '" y1="' + y(g) + '" x2="' + (W - m.r) + '" y2="' + y(g) +
           '" stroke="var(--line)" stroke-width="1"/>' +
           '<text x="' + (m.l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" font-size="10" fill="var(--faint)">' + g.toFixed(1) + '</text>';
    }
    for (let i = 0; i <= 4; i++) {
      const v = (xMax / 4) * i;
      s += '<text x="' + x(v) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="var(--faint)">' + Math.round(v) + '円</text>';
    }
    rows.forEach(i => {
      const r = Math.min(3 + Math.log10(i.c + 1) * 2.5, 8);
      s += '<circle cx="' + x(i.y).toFixed(1) + '" cy="' + y(Math.max(3, i.r)).toFixed(1) +
           '" r="' + r.toFixed(1) + '" fill="var(--accent)" fill-opacity="0.42"><title>' +
           i.n.slice(0, 40).replace(/[<>&"]/g, '') + ' — ' + yen(i.y) + '円/20g ★' + i.r.toFixed(2) + '</title></circle>';
    });
    svg.innerHTML = s;
  }

  document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; state.shown = PAGE;
    document.querySelectorAll('.modes button').forEach(o =>
      o.setAttribute('aria-pressed', String(o === b)));
    try { localStorage.setItem('mode', state.mode); } catch {}
    render();
  }));

  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const on = c.getAttribute('aria-pressed') !== 'true';
    c.setAttribute('aria-pressed', String(on));
    if (c.dataset.size) state.home = on;
    else on ? state.genres.add(c.dataset.genre) : state.genres.delete(c.dataset.genre);
    state.shown = PAGE;
    render();
  }));

  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });

  try {
    const saved = localStorage.getItem('mode');
    if (saved === 'rated') document.querySelector('[data-mode="rated"]').click();
  } catch {}

  render();

  // 年齢確認。本文はHTMLに存在するのでクローラには影響しない。
  try {
    if (localStorage.getItem('age') !== 'ok') {
      const g = document.createElement('div');
      g.id = 'gate';
      g.innerHTML =
        '<div class="box"><h2>20歳以上ですか？</h2>' +
        '<p>20歳未満の者の飲酒は法律で禁じられています。</p>' +
        '<button type="button" id="ageOk">20歳以上です</button>' +
        '<button type="button" class="leave" id="ageNo">20歳未満です</button></div>';
      document.body.appendChild(g);
      g.querySelector('#ageOk').addEventListener('click', () => {
        try { localStorage.setItem('age', 'ok'); } catch {}
        g.remove();
      });
      g.querySelector('#ageNo').addEventListener('click', () => {
        location.href = 'https://www.google.com/';
      });
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
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/index.html を生成しました（${kb} KB / ${items.length} 件 / 満足度優先の対象 ${qualified} 件）`);
console.log('秘密鍵の混入チェック: 通過');
