// SpiritLens の見た目。テーマCSS・グラスSVG・オープニング演出のマークアップ。
//
// build.mjs から分離してある。データの取得と解析には一切触らないので、
// 見た目を変えたいときはこのファイルだけを読めばよい。
//
// 方針:
// - 黒とチャコールの地に、琥珀と金を差し色。実際のバーの質感を狙い、ネオンや
//   強いガラス模倣（グラスモーフィズム）は使わない
// - バーの背景は既定では画像を使わず、暖色の光源をCSSで重ねて作る。
//   dist/assets/bar.jpg を置けばそちらが優先される（build.mjs が差し替える）
// - グラスはDOM上に1つだけ。オープニングでもヒーローでも同じ要素を動かす

export const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Murecho:wght@300..800&display=swap">';

/**
 * グラス。DOM上に1つだけ置き、オープニングとヒーローで共有する。
 * 液体は内壁の clipPath で抜いてあるので、傾いた側面に沿って溜まる。
 */
/**
 * グラス。実写の動画を使う。
 *
 * 静止画に CSS のマスクを掛けて液面を上げる方法は、どう調整しても作り物に見えた。
 * 実際に注いでいる映像を使えば、液の筋も泡も屈折も本物になる。
 *
 * 動画は3.6秒・540×766・190KB。最後のフレームが poster と同じ絵なので、
 * 再生しない経路（演出をスキップ／視差効果を減らす設定／2回目以降）では
 * poster だけが出て、再生した場合と同じ絵で終わる。**差し替わって見えない。**
 *
 * 元映像の右側には実在ブランドのボトルが写っているが、
 * ffmpeg の crop で範囲外にしてある（dist/assets/CREDITS.md 参照）。
 */
export const GLASS = `
<div class="glass" aria-hidden="true">
  <video class="glass-video" id="pour" muted playsinline preload="none" tabindex="-1"
         poster="/assets/glass-poster.jpg" width="540" height="766">
    <source src="/assets/pour.mp4" type="video/mp4">
  </video>
</div>`;

/** オープニングの覆い。グラス自体はヒーロー側にあり、ここには背景と操作だけ置く。 */
export const INTRO = `
<div class="intro" id="intro">
  <div class="intro-veil" aria-hidden="true"></div>
  <p class="intro-word" aria-hidden="true">SpiritLens</p>
  <button type="button" class="intro-skip" id="introSkip">スキップ</button>
</div>`;

export const STYLES = `
:root{
  --bg:#0a0908; --bg2:#121010; --panel:#18150f; --panel2:#201b14; --raise:#282118;
  --line:rgba(226,198,150,.13); --line2:rgba(226,198,150,.26);
  --ink:#f4eee2; --sub:#ab9f8c; --faint:#7e7364;
  --gold:#e3b671; --gold2:#c8933f; --gold-wash:rgba(227,182,113,.10);
  --good:#8fbfa4;
  --f-disp:'Cormorant Garamond',Georgia,'Times New Roman',serif;
  --f-body:Murecho,'Hiragino Sans','Yu Gothic',system-ui,sans-serif;
  --shell:1480px; --r:3px;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{color-scheme:dark;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);
  font-size:14px;line-height:1.7;font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--gold);text-decoration:none}
a:hover{color:#f2cd93}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
img{max-width:100%}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}
.shell{max-width:var(--shell);margin:0 auto;padding:0 24px}

/* ── バーの地。既定は画像なしで、暖色の光源を重ねて作る ───────────── */
.bar{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;isolation:isolate}
.bar::before{content:'';position:absolute;inset:0;background:var(--bar-image,none);
  background-size:cover;background-position:center 42%;opacity:1;filter:saturate(1.05) brightness(1.08)}
.bar-lights{position:absolute;inset:0;mix-blend-mode:screen;opacity:.55;
  background:
    radial-gradient(38rem 24rem at 12% 22%,rgba(255,168,72,.30),transparent 62%),
    radial-gradient(30rem 20rem at 78% 16%,rgba(255,142,48,.24),transparent 64%),
    radial-gradient(22rem 16rem at 52% 68%,rgba(255,196,110,.16),transparent 66%),
    radial-gradient(44rem 30rem at 92% 74%,rgba(180,96,26,.16),transparent 64%)}
.bar-shelf{position:absolute;inset:0;opacity:.18;
  background:repeating-linear-gradient(90deg,
    rgba(255,186,104,.055) 0 4px,transparent 4px 13px,
    rgba(255,152,70,.045) 13px 17px,transparent 17px 30px);
  -webkit-mask-image:linear-gradient(to bottom,#000 0,#000 46%,transparent 78%);
  mask-image:linear-gradient(to bottom,#000 0,#000 46%,transparent 78%)}
.bar-veil{position:absolute;inset:0;
  background:
    linear-gradient(to right,rgba(8,7,6,.94) 0%,rgba(8,7,6,.72) 42%,rgba(8,7,6,.38) 68%,rgba(8,7,6,.62) 100%),
    linear-gradient(to bottom,rgba(8,7,6,.55) 0%,rgba(8,7,6,.10) 34%,rgba(8,7,6,.66) 78%,var(--bg) 99%)}

/* ── ヘッダー ───────────────────────────────────────────────── */
.top{position:sticky;top:0;z-index:40;background:rgba(10,9,8,.92);border-bottom:1px solid var(--line)}
.top-in{display:flex;align-items:center;gap:32px;height:66px}
.brand{display:flex;align-items:center;gap:11px;flex-shrink:0}
.brand svg{width:26px;height:32px;flex:none}
.brand b{font-family:var(--f-disp);font-size:26px;font-weight:600;letter-spacing:.012em;line-height:1}
.brand span{display:block;font-size:9px;letter-spacing:.17em;color:var(--faint);margin-top:2px}
.nav{display:flex;gap:4px;margin:0 auto}
.nav a{padding:9px 15px;font-size:13.5px;color:var(--sub);border-bottom:2px solid transparent}
.nav a:hover{color:var(--ink)}
.nav a[aria-current="page"]{color:var(--ink);border-bottom-color:var(--gold)}
.top-act{display:flex;gap:6px;flex-shrink:0}
.icon-btn{width:38px;height:38px;display:grid;place-items:center;background:none;
  border:1px solid transparent;border-radius:var(--r);color:var(--sub);cursor:pointer}
.icon-btn:hover{color:var(--ink);border-color:var(--line2)}

/* ── ヒーロー ───────────────────────────────────────────────── */
/* .hero に isolation を置かないこと。積み重ねコンテキストができて、
   グラスの z-index が中に閉じ込められ、暗幕の下に潜って ぼかされる。
   混色を使うのは .bar の中だけなので、隔離もそこで足りる。 */
.hero{position:relative;border-bottom:1px solid var(--line)}
.hero-in{position:relative;display:grid;
  /* グラスに独立した列を与える。絶対配置で重ねると必ず文字に被る。 */
  /* 列の並びは DOM の並び（見出し → 気分 → グラス）に合わせること。
     入れ替わっていると、気分パネルがグラス用の狭い列に入って潰れる。 */
  grid-template-columns:minmax(0,1fr) 290px minmax(190px,250px);
  gap:36px;align-items:center;min-height:360px;
  /* padding の一括指定は使わない。.shell の左右余白まで消してしまい、
     見出しが画面の左端に貼り付く。 */
  padding-top:52px}
.hero-copy{max-width:36rem}
.hero h1{margin:0 0 14px;font-size:clamp(27px,3.2vw,42px);font-weight:300;line-height:1.34;letter-spacing:.01em;
  /* 「ウイスキーの一/杯に、」のように語の途中で割れるのを防ぐ */
  word-break:keep-all;overflow-wrap:break-word}
.hero h1 em{font-style:normal;font-weight:700}
.hero p{margin:0 0 26px;font-size:14.5px;line-height:1.95;color:var(--sub)}
.seek{display:flex;align-items:center;gap:12px;padding:0 6px 0 16px;background:rgba(18,16,14,.86);
  border:1px solid var(--line2);border-radius:var(--r);max-width:34rem}
.seek input{flex:1;min-width:0;padding:14px 0;background:none;border:0;color:var(--ink);
  font-family:var(--f-body);font-size:14.5px}
.seek input::placeholder{color:var(--faint)}
.seek input:focus{outline:none}
.seek button{width:42px;height:34px;display:grid;place-items:center;background:var(--gold);
  border:0;border-radius:2px;color:#17120b;cursor:pointer}
.seek button:hover{background:#f0c581}
.moods{background:rgba(16,14,12,.72);border:1px solid var(--line);border-radius:var(--r);padding:18px}
.moods h2{margin:0 0 12px;font-size:11.5px;font-weight:400;letter-spacing:.13em;color:var(--sub)}
.moods button{display:flex;align-items:center;gap:11px;width:100%;padding:9px 8px;background:none;
  border:0;border-radius:2px;color:var(--ink);font-size:13px;text-align:left;cursor:pointer}
.moods button:hover{background:var(--gold-wash)}
.moods svg{width:15px;height:15px;color:var(--gold);flex:none}

/* ── グラス。DOMは1つ。オープニングではこれを画面中央へ飛ばす ─────── */
.glass-slot{position:relative;width:100%;max-width:250px;justify-self:center;align-self:end;
  margin-bottom:-2px;z-index:2;pointer-events:none;
  /* FLIPの中心計算が原点に依存するので、原点は必ず中央に置くこと */
  transform-origin:50% 50%;will-change:transform,opacity}
.glass{position:relative;width:100%;aspect-ratio:540/766;overflow:hidden}
.glass-video{display:block;width:100%;height:100%;object-fit:cover;background:#070605}
/* 四角い映像の縁を地に溶かす。
   上から暗い色を重ねる方法だと、背後の色が変わる場所で境目が出る。
   映像そのものを mask で透明に落とすほうが、どこに置いても馴染む。 */
.glass{-webkit-mask-image:radial-gradient(68% 60% at 50% 47%,#000 52%,rgba(0,0,0,.72) 76%,transparent 99%);
  mask-image:radial-gradient(68% 60% at 50% 47%,#000 52%,rgba(0,0,0,.72) 76%,transparent 99%)}
/* 演出中は背後に光を置き、縁の溶かしを弱める */
.glass-slot::before{content:'';position:absolute;inset:-22% -34% -14%;z-index:-1;opacity:0;
  background:radial-gradient(52% 44% at 50% 56%,rgba(226,150,66,.46),rgba(226,150,66,0) 70%);
  transition:opacity 700ms linear}
html.intro-on .glass-slot{z-index:110;transition:none}
html.intro-on .glass-slot::before{opacity:1}
html.intro-travel .glass-slot{transition:transform 880ms cubic-bezier(.2,.86,.3,1.04),opacity 320ms linear}
html.intro-travel .glass-slot::before{opacity:0}

/* ── オープニングの覆い ─────────────────────────────────────── */
.intro{position:fixed;inset:0;z-index:100;display:grid;place-items:center}
html.intro-done .intro{display:none}
.intro-veil{position:absolute;inset:0;
  /* 中央に暖色の光を置く。真っ黒の上に黒いガラスを描いても何も見えない。 */
  background:radial-gradient(42rem 34rem at 50% 48%,rgba(150,86,28,.34),rgba(6,5,5,0) 68%),rgba(6,5,5,.94);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.intro-word{position:absolute;bottom:16vh;margin:0;font-family:var(--f-disp);font-size:clamp(22px,3vw,34px);
  letter-spacing:.3em;color:var(--gold);opacity:0;transition:opacity 500ms linear}
html.intro-travel .intro-word{opacity:.9}
.intro-skip{position:absolute;top:22px;right:24px;padding:9px 17px;background:rgba(24,20,16,.8);
  border:1px solid var(--line2);border-radius:var(--r);color:var(--sub);font-size:12.5px;cursor:pointer}
.intro-skip:hover{color:var(--ink);border-color:var(--gold)}
.intro{opacity:1;transition:opacity 620ms linear}
html.intro-out .intro{opacity:0}
html.intro-out .intro-veil{-webkit-backdrop-filter:none;backdrop-filter:none}

/* オープニング中は本体を伏せる。演出が終わると戻る */
.veiled{opacity:0}
html.intro-done .veiled,html:not(.intro-on) .veiled{opacity:1;transition:opacity 620ms linear}

/* ── 本体レイアウト: 絞り込み / 一覧 / 詳細 ───────────────────── */
.work{display:grid;grid-template-columns:232px minmax(0,1fr) 336px;gap:22px;
  align-items:start;padding:26px 0 72px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r)}
.side{position:sticky;top:82px;padding:18px}
.side h2{margin:0;font-size:12px;font-weight:500;letter-spacing:.1em;color:var(--sub)}
.side-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px}
.side-head button{background:none;border:0;color:var(--faint);font-size:11.5px;cursor:pointer}
.side-head button:hover{color:var(--gold)}
.grp{margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.grp:last-child{margin:0;padding:0;border:0}
.grp h3{margin:0 0 11px;font-size:12.5px;font-weight:500;color:var(--ink)}
.opt{display:flex;align-items:center;gap:9px;padding:4px 0;font-size:12.5px;color:var(--sub);cursor:pointer}
.opt:hover{color:var(--ink)}
.opt input{width:14px;height:14px;accent-color:var(--gold);cursor:pointer;flex:none}
.opt .n{margin-left:auto;color:var(--faint);font-size:11.5px}
.rng{width:100%;accent-color:var(--gold);cursor:pointer}
.rng-val{display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint);margin-top:5px}
.stars{display:flex;gap:2px}
.stars button{background:none;border:0;padding:0 1px;color:var(--faint);cursor:pointer;line-height:1}
.stars button[data-on="1"]{color:var(--gold)}

/* 一覧 */
.list-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
  padding:0 2px 14px;flex-wrap:wrap}
.list-head h2{margin:0 0 4px;font-size:19px;font-weight:600}
.list-head p{margin:0;font-size:12.5px;color:var(--sub)}
.list-tools{display:flex;align-items:center;gap:10px;flex-shrink:0}
.count{font-size:12.5px;color:var(--sub)}
.seg{display:flex;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.seg button{width:34px;height:30px;display:grid;place-items:center;background:none;border:0;
  color:var(--faint);cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--raise);color:var(--gold)}
.sortsel{padding:7px 10px;background:var(--panel2);border:1px solid var(--line);border-radius:var(--r);
  color:var(--ink);font-family:var(--f-body);font-size:12.5px;cursor:pointer}

.rows{display:flex;flex-direction:column;gap:9px;list-style:none;margin:0;padding:0}
.row{display:grid;grid-template-columns:auto 104px minmax(0,1fr) 128px 148px 26px;gap:16px;
  align-items:center;padding:14px 16px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--r);cursor:pointer;transition:border-color 140ms linear,background 140ms linear}
.row:hover{border-color:var(--line2);background:var(--panel2)}
.row.on{border-color:var(--gold2);background:var(--gold-wash)}
.rank{width:20px;height:20px;display:grid;place-items:center;background:var(--raise);
  border-radius:2px;font-size:11px;color:var(--sub);font-family:var(--f-disp);font-weight:600}
.row:nth-child(-n+3) .rank{background:var(--gold);color:#16110a}
.shot{width:104px;height:104px;display:grid;place-items:center;background:#0e0c0a;
  border:1px solid var(--line);border-radius:2px;overflow:hidden}
.shot img{width:100%;height:100%;object-fit:contain;mix-blend-mode:normal}
.shot .ph{font-size:10px;color:var(--faint);text-align:center;padding:6px;line-height:1.5}
.nm{font-size:14px;font-weight:500;line-height:1.55;margin:0 0 5px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sub{font-size:11.5px;color:var(--faint);margin:0 0 7px}
.rate{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--gold)}
.rate i{font-style:normal}
.rate span{color:var(--sub)}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.tag{padding:2px 7px;border-radius:2px;font-size:10.5px;border:1px solid var(--line2);color:var(--sub)}
.tag.hot{color:#e9a38b;border-color:rgba(233,163,139,.4)}
.tag.val{color:var(--good);border-color:rgba(143,191,164,.4)}
.spec{font-size:11.5px;color:var(--sub);line-height:1.9}
.spec b{display:block;color:var(--faint);font-size:10.5px;font-weight:400}
.money{text-align:right}
.money .yen{font-family:var(--f-disp);font-size:22px;font-weight:600;line-height:1.2}
.money .per{margin-top:7px;padding-top:7px;border-top:1px solid var(--line)}
.money .per b{display:block;font-size:10px;color:var(--faint);font-weight:400;letter-spacing:.04em}
.money .per i{font-style:normal;font-family:var(--f-disp);font-size:20px;font-weight:600;color:var(--gold)}
.chev{color:var(--faint)}
.row:hover .chev{color:var(--gold)}
.more{width:100%;margin-top:18px;padding:13px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--r);color:var(--sub);font-size:13px;cursor:pointer}
.more:hover{color:var(--ink);border-color:var(--line2)}
.empty{padding:56px 16px;text-align:center;color:var(--faint);font-size:13px;line-height:2}

/* 碁盤目表示 */
.rows.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:12px}
.rows.grid .row{grid-template-columns:1fr;gap:10px;padding:14px}
.rows.grid .rank{position:absolute;margin:-4px 0 0 -4px}
.rows.grid .shot{width:100%;height:156px}
.rows.grid .spec,.rows.grid .chev{display:none}
.rows.grid .money{text-align:left;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.rows.grid .money .per{margin:0;padding:0;border:0;text-align:right}

/* 詳細 */
.panel{position:sticky;top:82px;overflow:hidden}
.panel-shot{position:relative;height:250px;display:grid;place-items:center;background:#0d0b09;
  border-bottom:1px solid var(--line)}
.panel-shot img{max-height:214px;width:auto;object-fit:contain}
.badge{position:absolute;top:12px;left:12px;padding:4px 10px;background:var(--gold);color:#16110a;
  border-radius:2px;font-size:10.5px;font-weight:700}
.panel-body{padding:18px}
.panel h2{margin:0 0 5px;font-size:17px;font-weight:600;line-height:1.45}
.panel .sub{margin-bottom:10px}
.tabs{display:flex;gap:2px;margin:16px 0 14px;border-bottom:1px solid var(--line)}
.tabs button{padding:8px 13px;background:none;border:0;border-bottom:2px solid transparent;
  color:var(--faint);font-size:12.5px;cursor:pointer}
.tabs button[aria-selected="true"]{color:var(--gold);border-bottom-color:var(--gold)}
.dl{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:12.5px;margin:0}
.dl dt{color:var(--faint)}
.dl dd{margin:0;text-align:right}
.bars{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.bars div{display:grid;grid-template-columns:52px 1fr 30px;gap:9px;align-items:center;font-size:11.5px}
.bars .t{color:var(--faint)}
.bars .m{height:3px;background:var(--raise);border-radius:2px;overflow:hidden}
.bars .m i{display:block;height:100%;background:var(--gold)}
.bars .v{text-align:right;color:var(--sub)}
.buy{display:block;margin-top:16px;padding:13px;background:var(--gold);color:#16110a;
  border:0;border-radius:var(--r);font-size:13.5px;font-weight:700;text-align:center;cursor:pointer;width:100%}
.buy:hover{background:#f0c581;color:#16110a}
.ghost{display:block;width:100%;margin-top:8px;padding:11px;background:none;border:1px solid var(--line2);
  border-radius:var(--r);color:var(--sub);font-size:12.5px;cursor:pointer;text-align:center}
.ghost:hover{color:var(--ink);border-color:var(--gold)}

/* 比較 */
.tray{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(12,10,9,.96);
  border-top:1px solid var(--line2);padding:12px 0}
.tray-in{display:flex;align-items:center;gap:14px;justify-content:space-between}
.tray-thumbs{display:flex;gap:7px}
.tray-thumbs span{width:40px;height:40px;background:#0e0c0a;border:1px solid var(--line);
  border-radius:2px;display:grid;place-items:center;overflow:hidden}
.tray-thumbs img{width:100%;height:100%;object-fit:contain}
.cmp-wrap{overflow-x:auto;margin-top:14px}
.cmp{min-width:44rem;display:grid;gap:9px}
.cmp .h{padding:13px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r)}
.cmp .cell{padding:10px 13px;font-size:13px;color:var(--sub)}
.cmp .cell.big{font-family:var(--f-disp);font-size:24px;font-weight:600;color:var(--ink)}
.cmp .cell.best{color:var(--gold);background:var(--gold-wash);border-radius:2px}
.cmp .lbl{padding:10px 0;font-size:11.5px;color:var(--faint)}

/* ── 出典・注記 ─────────────────────────────────────────────── */
.pr{padding:8px 0;font-size:11px;letter-spacing:.06em;color:var(--faint);text-align:center;
  border-bottom:1px solid var(--line);background:#060505}
.survey{margin:32px 0 0;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r)}
.survey h2,.faq h2{margin:0 0 14px;font-size:11.5px;font-weight:400;letter-spacing:.13em;color:var(--gold2)}
.survey dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;font-size:12.5px;line-height:1.8}
.survey dt{color:var(--faint);white-space:nowrap}
.survey dd{margin:0;color:var(--sub)}
.faq{margin-top:32px}
.faq dt{font-size:14px;font-weight:600;margin-top:18px;line-height:1.6}
.faq dd{margin:6px 0 0;font-size:12.5px;line-height:1.95;color:var(--sub)}
.faq dl{margin:0}
foot,footer{display:block;margin-top:40px;padding:26px 0 48px;border-top:1px solid var(--line);
  font-size:12.5px;color:var(--sub);line-height:1.95}
footer h2{margin:0 0 10px;font-size:11.5px;font-weight:400;letter-spacing:.13em;color:var(--gold2)}
footer dl{margin:0 0 18px;display:grid;grid-template-columns:max-content 1fr;gap:5px 18px}
footer dt{color:var(--faint)}
footer dd{margin:0}
.legal{margin-top:18px;padding:12px 16px;border-left:2px solid var(--gold2);color:var(--faint);font-size:12px}
.legal b{color:var(--ink)}

/* 年齢確認 */
#gate{position:fixed;inset:0;z-index:200;background:var(--bg);display:grid;place-items:center;padding:24px}
#gate .box{max-width:23rem;text-align:center}
#gate .mk{font-size:10.5px;letter-spacing:.25em;color:var(--gold2);margin-bottom:18px}
#gate h2{margin:0 0 10px;font-size:19px}
#gate p{margin:0 0 24px;color:var(--sub);font-size:13px;line-height:1.9}
#gate .no{display:block;margin:14px auto 0;background:none;border:0;color:var(--faint);
  font-size:12px;text-decoration:underline;cursor:pointer}

/* ── 画面幅 ─────────────────────────────────────────────────── */
@media (max-width:1240px){
  .work{grid-template-columns:208px minmax(0,1fr)}
  .panel{display:none}
}
@media (max-width:1080px){
  /* 3列に収まらなくなる幅。気分パネルを見出しの下へ回し、グラスは右に残す。 */
  .hero-in{grid-template-columns:minmax(0,1fr) minmax(190px,240px);gap:28px}
  .hero-copy{grid-column:1}
  .moods{grid-column:1;grid-row:2;margin-bottom:26px}
  .glass-slot{grid-column:2;grid-row:1 / span 2}
}
@media (max-width:900px){
  .shell{padding:0 16px}
  .top-in{height:58px;gap:14px}
  .nav{display:none}
  .hero-in{grid-template-columns:1fr;gap:22px;padding-top:28px;min-height:0}
  .hero-copy{order:1} .glass-slot{order:2;max-width:170px} .moods{order:3;margin-bottom:26px}
  .work{grid-template-columns:1fr;padding-top:18px}
  .side{position:static}
  .row{grid-template-columns:auto 76px minmax(0,1fr) 112px;gap:12px;padding:12px}
  .shot{width:76px;height:76px}
  .spec,.chev{display:none}
  .rows.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  /* 端末が非力なことを前提に、覆いのぼかしと注ぎの筋を外す */
  .intro-veil{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(6,5,5,.97)}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .glass,.glass-slot,.glass-slot::before,.intro,.veiled,.row{transition:none!important;animation:none!important}
}
`;
