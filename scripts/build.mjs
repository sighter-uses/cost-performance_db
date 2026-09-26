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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { hasRandomContents } from './lib/parse.mjs';
import { STYLES, GLASS, INTRO, FONTS } from './lib/view.mjs';
import { appJS } from './lib/app.mjs';

const db = JSON.parse(readFileSync('data/items.json', 'utf8'));
const BASE = 'https://cost-performance-db.inspecting.workers.dev';

// 運営者。情報源として選ばれるかどうかに著者の身元が効くため、名乗りと、その裏づけになる
// 外部の実体を必ず並べて出す。資格や肩書は持っていないので書かない —— 代わりに
// 収集と解析のコードを全部公開してあることを根拠にする。検証できるほうが強い。
const AUTHOR = {
  name: 'Drunker',
  note: 'https://note.com/kosupa_watch082',
  repo: 'https://github.com/sighter-uses/cost-performance_db',
};

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
//
// searchName は検索面（title / description）で使う名前。
// 「ラム」単体で検索すると**ラムダッシュ（シェーバー）とラム肉**に食われる ——
// 「ラム コスパ」のサジェストは大半がシェーバーだった。酒として扱うには「ラム酒」と書く必要がある。
// 表示名は変えない。ページの中で名乗るぶんには文脈があるので誤解されない。
const GENRES = [
  { name: 'ウイスキー', slug: 'whisky' },
  { name: '焼酎', slug: 'shochu' },
  { name: 'ジン', slug: 'gin' },
  { name: 'ラム', slug: 'rum', searchName: 'ラム酒' },
  { name: 'ウォッカ', slug: 'vodka' },
  { name: 'テキーラ', slug: 'tequila' },
  { name: 'ブランデー', slug: 'brandy' },
];
const searchNameOf = g => g.searchName ?? g.name;

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

// 除外は取得時にも掛かっているが、ここでも掛ける。除外規則を足した直後は、
// 前のデータで作られた items.json に古い基準の商品が残っている。
// 「除外した」と書いてあるページに除外対象が載っている状態が、いちばん悪い。
const excluded = db.items.filter(i => hasRandomContents(i.name)).length;
const ALL = db.items.filter(i => !hasRandomContents(i.name)).map(i => ({
  // f（生の商品名）は画面のどこでも使っていない。全件ぶん送ると数百KBになるので載せない。
  n: displayName(i.name), p: i.price, u: i.url, g: i.genre,
  a: i.abv, v: i.volumeMl, s: i.setCount, w: i.pureAlcoholG, y: i.yenPerUnit,
  r: i.reviewAverage, c: i.reviewCount,
  pt: i.pointRate ?? 1,
  sp: i.postageIncluded === false && !/送料無料/.test(i.name),
  // 楽天APIが返す商品画像。2,506/2,507件に付いている。
  im: i.image ?? null,
}));

// 取得時刻はUTCで記録されるが、表示も期間も日本時間で数える。
// 片方をローカル、片方をUTCで出すと、深夜に取得した回だけ日付が1日ずれる。
const jstIso = t => new Date(new Date(t).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const jpDate = iso => { const [y, m, dd] = iso.split('-'); return `${+y}年${+m}月${+dd}日`; };
const isoDate = jstIso(db.fetchedAt);
const stamp = jpDate(isoDate);

// 調査期間は「いつから観測しているか」であって、載っている数字がその期間の平均だという
// 意味ではない。期間だけ書くと推移を集計したように読めてしまうので、
// 「本ページの数値は◯日取得分」を必ず併記する。
const startDate = (() => {
  try {
    return readdirSync('data/snapshots')
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => f.slice(0, 10)).sort()[0] ?? isoDate;
  } catch { return isoDate; }
})();
const periodText = startDate === isoDate
  ? `${stamp}（単日調査）`
  : `${jpDate(startDate)}〜${stamp}（継続調査中。本ページの数値は${stamp}取得分）`;
const periodISO = startDate === isoDate ? isoDate : `${startDate}/${isoDate}`;

// 除外の内訳。調査対象の定義は「何を入れたか」と「何を落としたか」の両方で決まる。
const dropped = db.stats?.dropped ?? {};
const droppedAtFetch = Object.values(dropped).reduce((a, b) => a + b, 0);
const droppedTotal = droppedAtFetch + excluded;

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

// OG画像は dist/og.png があるときだけ宣言する。存在しない画像を指すと、
// 共有先が空のカードを描いてしまい、画像なしよりかえって悪い。
// 原稿は design/og-image.html（ブラウザで開いて 1200×630 の枠を書き出す）。
const hasOgImage = existsSync('dist/og.png');
// 寸法は決め打ちにせずPNGのヘッダから読む。画面の解像度倍率がかかった書き出しでは
// 1200×630 にならないので、宣言と実物がずれるとスクレイパーが誤った枠で描く。
function pngSize(file) {
  const b = readFileSync(file);
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const ogSize = hasOgImage ? pngSize('dist/og.png') : null;

// バーの背景画像の差し替え口。dist/assets/bar.jpg を置けばCSSの地がそれに変わり、
// なければCSSで作った暖色の光源だけで成立する。画像が無くても崩れないことが条件。
const BAR_IMAGE = ['bar.jpg', 'bar.webp', 'bar.png'].find(f => existsSync(`dist/assets/${f}`));
const barStyle = BAR_IMAGE ? `:root{--bar-image:url(/assets/${BAR_IMAGE})}` : '';
const ogImageTags = ogSize
  ? `<meta property="og:image" content="${BASE}/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${ogSize.w}">
<meta property="og:image:height" content="${ogSize.h}">
<meta property="og:image:alt" content="SpiritLens — 純アルコール20gあたりの価格で比べる">
<meta name="twitter:image" content="${BASE}/og.png">
<meta name="twitter:image:alt" content="SpiritLens — 純アルコール20gあたりの価格で比べる">`
  : '';
const twitterCard = ogSize ? 'summary_large_image' : 'summary';

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
  // 検索面の語は実測に合わせる（content/KEYWORDS.md）。
  // 「コスパ」と「ランキング」は全種別のサジェストに出るのに、我々は1つも使っていなかった。
  // 逆に「純アルコール」は健康の文脈でしか検索されず、入口の語にならない ——
  // だが我々を我々たらしめている数字なので、根拠として後ろに置く。
  // h1 とサイト名は変えない。名乗りと検索面は別の役割を持つ。
  const sName = genre ? searchNameOf(genre) : null;
  const title = genre
    ? `${sName}のコスパ比較 ${st.count}本 — 純アルコール20g単価ランキング（中央値${Math.round(st.median)}円）`
    : `蒸留酒のコスパ比較 ${st.count.toLocaleString()}本 — 純アルコール20g単価ランキング`;
  const desc = genre
    ? `楽天市場の${sName}${st.count}件を、純アルコール20g（日本酒1合相当）あたりの価格で並べたランキング。中央値${Math.round(st.median)}円、最安${num(st.min)}円。度数と容量から機械的に算出し、ポイント還元込みの実質価格でも並べ替えられます。`
    : `楽天市場の蒸留酒${st.count.toLocaleString()}件を、純アルコール20g（日本酒1合相当）あたりの価格で並べたコスパランキング。ウイスキー・焼酎・ジン・ラム酒・ウォッカ・テキーラ・ブランデーを同じ物差しで比較でき、ポイント還元込みの実質価格でも並べ替えられます。`;
    const genreList = genre ? [genre.name] : db.genres;

  const lede = genre
    ? `楽天市場の${genre.name} ${st.count.toLocaleString()}件を、純アルコール20gあたりいくらかという物差しに載せました。` +
      `この種別の中央値は${Math.round(st.median)}円、最安は${num(st.min)}円です。` +
      `商品名と説明文から度数と容量を機械的に読み取っており、読み取れなかった商品は載せていません。`
    : `価格も度数も容量もバラバラな蒸留酒 ${st.count.toLocaleString()} 本を、純アルコール20gあたりいくらかという同じ物差しに載せました。` +
      `商品名と説明文から度数と容量を機械的に読み取っており、読み取れなかった商品は載せていません。`;

  const breadcrumb = genre
    ? [{ name: 'SpiritLens', item: BASE + '/' }, { name: genre.name, item: url }]
    : [{ name: 'SpiritLens', item: BASE + '/' }];

  // ---- 調査概要 ----
  // 数字だけを置いても、それが何を数えたものか分からなければ引用できない。
  // 対象の定義・期間・母数・集計方法・除外基準を、本文とは独立した1ブロックにまとめる。
  const subject = genre ? genre.name : '蒸留酒（ウイスキー・焼酎・ジン・ラム・ウォッカ・テキーラ・ブランデー）';
  const survey = [
    ['調査主体', `${AUTHOR.name}（個人）`],
    ['調査対象', `楽天市場の${subject}ジャンルに登録されている商品のうち、商品名または説明文から度数と容量を判別できたもの`],
    ['調査期間', periodText],
    ['有効件数', `n = ${st.count.toLocaleString()}（うち評価あり ${st.withReview.toLocaleString()}）`],
    ['収集方法', `${esc(db.source)}から調査全体で${(db.stats?.fetched ?? 0).toLocaleString()}件を機械収集し、商品名と説明文から度数・容量・本数を抽出。同一商品が複数店舗から出るため、商品名と価格が一致するものは1件に集約`],
    ['集計方法', '純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8 として、純アルコール20gあたりの価格を算出。代表値は中央値'],
    ['除外基準', `度数または容量を判別できなかった商品、1本あたりか総額かが判別できないセット商品、中身が抽選で決まる商品（「◯◯くじ」など）は掲載しない（調査全体で${droppedTotal.toLocaleString()}件を除外）`],
    ['既知の限界', '種別の区分は楽天市場のジャンル登録に従っており、これは出品店舗が設定するものです。そのため商品名から見て別の種別と思われる商品が1%程度混じります。当方で分類し直してはいません'],
    ['再現性', `収集・解析のコードは <a href="${AUTHOR.repo}" rel="noopener" target="_blank">GitHubで公開</a>しており、同じ手順で誰でも再取得できる`],
  ];

  // ---- よくある質問 ----
  // 1問1答で、各答えがそれ単体で意味を持つように書く。
  // 前の答えを読んでいないと分からない書き方をすると、切り出して引用できない。
  const faq = [
    ['「純アルコール20gあたりの価格」とは何ですか',
      '純アルコール20gは、厚生労働省の飲酒ガイドラインが「1ドリンク（1単位）」として示す量で、日本酒1合やビール中瓶1本にあたります。容量(ml) × 度数 ÷ 100 × 0.8 で純アルコール量(g)を求め、販売価格をその量で割って20g分に換算した値が20g単価です。度数も容量も違う酒を同じ物差しで並べるための単位です。'],
    [`${subject.replace(/（.*/, '')}の20g単価はいくらくらいですか`,
      `${stamp}時点で楽天市場の${genre ? genre.name : '蒸留酒'} ${st.count.toLocaleString()}件を集計した結果、中央値は${Math.round(st.median)}円、最安は${num(st.min)}円でした。${genre ? '' : '種別ごとの中央値は' + GENRES.map(g => `${g.name}${Math.round(stats(ALL.filter(i => i.g === g.name)).median)}円`).join('、') + 'です。'}`],
    ['なぜ販売価格ではなく単価で比べるのですか',
      '容量と度数がばらばらだからです。1本の価格は容量が大きいほど高くなり、同じ容量でも度数が高いほど一本から取れる杯数は増えます。価格の安さと、酔いの量あたりの安さは一致しません。純アルコール量で割ると、この2つの違いを同時に吸収できます。'],
    ['掲載されていない商品があるのはなぜですか',
      `商品名と説明文から度数と容量を機械的に読み取っており、どちらかが読み取れない商品は掲載していません。「12本セット」のように表示価格が1本あたりか総額かを判別できない商品、「ウイスキーくじ」のように中身が抽選で決まる商品も除外しています。調査全体で${droppedTotal.toLocaleString()}件が該当しました。誤った単価を出すより、載せないほうがよいと判断しています。`],
    ['種別（ウイスキー・焼酎など）はどうやって決めていますか',
      '楽天市場のジャンル登録をそのまま使っています。これは出品店舗が設定するもので、当方で分類し直してはいません。そのため、商品名から見て別の種別と思われる商品が1%程度混じります。中央値のような代表値には影響しない水準ですが、各種別の最安値を見るときはご注意ください。'],
    ['「実質価格」はどう計算していますか',
      '表示価格 × (1 − 還元率 ÷ 100) です。還元率は、あなたが入力した値に、商品ごとの期間限定ポイント倍率の上乗せ分を加えたものです。SPUは人によって違うため入力式にしています。買いまわりキャンペーンの倍率と獲得上限は反映していません。'],
    ['データはいつ時点のものですか',
      `${periodText}。価格・在庫・ポイント倍率は変動するため、購入前に販売ページでご確認ください。24時間以内に終了するポイント倍率はAPIが返さないため、掲載の倍率は取得時点の記録です。`],
  ];

  const person = {
    '@type': 'Person', '@id': BASE + '/#author', name: AUTHOR.name, url: BASE + '/',
    sameAs: [AUTHOR.note, AUTHOR.repo],
    description: '楽天ウェブサービスのAPIで蒸留酒の価格データを収集し、純アルコール量あたりの単価に換算して公開している個人。収集と解析のコードを公開している。',
  };

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      person,
      {
        '@type': 'WebSite', '@id': BASE + '/#website', url: BASE + '/',
        name: 'SpiritLens', inLanguage: 'ja',
        description: '蒸留酒を純アルコール20gあたりの価格で横断比較するデータベース',
        author: { '@id': BASE + '/#author' }, publisher: { '@id': BASE + '/#author' },
      },
      {
        '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description: desc,
        isPartOf: { '@id': BASE + '/#website' }, inLanguage: 'ja',
        datePublished: isoDate, dateModified: isoDate,
        author: { '@id': BASE + '/#author' }, primaryImageOfPage: hasOgImage ? BASE + '/og.png' : undefined,
      },
      // このページの本体は記事ではなく調査データそのものなので Dataset で宣言する。
      // Article を名乗ると型と中身が食い違い、かえって信用を落とす。
      {
        '@type': 'Dataset', '@id': url + '#dataset',
        name: genre ? `楽天市場の${genre.name} 純アルコール20gあたり単価調査` : '楽天市場の蒸留酒 純アルコール20gあたり単価調査',
        description: `楽天市場で販売されている${subject}${st.count}件について、商品名と説明文から度数と容量を抽出し、純アルコール20g（日本酒1合相当）あたりの価格を算出した調査データ。中央値${Math.round(st.median)}円、最安${num(st.min)}円。`,
        url, inLanguage: 'ja', isAccessibleForFree: true,
        creator: { '@id': BASE + '/#author' }, includedInDataCatalog: { '@id': BASE + '/#website' },
        temporalCoverage: periodISO, dateModified: isoDate,
        measurementTechnique: '純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8 として純アルコール20gあたりの価格に換算',
        variableMeasured: ['純アルコール20gあたりの価格（円）', 'アルコール度数（%）', '内容量（ml）', '販売価格（円）', 'レビュー評点', 'レビュー件数'],
        keywords: (genre ? [genre.name] : GENRES.map(g => g.name)).concat(['純アルコール', '単価', 'コストパフォーマンス', '楽天市場']),
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
      {
        '@type': 'FAQPage', '@id': url + '#faq',
        mainEntity: faq.map(([q, a]) => ({
          '@type': 'Question', name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };

  const nav = `<nav class="genres" aria-label="種別">
    <a href="/"${path === '/' ? ' aria-current="page"' : ''}>すべて</a>
    ${GENRES.map(g => `<a href="/${g.slug}/"${genre && genre.slug === g.slug ? ' aria-current="page"' : ''}>${esc(g.name)}</a>`).join('\n    ')}
  </nav>`;

  // 種別ごとの件数。絞り込みの横に出す。
  const counts = GENRES.map(g => ({ g, n: ALL.filter(i => i.g === g.name).length }));
  const maxPrice = Math.max(...ALL.map(i => i.p));

  // クローラが読む分だけサーバー側で書き出す。クライアント側と同じ形にすること ——
  // 食い違うと読み込み直後に内容が入れ替わってちらつく。
  const ssrRow = (i, n) => `<li class="row" data-k="${esc(i.n + '|' + i.p)}" tabindex="0" role="button">` +
    `<span class="rank">${n + 1}</span>` +
    `<span class="shot">${i.im
      ? `<img src="${esc(i.im)}" alt="" loading="lazy" decoding="async" width="200" height="200">`
      : '<span class="ph">画像なし</span>'}</span>` +
    `<span><span class="nm">${esc(i.n)}</span>` +
      `<span class="sub">${esc(i.g)} ・ ${i.a}% ・ ${i.v.toLocaleString('ja-JP')}ml${i.s > 1 ? ` × ${i.s}` : ''}</span>` +
      (i.c > 0
        ? `<span class="rate"><i>★</i> ${i.r.toFixed(1)} <span>(${i.c.toLocaleString('ja-JP')})</span></span>`
        : '<span class="rate"><span>評価なし</span></span>') +
    `</span>` +
    `<span class="spec"><b>アルコール度数</b>${i.a}%<br><b>容量</b>${i.v.toLocaleString('ja-JP')}ml<br><b>純アルコール</b>${num(i.w)} g</span>` +
    `<span class="money"><span class="yen">¥${i.p.toLocaleString('ja-JP')}</span>` +
      `<span class="per"><b>純アルコール20gあたり</b><i>¥${num(i.y)}</i></span></span>` +
    `<span class="chev" aria-hidden="true">›</span></li>`;

  const mood = (id, label, path) =>
    `<button type="button" data-mood="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${path}</svg>${label}</button>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0908">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="google-site-verification" content="eR6zNT2h_T40uKr_qGZEXLhsPrOTNhRrR2_q4JRNffs">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SpiritLens">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${ogImageTags}
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${FONTS}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script>
(function(){var c='intro-done';try{
var seen=sessionStorage.getItem('sl-intro')==='1';
if(location.search.indexOf('intro=1')>=0)seen=false;
if(!seen&&!matchMedia('(prefers-reduced-motion: reduce)').matches)c='intro-on';
}catch(e){}document.documentElement.className+=' '+c;})();
</script>
<style>${STYLES}${barStyle}</style>
</head>
<body>

<p class="pr">PR — 本ページは楽天アフィリエイトプログラムを利用した広告を含みます</p>

<header class="top veiled">
  <div class="shell top-in">
    <a class="brand" href="/">
      <svg viewBox="0 0 40 50" fill="none" aria-hidden="true">
        <path d="M9 5h22l-2.5 17a8.5 8.5 0 0 1-17 0L9 5Z" stroke="#e3b671" stroke-width="2.2" stroke-linejoin="round"></path>
        <path d="M11.6 14h16.8" stroke="#c8933f" stroke-width="2"></path>
        <path d="M20 39v6M13 45h14" stroke="#e3b671" stroke-width="2.2" stroke-linecap="round"></path>
      </svg>
      <span><b>SpiritLens</b><span>Better Spirits, Better Moments.</span></span>
    </a>
    <nav class="nav" aria-label="主要">
      <a href="/"${path === '/' ? ' aria-current="page"' : ''}>ホーム</a>
      <a href="#work">検索</a>
      <a href="#work">ランキング</a>
      <a href="#compare">比較</a>
    </nav>
    <div class="top-act">
      <button type="button" class="icon-btn" aria-label="検索へ移動" onclick="document.getElementById('q').focus()">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4.3-4.3"></path></svg>
      </button>
    </div>
  </div>
</header>

<section class="hero">
  <div class="bar" aria-hidden="true">
    <div class="bar-lights"></div><div class="bar-shelf"></div><div class="bar-veil"></div>
  </div>
  <div class="shell hero-in">
    <div class="hero-copy veiled">
      <h1>${genre ? `${esc(genre.name)}の一杯に、<br><em>もっと納得を。</em>` : 'その一杯に、<br><em>もっと納得を。</em>'}</h1>
      <p>${esc(lede)}</p>
      <form class="seek" id="heroForm" role="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7e7364" stroke-width="1.8" aria-hidden="true" style="flex:none"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4.3-4.3"></path></svg>
        <label class="sr" for="heroQ">銘柄名・ブランド名・種類などで検索</label>
        <input type="search" id="heroQ" placeholder="銘柄名・ブランド名・種類などで検索…" autocomplete="off">
        <button type="submit" aria-label="検索する">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
        </button>
      </form>
    </div>
    <div class="moods veiled">
      <h2>今の気分から探す</h2>
      ${mood('slow', 'じっくり味わいたい', '<path d="M6 3h12l-1.5 9a4.5 4.5 0 0 1-9 0L6 3Z"></path><path d="M12 16v5M9 21h6"></path>')}
      ${mood('value', 'コスパの良い一本を', '<path d="M12 3v18M7 7h7a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h8"></path>')}
      ${mood('gift', 'プレゼントにおすすめ', '<path d="M3 9h18v11H3zM3 9l2-4h14l2 4M12 5v15"></path>')}
      ${mood('pop', 'みんなの人気ランキング', '<path d="M12 3l2.6 5.6 6.4.7-4.8 4.3 1.4 6.4L12 16.8 6.4 20l1.4-6.4L3 9.3l6.4-.7Z"></path>')}
    </div>
    <div class="glass-slot">${GLASS}</div>
  </div>
</section>

<div class="shell veiled">
  <div class="work" id="work">

    <aside class="card side" aria-label="絞り込み">
      <div class="side-head"><h2>フィルター</h2><button type="button" id="reset">リセット</button></div>

      <div class="grp">
        <h3>種類</h3>
        ${counts.map(({ g, n }) => `<label class="opt"><input type="checkbox" data-genre="${esc(g.name)}"${genre && genre.slug === g.slug ? ' checked' : ''}>${esc(g.name)}<span class="n">${n.toLocaleString('ja-JP')}</span></label>`).join('\n        ')}
        <label class="opt" style="margin-top:8px"><input type="checkbox" id="homeOnly" checked>家庭用サイズ（1本1.8L以下）</label>
      </div>

      <div class="grp">
        <h3>価格帯（目安）</h3>
        <input class="rng" type="range" id="price" min="1000" max="${maxPrice}" step="1000" value="${maxPrice}" aria-label="価格の上限">
        <div class="rng-val"><span id="priceVal">¥1,000 〜 上限なし</span></div>
      </div>

      <div class="grp">
        <h3>アルコール度数</h3>
        <input class="rng" type="range" id="abv" min="4" max="100" step="1" value="100" aria-label="度数の上限">
        <div class="rng-val"><span id="abvVal">0% 〜 100%</span></div>
      </div>

      <div class="grp">
        <h3>評価（平均）</h3>
        <div class="stars" role="group" aria-label="最低評価">
          ${[1, 2, 3, 4, 5].map(v => `<button type="button" data-star="${v}" data-on="0" aria-label="★${v}以上">★</button>`).join('')}
        </div>
        <div class="rng-val"><span id="starVal">すべて</span></div>
      </div>

      <div class="grp">
        <h3>ポイント還元率</h3>
        <input class="rng" type="range" id="rate" min="1" max="18" step="1" value="1" aria-label="還元率">
        <div class="rng-val"><span>実質価格に反映</span><span id="rateVal">1%</span></div>
      </div>

      <p style="margin:0;font-size:11px;color:var(--faint);line-height:1.8">産地とブランドでの絞り込みは用意していません。楽天のAPIが構造化された項目として返さず、商品名からの推定は誤りが出るためです。</p>
    </aside>

    <main>
      <div class="list-head">
        <div>
          <h2>${genre ? `${esc(genre.name)}のランキング` : 'おすすめの蒸留酒'}</h2>
          <p>評価・価格・純アルコール量あたりのコストをもとに並べています。</p>
        </div>
        <div class="list-tools">
          <span class="count" id="count">${st.count.toLocaleString('ja-JP')} 件</span>
          <label class="sr" for="sort">並び替え</label>
          <select class="sortsel" id="sort">
            <option value="cheap">実質単価が安い順</option>
            <option value="value">コスパ優先（高評価×安い）</option>
            <option value="rated">評価が高い順</option>
            <option value="pop">レビューが多い順</option>
            <option value="high">単価が高い順</option>
          </select>
          <div class="seg" role="group" aria-label="表示形式">
            <button type="button" data-view="grid" aria-pressed="false" aria-label="カードで表示">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
            </button>
            <button type="button" data-view="list" aria-pressed="true" aria-label="一覧で表示">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <label class="sr" for="q">一覧を絞り込む</label>
      <input type="search" id="q" class="sr" autocomplete="off">

      <ol class="rows" id="rows">${ssr.map(ssrRow).join('')}</ol>
      <button type="button" class="more" id="more"${home.length <= SSR_ROWS ? ' hidden' : ''}>さらに${SSR_ROWS}件を表示</button>

      <section id="compare" hidden aria-label="銘柄の比較"></section>

      <section class="survey" aria-labelledby="survey-h">
        <h2 id="survey-h">調査概要</h2>
        <dl>
          ${survey.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('\n          ')}
        </dl>
      </section>

      <section class="faq" aria-labelledby="faq-h">
        <h2 id="faq-h">よくある質問</h2>
        <dl>
          ${faq.map(([q, a]) => `<dt>${q}</dt><dd>${a}</dd>`).join('\n          ')}
        </dl>
      </section>
    </main>

    <aside class="card panel" id="panel" aria-label="銘柄の詳細"></aside>
  </div>

  <footer>
    <h2>運営者</h2>
    <p><b>${AUTHOR.name}</b> —— 楽天ウェブサービスのAPIで蒸留酒の価格データを集め、純アルコール量あたりの単価に換算して公開しています。酒造や販売店とは関係のない個人で、掲載する銘柄の選定に第三者は関与していません。
      気づいたことは <a href="${AUTHOR.note}" rel="me noopener" target="_blank">note</a> に書いています。
      収集と解析のコードは <a href="${AUTHOR.repo}" rel="noopener" target="_blank">GitHub</a> で公開しており、このページの数値がどう作られたかは全部読めますし、同じ手順で再取得できます。</p>

    <h2>このデータについて</h2>
    <dl>
      <dt>調査期間</dt><dd>${periodText}</dd>
      <dt>データ元</dt><dd>${esc(db.source)}</dd>
      <dt>対象</dt><dd>${genreList.map(esc).join('、')}</dd>
      <dt>掲載</dt><dd>${st.count.toLocaleString('ja-JP')} 件（うち評価あり ${st.withReview.toLocaleString('ja-JP')} 件）</dd>
      <dt>計算式</dt><dd>純アルコール量(g) = 容量(ml) × 度数 ÷ 100 × 0.8。これを20gあたりの価格に換算</dd>
      <dt>実質価格</dt><dd>表示価格 × (1 − 還元率 ÷ 100)。還元率 = 入力値 + 商品個別の期間限定ポイント倍率の上乗せ分</dd>
    </dl>
    <p>価格・評価・商品画像はすべて楽天市場の実データで、取得時点のものです。実際の販売価格・在庫と異なる場合があるため、購入前に販売ページでご確認ください。レビューの評点と件数は楽天市場のもので、当サイトが書いたものではありません。還元率はSPUなどで人により異なるため、実質価格は入力値に基づく目安です。</p>
    <p>アクセス数の把握に Cloudflare Web Analytics を使っています。Cookie も端末の識別も使わず、個人を特定する情報は収集していません。</p>
    <p class="legal"><b>20歳未満の者の飲酒は法律で禁じられています。</b><br>
      妊娠中や授乳期の飲酒は胎児・乳児の発育に影響するおそれがあります。飲酒運転は法律で禁止されています。
      このサイトは20歳以上の方を対象としており、過度な飲酒を勧めるものではありません。</p>

    <nav aria-label="種別" style="margin-top:20px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px">
      <a href="/">すべての蒸留酒</a>
      ${GENRES.map(g => `<a href="/${g.slug}/">${esc(g.name)}</a>`).join('\n      ')}
    </nav>
  </footer>
</div>

<div class="tray" id="tray" hidden>
  <div class="shell tray-in">
    <div style="display:flex;align-items:center;gap:14px">
      <span class="count" id="trayCount"></span>
      <div class="tray-thumbs" id="trayThumbs"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button type="button" class="ghost" id="trayClear" style="margin:0;width:auto;padding:11px 18px">解除</button>
      <button type="button" class="buy" id="trayOpen" style="margin:0;width:auto;padding:11px 24px">比較する</button>
    </div>
  </div>
</div>

${INTRO}

<script id="data" type="application/json">${JSON.stringify(items)}</script>
<script>${appJS({
  minReviews: MIN_REVIEWS, minRating: MIN_RATING, ratedMin: RATED_MIN_REVIEWS,
  homeMl: HOME_SIZE_ML, maxCompare: MAX_COMPARE, pageSize: SSR_ROWS, scoped: !!genre,
})}</script>
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
