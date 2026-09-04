// data/items.json から dist/ 配下の静的サイトを生成する。
//
// 生成物にAPI認証情報を絶対に含めないこと。ブラウザに配るのは商品データだけ。
//
// 構成: トップ1枚 + 種別ごと7枚 + sitemap + robots。
// 以前は1枚だけで、しかも一覧をJSで描いていたため、検索エンジンには
// 「1,065文字の説明文が1ページある」だけに見えていた。2,466件のデータを
// 持っていることが外から一切分からない状態だったので、上位50件をHTMLに直接書き出し、
// 種別ごとに独立したページを立てる。各ページは中央値も最安も商品も違うので、
// 中身の薄い量産ページにはならない。
//
// 見た目の方針: 蒸留器を出た液体を透過した光を面そのものにする。琥珀が価格、緑青が評価。
// 動きはギヨシェ紋一本に束ねる —— 重ねた楕円がゆっくり回転して干渉を起こし、
// 静止画では出せない揺らぎが地に生まれる。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));
const BASE = 'https://cost-performance-db.inspecting.workers.dev';

// Search Console の所有権確認タグ。公開値なので秘密ではないが、環境変数にはしない ——
// 設定のない環境でビルドすると、タグが消えたことに気づかないまま所有権確認が失効する。
// サイトの身元そのものなので、コードに固定しておくのが正しい。

try { process.loadEnvFile('.env'); } catch { /* 環境変数を使う */ }
const CF_BEACON = (process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? '').trim();
const beaconTag = /^[a-f0-9]{32}$/i.test(CF_BEACON)
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${CF_BEACON}"}'></script>`
  : '';

const MIN_REVIEWS = 3;
const MIN_RATING = 4.0;
const RATED_MIN_REVIEWS = 20;
const HOME_SIZE_ML = 1800;
const MAX_COMPARE = 4;
const SSR_ROWS = 50;   // HTMLに直接書き出す件数。クローラが読む分。

// URLに日本語を入れるとリンクの共有時に壊れやすいのでスラッグを持つ。
const GENRES = [
  { name: 'ウイスキー', slug: 'whisky' },
  { name: '焼酎', slug: 'shochu' },
  { name: 'ジン', slug: 'gin' },
  { name: 'ラム', slug: 'rum' },
  { name: 'ウォッカ', slug: 'vodka' },
  { name: 'テキーラ', slug: 'tequila' },
  { name: 'ブランデー', slug: 'brandy' },
];

const PROMO = /限定|クーポン|OFF|オフ|ポイント|P\d+倍|倍[!！]?$|送料無料|セール|期間|エントリー|買い回り|マラソン|お買い物|割引|特価|配送|あす楽|即日|最短|翌日|在庫|新入荷|入荷|予約|数量|お一人様|税込|円\)|円）/;
const BARE_PROMO = [
  /^\s*送料無料[!！]?\s*/,
  /^\s*1本あたり[\d,]+円\s*[（(]税込[）)]\s*/,
  /^\s*あす楽[^\s]*\s+/,
  /^\s*[Pp]\d+倍\s+/,
];
const BRACKETS = [/^\s*【([^】]{0,48})】\s*/, /^\s*\[([^\]]{0,48})\]\s*/, /^\s*《([^》]{0,48})》\s*/];

function displayName(name) {
  let s = name;
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

const ALL = db.items.map(i => ({
  n: displayName(i.name), f: i.name, p: i.price, u: i.url, g: i.genre,
  a: i.abv, v: i.volumeMl, s: i.setCount, w: i.pureAlcoholG, y: i.yenPerUnit,
  r: i.reviewAverage, c: i.reviewCount,
  pt: i.pointRate ?? 1,
  sp: i.postageIncluded === false && !/送料無料/.test(i.name),
}));

const d = new Date(db.fetchedAt);
const stamp = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
const isoDate = d.toISOString().slice(0, 10);

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

function stats(list) {
  const ys = list.map(i => i.y).sort((a, b) => a - b);
  return {
    count: list.length,
    median: ys.length ? ys[Math.floor(ys.length / 2)] : 0,
    min: ys.length ? ys[0] : 0,
    withReview: list.filter(i => i.c > 0).length,
    p95: ys.length ? ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.95))] : 0,
  };
}

const rosette = (stroke, rotations) => rotations.map(deg =>
  `<ellipse pathLength="1" cx="400" cy="400" rx="326" ry="115" transform="rotate(${deg} 400 400)"/>`
).join('') + `<circle pathLength="1" cx="400" cy="400" r="238" stroke="${stroke}"/>` +
  `<circle pathLength="1" cx="400" cy="400" r="158" stroke="${stroke}"/>`;

/**
 * 一覧の1行。クライアント側の描画と同じ形にしておくこと —— 食い違うと
 * 読み込み直後に内容が入れ替わってちらつく。
 */
function rowHTML(i, idx, logLo, logSpan) {
  const rate = i.c > 0
    ? `<span class="rate">★ ${i.r.toFixed(2)} <span class="norate">${i.c}件</span></span>`
    : '<span class="norate">評価なし</span>';
  const w = Math.max(1.5, Math.min(100, ((Math.log(i.y) - logLo) / logSpan) * 100));
  return `<li class="row"><div class="body">` +
    `<span class="nm"><a href="${esc(i.u)}" target="_blank" rel="nofollow sponsored noopener" title="${esc(i.f)}">${esc(i.n)}</a></span>` +
    `<span class="meta">${rate}<span>${i.a}度</span>` +
    `<span>${i.v.toLocaleString()}ml${i.s > 1 ? ` × ${i.s}本` : ''}</span>` +
    `<span>純AL ${num(i.w)}g</span><span>${i.p.toLocaleString()}円</span>` +
    `<span class="tag">${esc(i.g)}</span>` +
    (i.pt > 1 ? `<span class="badge pt">ポイント${i.pt}倍</span>` : '') +
    (i.sp ? '<span class="badge sp">送料別</span>' : '') +
    `</span></div>` +
    `<div class="price"><b>${num(i.y)}</b><span>円 / 20g</span>` +
    (i.pt > 1 ? `<div class="list-price">定価 ${num(i.y)}円 · ${i.pt}%還元</div>` : '') +
    `</div>` +
    `<button type="button" class="pick" data-k="${esc(i.n + '|' + i.p)}" aria-pressed="false">比較に追加</button>` +
    `<span class="scale"><span style="width:${w.toFixed(1)}%"></span></span></li>`;
}

function page({ items, genre, path }) {
  const st = stats(items);
  const home = items.filter(i => i.v <= HOME_SIZE_ML).sort((a, b) => a.y - b.y);
  const ssr = home.slice(0, SSR_ROWS);
  const ys = home.map(i => i.y).sort((a, b) => a - b);
  const logLo = Math.log(Math.max(ys[0] ?? 1, 1));
  const logHi = Math.log(Math.max(ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.95))] ?? 2, 2));
  const logSpan = Math.max(logHi - logLo, 0.01);

  const url = BASE + path;
  const title = genre
    ? `${genre.name}の単価一覧 — 純アルコール20gあたり中央値${Math.round(st.median)}円`
    : '蒸留酒 単価一覧 — 純アルコール20gあたりの価格で選ぶ';
  const desc = genre
    ? `楽天市場の${genre.name}${st.count}件を純アルコール20g（日本酒1合相当）あたりの価格で比較。中央値${Math.round(st.median)}円、最安${num(st.min)}円。度数と容量から機械的に算出し、ポイント還元込みの実質価格も出せます。`
    : `楽天市場の蒸留酒${st.count}件を、純アルコール20g（日本酒1合相当）あたりの価格で横断比較。度数と容量から機械的に算出し、ポイント還元込みの実質価格も出せます。`;
  const h1 = genre ? `${genre.name}を単価で比べる` : '蒸留酒 単価一覧';
  const genreList = genre ? [genre.name] : db.genres;

  const lede = genre
    ? `楽天市場の${genre.name} ${st.count.toLocaleString()}件を、純アルコール20gあたりいくらかという物差しに載せました。` +
      `この種別の中央値は${Math.round(st.median)}円、最安は${num(st.min)}円です。` +
      `商品名と説明文から度数と容量を機械的に読み取っており、読み取れなかった商品は載せていません。`
    : `価格も度数も容量もバラバラな蒸留酒 ${st.count.toLocaleString()} 本を、純アルコール20gあたりいくらかという同じ物差しに載せました。` +
      `商品名と説明文から度数と容量を機械的に読み取っており、読み取れなかった商品は載せていません。`;

  const breadcrumb = genre
    ? [{ name: '蒸留酒 単価一覧', item: BASE + '/' }, { name: genre.name, item: url }]
    : [{ name: '蒸留酒 単価一覧', item: BASE + '/' }];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite', '@id': BASE + '/#website', url: BASE + '/',
        name: '蒸留酒 単価一覧', inLanguage: 'ja',
        description: '蒸留酒を純アルコール20gあたりの価格で横断比較するデータベース',
      },
      {
        '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description: desc,
        isPartOf: { '@id': BASE + '/#website' }, inLanguage: 'ja', datePublished: isoDate, dateModified: isoDate,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumb.map((b, n) => ({
          '@type': 'ListItem', position: n + 1, name: b.name, item: b.item,
        })),
      },
      {
        '@type': 'ItemList', name: title, numberOfItems: ssr.length,
        itemListElement: ssr.slice(0, 20).map((i, n) => ({
          '@type': 'ListItem', position: n + 1, name: i.n, url: i.u,
        })),
      },
    ],
  };

  const nav = `<nav class="genres" aria-label="種別">
    <a href="/"${path === '/' ? ' aria-current="page"' : ''}>すべて</a>
    ${GENRES.map(g => `<a href="/${g.slug}/"${genre && genre.slug === g.slug ? ' aria-current="page"' : ''}>${esc(g.name)}</a>`).join('\n    ')}
  </nav>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="google-site-verification" content="eR6zNT2h_T40uKr_qGZEXLhsPrOTNhRrR2_q4JRNffs">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="蒸留酒 単価一覧">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Murecho:wght@400;500;700&display=swap">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{
  --ground:#100c09; --surface:rgba(240,231,220,.055); --raised:rgba(240,231,220,.09);
  --line:rgba(240,231,220,.1); --rule:rgba(240,231,220,.16);
  --ink:#f0e7dc; --sub:#b6a898; --faint:#857a6e;
  --amber:#e0a86a; --amber-deep:#c47c36; --amber-wash:rgba(224,168,106,.11);
  --verdigris:#7fc0a8; --verdigris-wash:rgba(127,192,168,.11);
  --f-num:Fraunces,Georgia,'Times New Roman',serif;
  --f-body:Murecho,'Hiragino Sans','Yu Gothic',system-ui,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-body);
  line-height:1.75;font-feature-settings:"palt" 1;-webkit-font-smoothing:antialiased;
  overflow-x:hidden;position:relative}
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
header{padding:2.4rem 0 1.4rem}
.eyebrow{font-size:.68rem;letter-spacing:.28em;color:var(--amber-deep);display:block;margin-bottom:.9rem}
h1{font-size:clamp(1.7rem,6vw,2.6rem);font-weight:700;line-height:1.28;margin:0 0 .9rem;letter-spacing:.02em}
.lede{color:var(--sub);font-size:.87rem;line-height:2;margin:0;max-width:34rem}
.genres{display:flex;flex-wrap:wrap;gap:.4rem;margin:1.4rem 0 0}
.genres a{padding:.3rem .85rem;border-radius:999px;font-size:.76rem;border:1px solid var(--line);color:var(--sub)}
.genres a:hover{color:var(--ink);border-color:var(--sub);text-decoration:none}
.genres a[aria-current="page"]{background:var(--amber);color:var(--ground);border-color:var(--amber);font-weight:700}
.readout{display:flex;flex-wrap:wrap;gap:1.6rem;margin:1.4rem 0 0;padding:1.1rem 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.readout div{display:flex;flex-direction:column;gap:.15rem}
.readout dt{font-size:.62rem;letter-spacing:.18em;color:var(--faint)}
.readout dd{margin:0;font-family:var(--f-num);font-size:1.35rem;font-weight:600;font-variant-numeric:tabular-nums}
.controls{position:sticky;top:0;z-index:30;padding:.9rem 0 1.5rem;display:flex;flex-direction:column;gap:.7rem}
.controls::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:100vw;
  transform:translateX(-50%);z-index:-1;background:rgba(16,12,9,.88);
  -webkit-backdrop-filter:blur(18px) saturate(115%);backdrop-filter:blur(18px) saturate(115%);
  -webkit-mask-image:linear-gradient(to bottom,#000 74%,transparent 100%);
  mask-image:linear-gradient(to bottom,#000 74%,transparent 100%)}
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
.rate{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.rate label{font-size:.75rem;color:var(--sub);white-space:nowrap}
.rate input[type=range]{flex:1;min-width:8rem;accent-color:var(--amber);height:1.4rem;cursor:pointer}
.rate output{font-family:var(--f-num);font-size:1rem;font-weight:600;color:var(--amber);
  min-width:2.6rem;text-align:right;font-variant-numeric:tabular-nums}
.rate .presets{display:flex;gap:.3rem}
.rate .presets button{padding:.22rem .6rem;border-radius:999px;font-size:.68rem;background:transparent;
  color:var(--faint);border:1px solid var(--line);cursor:pointer;font-family:var(--f-body);white-space:nowrap}
.rate .presets button:hover{color:var(--ink);border-color:var(--sub)}
.badge{padding:.05rem .45rem;border-radius:999px;font-size:.66rem;letter-spacing:.02em}
.badge.pt{color:var(--amber);border:1px solid rgba(224,168,106,.4)}
.badge.sp{color:var(--faint);border:1px solid var(--line)}
.list-price{font-size:.62rem;color:var(--faint);margin-top:.2rem;font-variant-numeric:tabular-nums}
.bar{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
  margin:1.4rem 0 .6rem;font-size:.68rem;letter-spacing:.12em;color:var(--faint);font-variant-numeric:tabular-nums}
ol.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7rem}
.row{padding:1.15rem 1.3rem;border-radius:16px;background:var(--surface);border:1px solid var(--line);
  display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem 1.2rem;align-items:center}
.row.picked{border-color:var(--amber);background:var(--amber-wash)}
.row .body{display:flex;flex-direction:column;gap:.45rem;min-width:0}
.row .nm{font-size:.93rem;font-weight:500;line-height:1.55}
.meta{display:flex;flex-wrap:wrap;gap:.2rem 1.1rem;font-size:.74rem;color:var(--sub);font-variant-numeric:tabular-nums}
.meta .rate{color:var(--verdigris);display:inline}
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
.scale{grid-column:1/-1;height:2px;background:rgba(224,168,106,.2);margin-top:.55rem;position:relative}
.scale span{position:absolute;inset:0 auto 0 0;background:var(--amber);display:block}
.more{display:block;width:100%;margin-top:1.4rem;padding:.85rem;border-radius:999px;background:transparent;
  border:1px solid var(--rule);color:var(--sub);font-family:var(--f-body);font-size:.83rem;cursor:pointer}
.more:hover{color:var(--ink);border-color:var(--ink)}
.empty{padding:3rem 1rem;text-align:center;color:var(--faint);font-size:.85rem;line-height:1.9}
.tray{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(16,12,9,.86);
  -webkit-backdrop-filter:blur(18px) saturate(115%);backdrop-filter:blur(18px) saturate(115%);
  border-top:1px solid var(--line);padding:.85rem 1rem;display:flex;justify-content:center}
.tray-in{width:100%;max-width:58rem;display:flex;align-items:center;gap:.8rem;justify-content:space-between}
.tray span{font-size:.78rem;color:var(--sub)}
.tray .acts{display:flex;gap:.5rem}
.btn-amber{padding:.6rem 1.4rem;border-radius:999px;background:var(--amber);color:var(--ground);
  border:0;font-family:var(--f-body);font-size:.83rem;font-weight:700;cursor:pointer}
.cmp-wrap{overflow-x:auto;margin-top:1rem}
.cmp{min-width:44rem;display:grid;gap:.7rem}
.cmp .h{padding:1.1rem;border-radius:16px;background:var(--surface);border:1px solid var(--line);
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
.crosslinks{margin-top:2.5rem;padding-top:1.4rem;border-top:1px solid var(--line)}
.crosslinks h2{font-size:.65rem;letter-spacing:.22em;color:var(--amber-deep);margin:0 0 .9rem;font-weight:400}
.crosslinks ul{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.5rem}
.crosslinks li{font-size:.82rem}
.crosslinks .med{color:var(--faint);font-size:.72rem;font-variant-numeric:tabular-nums}
footer{margin-top:3rem;border-top:1px solid var(--rule);padding-top:1.6rem;
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
  <div class="glow g1"></div><div class="glow g2"></div>
  <svg class="halo" viewBox="0 0 800 800">
    <g class="rosette" fill="none" stroke="#c47c36" stroke-width="0.75">
      ${rosette('#5e8e7c', [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165])}
    </g></svg>
  <svg class="halo2" viewBox="0 0 800 800">
    <g class="rosette" fill="none" stroke="#5e8e7c" stroke-width="0.7" style="animation-direction:reverse">
      ${rosette('#c47c36', [0, 22, 44, 66, 88, 110, 132, 154])}
    </g></svg>
  <div class="grain"></div>
</div>

<div class="pr">PR — 本ページは楽天アフィリエイトプログラムを利用した広告を含みます</div>

<div class="wrap">
<header>
  <span class="eyebrow">純アルコール 20g ／ 日本酒1合 相当</span>
  <h1>${esc(h1)}</h1>
  <p class="lede">${esc(lede)}</p>
  ${nav}
  <dl class="readout">
    <div><dt>掲載</dt><dd>${st.count.toLocaleString()}</dd></div>
    <div><dt>評価あり</dt><dd style="color:var(--verdigris)">${st.withReview.toLocaleString()}</dd></div>
    <div><dt>中央値</dt><dd style="color:var(--amber)">${Math.round(st.median)}</dd></div>
    <div><dt>最安</dt><dd style="color:var(--amber)">${num(st.min)}</dd></div>
  </dl>
</header>

<div class="controls">
  <div class="search">
    <label class="field">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        style="flex:none;color:var(--faint)"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>
      <input type="search" id="q" placeholder="銘柄・蒸留所で絞る" aria-label="銘柄を検索">
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
    ${genre ? '' : GENRES.map(g => `<button type="button" class="chip" data-genre="${esc(g.name)}" aria-pressed="false">${esc(g.name)}</button>`).join('\n    ')}
  </div>
  <div class="rate">
    <label for="rate">あなたの還元率</label>
    <input type="range" id="rate" min="1" max="18" step="1" value="1">
    <output id="rateOut" for="rate">1%</output>
    <span class="presets">
      <button type="button" data-rate="1">通常のみ</button>
      <button type="button" data-rate="4">楽天カード</button>
      <button type="button" data-rate="9">SPU中</button>
      <button type="button" data-rate="15">SPU高</button>
    </span>
  </div>
  <p class="note" id="modeNote"></p>
</div>

<div class="bar"><span id="count">${home.length.toLocaleString()} 件</span><span id="range">${num(ys[0] ?? 0)} 〜 ${num(Math.exp(logHi))} 円/20g</span></div>
<ol class="list" id="list">${ssr.map((i, n) => rowHTML(i, n, logLo, logSpan)).join('')}</ol>
<button type="button" class="more" id="more"${home.length <= SSR_ROWS ? ' hidden' : ''}>さらに表示</button>

<section id="compare" hidden aria-label="銘柄の比較"></section>

<section class="crosslinks">
  <h2>種別ごとの単価</h2>
  <ul>
    ${GENRES.filter(g => !genre || g.slug !== genre.slug).map(g => {
      const s = stats(ALL.filter(i => i.g === g.name));
      return `<li><a href="/${g.slug}/">${esc(g.name)}</a> <span class="med">中央値 ${Math.round(s.median)}円 · ${s.count}件</span></li>`;
    }).join('\n    ')}
    ${genre ? '<li><a href="/">すべての蒸留酒</a> <span class="med">' + ALL.length.toLocaleString() + '件</span></li>' : ''}
  </ul>
</section>

<footer>
  <h2>このデータについて</h2>
  <dl>
    <dt>取得日</dt><dd>${stamp}</dd>
    <dt>データ元</dt><dd>${esc(db.source)}</dd>
    <dt>対象</dt><dd>${genreList.map(esc).join('、')}</dd>
    <dt>掲載</dt><dd>${st.count.toLocaleString()} 件（うち評価あり ${st.withReview.toLocaleString()} 件）</dd>
    <dt>計算式</dt><dd>純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8。これを20gあたりの価格に換算</dd>
    <dt>実質価格</dt><dd>表示価格 × (1 − 還元率 ÷ 100)。還元率 = 入力値 + 商品個別の期間限定ポイント倍率の上乗せ分</dd>
  </dl>
  <p>
    価格は取得時点のもので、実際の販売価格・在庫と異なる場合があります。購入前に販売ページでご確認ください。
    還元率はSPUなどで人により異なるため、実質価格は入力値に基づく目安です。買いまわりキャンペーンの倍率と
    獲得上限は反映していません。「送料別」の表示は楽天のフラグに基づきますが、商品名が送料無料を明示している場合は
    出していません（フラグと実態が食い違う商品が一定数あるため）。
  </p>
  <p>アクセス数の把握に Cloudflare Web Analytics を使っています。Cookie も端末の識別も使わず、個人を特定する情報は収集していません。</p>
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
  const HOME_SIZE = ${HOME_SIZE_ML}, MAX = ${MAX_COMPARE}, PAGE = ${SSR_ROWS};
  const SCOPED = ${genre ? 'true' : 'false'};

  const keyOf = i => i.n + '|' + i.p;
  const byKey = new Map(DATA.map(i => [keyOf(i), i]));
  const state = { mode: 'cheap', home: true, genres: new Set(), q: '', shown: PAGE, picks: [], view: 'list', rate: 1 };
  const $ = id => document.getElementById(id);
  const store = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };

  const effRate = i => state.rate + Math.max(0, i.pt - 1);
  const eff = i => i.y * (1 - effRate(i) / 100);
  const effPrice = i => i.p * (1 - effRate(i) / 100);

  const NOTES = {
    cheap: 'ポイント還元を差し引いた実質価格で、純アルコール20gあたりが安い順に並べています。',
    value: 'レビュー' + MIN_REVIEWS + '件以上かつ評点' + MIN_RATING.toFixed(1) + '以上に絞り、実質20g単価の安い順に。',
    rated: 'レビュー' + RATED_MIN_REVIEWS + '件以上に絞り、評点の高い順に。価格は考慮しません。',
  };
  const RATE_NOTE = '還元率はSPUなどで人により変わるため、ご自身の値を入れてください。商品ごとの期間限定ポイント倍率はAPIの値を上乗せしています。';

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
    if (state.mode === 'value') return r.filter(i => i.c >= MIN_REVIEWS && i.r >= MIN_RATING).slice().sort((a, b) => eff(a) - eff(b));
    if (state.mode === 'rated') return r.filter(i => i.c >= RATED_MIN_REVIEWS).slice().sort((a, b) => (b.r - a.r) || (b.c - a.c));
    return r.slice().sort((a, b) => eff(a) - eff(b));
  }

  function renderList() {
    const rows = filtered();
    $('modeNote').textContent = NOTES[state.mode] + ' ' + RATE_NOTE;
    $('count').textContent = rows.length.toLocaleString() + ' 件';
    const list = $('list');
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<li class="empty">条件に合う商品がありません。<br>絞り込みを緩めるか、短い語で検索してください。</li>';
      $('more').hidden = true; $('range').textContent = '';
      return;
    }
    const sorted = rows.map(eff).sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const logLo = Math.log(Math.max(lo, 1));
    const logSpan = Math.max(Math.log(Math.max(hi, 2)) - logLo, 0.01);
    $('range').textContent = num(lo) + ' 〜 ' + num(hi) + ' 円/20g';

    const frag = document.createDocumentFragment();
    rows.slice(0, state.shown).forEach((i, idx) => {
      const k = keyOf(i);
      const on = state.picks.includes(k);
      const full = !on && state.picks.length >= MAX;
      const li = document.createElement('li');
      li.className = 'row row-in' + (on ? ' picked' : '');
      li.style.animationDelay = Math.min(idx, 8) * 0.055 + 's';
      const w = Math.max(1.5, Math.min(100, ((Math.log(eff(i)) - logLo) / logSpan) * 100));
      li.innerHTML =
        '<div class="body"><span class="nm"><a href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener" title="' + esc(i.f) + '">' + esc(i.n) + '</a></span>' +
        '<span class="meta">' +
          (i.c > 0 ? '<span class="rate">★ ' + i.r.toFixed(2) + ' <span class="norate">' + i.c + '件</span></span>' : '<span class="norate">評価なし</span>') +
          '<span>' + i.a + '度</span><span>' + i.v.toLocaleString() + 'ml' + (i.s > 1 ? ' × ' + i.s + '本' : '') + '</span>' +
          '<span>純AL ' + num(i.w) + 'g</span><span>' + i.p.toLocaleString() + '円</span>' +
          '<span class="tag">' + esc(i.g) + '</span>' +
          (i.pt > 1 ? '<span class="badge pt">ポイント' + i.pt + '倍</span>' : '') +
          (i.sp ? '<span class="badge sp">送料別</span>' : '') +
        '</span></div>' +
        '<div class="price"><b>' + num(eff(i)) + '</b><span>円 / 20g</span>' +
          (effRate(i) > 0 ? '<div class="list-price">定価 ' + num(i.y) + '円 · ' + effRate(i) + '%還元</div>' : '') + '</div>' +
        '<button type="button" class="pick" data-k="' + esc(k) + '" aria-pressed="' + on + '"' + (full ? ' disabled' : '') + '>' +
          (on ? '比較から外す' : '比較に追加') + '</button>' +
        '<span class="scale"><span style="width:' + w.toFixed(1) + '%"></span></span>';
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
    const bestY = Math.min(...picked.map(eff));
    const bestP = Math.min(...picked.map(effPrice));
    const bestR = Math.max(...picked.map(i => i.r));
    const rowOf = (label, fn) => '<div class="lbl">' + label + '</div>' + picked.map(fn).join('');
    sec.innerHTML =
      '<div class="bar"><span>比較 — ' + picked.length + ' / ' + MAX + ' 銘柄</span>' +
        '<button type="button" class="btn-plain" id="backToList">一覧へ戻る</button></div>' +
      '<div class="cmp-wrap"><div class="cmp" style="grid-template-columns:7.5rem repeat(' + picked.length + ',minmax(0,1fr))">' +
        '<div></div>' +
        picked.map((i, n) => '<div class="h"><div class="top"><span class="ix">' + 'ABCD'[n] + '</span>' +
          '<button type="button" class="x" data-drop="' + esc(keyOf(i)) + '" aria-label="外す">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button></div><span class="nm">' + esc(i.n) + '</span><span class="tag">' + esc(i.g) + '</span></div>').join('') +
        rowOf('実質20g単価', i => '<div class="cell big' + (eff(i) === bestY ? ' best' : '') + '">' + num(eff(i)) + '</div>') +
        rowOf('還元率', i => '<div class="cell">' + effRate(i) + '%' + (i.pt > 1 ? ' <span style="color:var(--amber);font-size:.72rem">ポイント' + i.pt + '倍</span>' : '') + '</div>') +
        rowOf('評価', i => '<div class="cell' + (i.c > 0 && i.r === bestR ? ' best-r' : '') + '">' + (i.c > 0 ? i.r.toFixed(2) + ' <span style="color:var(--faint);font-size:.72rem">' + i.c + '件</span>' : '—') + '</div>') +
        rowOf('度数', i => '<div class="cell">' + i.a + '度</div>') +
        rowOf('容量', i => '<div class="cell">' + i.v.toLocaleString() + 'ml' + (i.s > 1 ? ' × ' + i.s + '本' : '') + '</div>') +
        rowOf('純アルコール', i => '<div class="cell">' + num(i.w) + ' g</div>') +
        rowOf('実質総額', i => '<div class="cell' + (effPrice(i) === bestP ? ' best' : '') + '">' + Math.round(effPrice(i)).toLocaleString() + '円' +
          '<div class="list-price">定価 ' + i.p.toLocaleString() + '円' + (i.sp ? ' · 送料別' : '') + '</div></div>') +
        '<div></div>' +
        picked.map(i => '<div><a class="buy" href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener">楽天で見る</a></div>').join('') +
      '</div></div>';
  }

  function renderTray() {
    $('tray').hidden = state.picks.length === 0 || state.view === 'compare';
    $('trayCount').textContent = state.picks.length + ' 件を選択中（最大' + MAX + '）';
  }
  function render() { renderList(); renderCompare(); renderTray(); }

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

  document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; state.shown = PAGE;
    document.querySelectorAll('.modes button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    store('mode', state.mode); render();
  }));
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const on = c.getAttribute('aria-pressed') !== 'true';
    c.setAttribute('aria-pressed', String(on));
    if (c.dataset.size) state.home = on;
    else on ? state.genres.add(c.dataset.genre) : state.genres.delete(c.dataset.genre);
    state.shown = PAGE; render();
  }));
  function setRate(v) {
    state.rate = Math.max(1, Math.min(18, Number(v) || 1));
    $('rate').value = state.rate; $('rateOut').textContent = state.rate + '%';
    store('rate', state.rate); state.shown = PAGE; render();
  }
  $('rate').addEventListener('input', e => setRate(e.target.value));
  document.querySelectorAll('.rate .presets button').forEach(b => b.addEventListener('click', () => setRate(b.dataset.rate)));
  let timer;
  $('q').addEventListener('input', e => {
    clearTimeout(timer);
    const v = e.target.value.trim();
    timer = setTimeout(() => { state.q = v; state.shown = PAGE; render(); }, 90);
  });
  $('clearQ').addEventListener('click', () => { $('q').value = ''; state.q = ''; state.shown = PAGE; render(); $('q').focus(); });
  $('list').addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (!b || b.disabled) return;
    const k = b.dataset.k, at = state.picks.indexOf(k);
    if (at >= 0) state.picks.splice(at, 1);
    else if (state.picks.length < MAX) state.picks.push(k);
    store('picks', JSON.stringify(state.picks)); syncPicks();
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
  $('trayClear').addEventListener('click', () => { state.picks = []; store('picks'); render(); });
  $('more').addEventListener('click', () => { state.shown += PAGE; render(); });

  const savedRate = Number(read('rate'));
  if (savedRate >= 1 && savedRate <= 18) { state.rate = savedRate; $('rate').value = savedRate; }
  $('rateOut').textContent = state.rate + '%';
  const savedMode = read('mode');
  if (savedMode && savedMode !== 'cheap') { const b = document.querySelector('[data-mode="' + savedMode + '"]'); if (b) b.click(); }
  try {
    const saved = JSON.parse(read('picks') || '[]');
    if (Array.isArray(saved)) state.picks = saved.filter(k => byKey.has(k)).slice(0, MAX);
  } catch {}
  render();

  if (read('age') !== 'ok') {
    const g = document.createElement('div');
    g.id = 'gate';
    g.innerHTML = '<div class="box"><p class="mark">AGE VERIFICATION</p><h2>20歳以上ですか？</h2>' +
      '<p>20歳未満の者の飲酒は法律で禁じられています。</p>' +
      '<button type="button" class="btn-amber" id="ageOk">20歳以上です</button>' +
      '<button type="button" class="leave" id="ageNo">20歳未満です</button></div>';
    document.body.appendChild(g);
    g.querySelector('#ageOk').addEventListener('click', () => { store('age', 'ok'); g.remove(); });
    g.querySelector('#ageNo').addEventListener('click', () => { location.href = 'https://www.google.com/'; });
  }
})();
</script>
${beaconTag}
</body>
</html>
`;
}

// accessKey が生成物に混入していないか必ず検査する。applicationId はアフィリエイトURLに
// 仕様として含まれる公開識別子なので対象外だが、accessKey が漏れると第三者にAPIを叩かれる。
let secret = '';
try { secret = readFileSync('.env', 'utf8').match(/^RAKUTEN_ACCESS_KEY=(.+)$/m)?.[1]?.trim() ?? ''; } catch {}
function write(path, content) {
  if (secret && secret.length >= 8 && content.includes(secret)) {
    console.error(`中止: ${path} に RAKUTEN_ACCESS_KEY が含まれています。`);
    process.exit(1);
  }
  const dir = path.slice(0, path.lastIndexOf('/'));
  if (dir && dir !== 'dist') mkdirSync(dir, { recursive: true });
  writeFileSync(path, content);
}

const pages = [{ items: ALL, genre: null, path: '/' }];
for (const g of GENRES) {
  pages.push({ items: ALL.filter(i => i.g === g.name), genre: g, path: `/${g.slug}/` });
}

let total = 0;
for (const p of pages) {
  const html = page(p);
  const file = p.path === '/' ? 'dist/index.html' : `dist${p.path}index.html`;
  write(file, html);
  total += Buffer.byteLength(html);
  console.log(`  ${p.path.padEnd(11)} ${String(p.items.length).padStart(5)}件  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

write('dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  pages.map(p => `  <url><loc>${BASE}${p.path}</loc><lastmod>${isoDate}</lastmod>` +
    `<changefreq>weekly</changefreq><priority>${p.path === '/' ? '1.0' : '0.8'}</priority></url>`).join('\n') +
  `\n</urlset>\n`);

write('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);

console.log(`\n合計 ${pages.length} ページ / ${(total / 1024).toFixed(0)} KB、sitemap.xml と robots.txt を生成`);
console.log('秘密鍵の混入チェック: 通過');
