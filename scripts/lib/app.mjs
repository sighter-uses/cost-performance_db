// SpiritLens のクライアント側。build.mjs が生成するHTMLに差し込む素のJS。
//
// 外部ライブラリは使わない。この構成には実行時依存が1つもなく、
// そこを崩さないほうが配信も保守も軽い。
//
// 担当は4つ:
//   1. オープニング演出の進行（FLIPでグラスを画面中央へ飛ばし、戻す）
//   2. 絞り込み・並べ替え・検索
//   3. 詳細パネル
//   4. 比較（最大4銘柄）

/**
 * @param {{minReviews:number,minRating:number,ratedMin:number,homeMl:number,
 *          maxCompare:number,pageSize:number,scoped:boolean}} cfg
 */
export const appJS = (cfg) => `
(() => {
  'use strict';
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var MIN_REVIEWS = ${cfg.minReviews}, MIN_RATING = ${cfg.minRating}, RATED_MIN = ${cfg.ratedMin};
  var HOME_ML = ${cfg.homeMl}, MAX = ${cfg.maxCompare}, PAGE = ${cfg.pageSize};
  var SCOPED = ${cfg.scoped ? 'true' : 'false'};

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var keyOf = function (i) { return i.n + '|' + i.p; };
  var byKey = {};
  DATA.forEach(function (i) { byKey[keyOf(i)] = i; });

  var store = function (k, v) { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  var read = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  var st = {
    q: '', sort: 'cheap', genres: {}, home: true, minRate: 0, maxPrice: 0, abvLo: 0, abvHi: 100,
    rate: 1, shown: PAGE, picks: [], sel: null, view: 'list', tab: 'sum'
  };

  /* ───── 1. オープニング ─────────────────────────────────────────
     グラスはヒーロー内の最終位置にある1要素。読み込み時にその矩形を測り、
     画面中央へ寄せる transform を無транジションで当て（FLIP）、
     最後に transform を外すと自然な位置へ戻る。要素を入れ替えないので
     「別の画像に切り替わった」ように見えることがない。 */
  var slot = document.querySelector('.glass-slot');
  var intro = $('intro');
  var timers = [];
  var introEnded = false;

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function endIntro(instant) {
    if (introEnded) return;
    introEnded = true;
    clearTimers();
    if (slot) { slot.style.transform = ''; slot.style.transition = ''; slot.style.opacity = ''; }
    // 再生しない経路では poster（＝映像の最終フレーム）がそのまま出る。
    // 再生した場合の終わりの絵と同じなので、経路によって見え方が変わらない。
    root.classList.remove('intro-on', 'intro-pour', 'intro-settle', 'intro-travel', 'intro-out');
    root.classList.add('intro-done');
    if (intro) {
      if (instant) { intro.remove(); }
      else { setTimeout(function () { if (intro.parentNode) intro.remove(); }, 640); }
    }
    try { sessionStorage.setItem('sl-intro', '1'); } catch (e) {}
    var s = $('q');
    if (s && innerWidth > 900) s.focus({ preventScroll: true });
  }

  function playIntro() {
    var slotEl = slot, video = $('pour');
    if (!slotEl || !intro) return endIntro(true);
    scrollTo(0, 0);
    var r = slotEl.getBoundingClientRect();
    if (!r.height) return endIntro(true);
    var target = Math.min(innerHeight * 0.62, 560);
    var k = target / r.height;
    var dx = innerWidth / 2 - (r.left + r.width / 2);
    var dy = innerHeight / 2 - (r.top + r.height / 2);
    slotEl.style.opacity = '0';
    slotEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')';
    root.classList.add('intro-on');

    // Scene 1 — 暗い画面にグラスが浮かび上がる
    timers.push(setTimeout(function () {
      slotEl.style.transition = 'opacity 520ms linear';
      slotEl.style.opacity = '1';
    }, 40));

    // Scene 2 — 実際に注がれる映像。自動再生が拒否されたら演出ごと畳む。
    if (!video) return endIntro(true);
    video.preload = 'auto';
    video.currentTime = 0;
    var started = false;
    timers.push(setTimeout(function () {
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () { endIntro(false); });
      else started = true;
    }, 360));
    video.addEventListener('playing', function () { started = true; }, { once: true });
    // 再生が始まらない端末では待たせない
    timers.push(setTimeout(function () { if (!started) endIntro(false); }, 1500));

    // Scene 3 — 映像が終わる少し前から手前へ。inline transform を外すと本来の位置へ戻る。
    timers.push(setTimeout(function () {
      slotEl.style.transition = '';
      root.classList.add('intro-travel');
      slotEl.style.transform = '';
    }, 2760));
    // Scene 4 — 覆いが引き、ホームが現れる
    timers.push(setTimeout(function () { root.classList.add('intro-out'); }, 3340));
    timers.push(setTimeout(function () { endIntro(false); }, 3980));
    // 映像が先に終わったらそこで畳む
    video.addEventListener('ended', function () {
      timers.push(setTimeout(function () { endIntro(false); }, 420));
    }, { once: true });
  }

  var skip = $('introSkip');
  if (skip) skip.addEventListener('click', function () { endIntro(false); });
  addEventListener('keydown', function (e) {
    if (!introEnded && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) endIntro(false);
  });

  // 年齢確認は演出より前に立つ（z-index 200 対 100）。先に流すと、
  // 覆いの裏で誰にも見られないまま3.5秒が終わってしまう。確認のあとに始める。
  function startIntro() {
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var seen = false;
    try { seen = sessionStorage.getItem('sl-intro') === '1'; } catch (e) {}
    if (location.search.indexOf('intro=1') >= 0) seen = false;
    if (reduced || seen) return endIntro(true);
    if (document.readyState === 'complete') playIntro();
    else addEventListener('load', playIntro, { once: true });
  }

  /* ───── 2. 絞り込み ───────────────────────────────────────────── */
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var num = function (n) { return n.toLocaleString('ja-JP', { maximumFractionDigits: 1 }); };
  var effRate = function (i) { return st.rate + Math.max(0, (i.pt || 1) - 1); };
  var eff = function (i) { return i.y * (1 - effRate(i) / 100); };
  var effPrice = function (i) { return i.p * (1 - effRate(i) / 100); };

  function picked() {
    var r = DATA;
    if (st.home) r = r.filter(function (i) { return i.v <= HOME_ML; });
    var on = Object.keys(st.genres).filter(function (g) { return st.genres[g]; });
    if (on.length) r = r.filter(function (i) { return on.indexOf(i.g) >= 0; });
    if (st.minRate) r = r.filter(function (i) { return i.c > 0 && i.r >= st.minRate; });
    if (st.maxPrice) r = r.filter(function (i) { return i.p <= st.maxPrice; });
    if (st.abvLo > 0 || st.abvHi < 100) r = r.filter(function (i) { return i.a >= st.abvLo && i.a <= st.abvHi; });
    if (st.q) {
      var q = st.q.toLowerCase();
      r = r.filter(function (i) { return (i.n + ' ' + i.g).toLowerCase().indexOf(q) >= 0; });
    }
    r = r.slice();
    if (st.sort === 'rated') return r.filter(function (i) { return i.c >= RATED_MIN; })
      .sort(function (a, b) { return (b.r - a.r) || (b.c - a.c); });
    if (st.sort === 'value') return r.filter(function (i) { return i.c >= MIN_REVIEWS && i.r >= MIN_RATING; })
      .sort(function (a, b) { return eff(a) - eff(b); });
    if (st.sort === 'pop') return r.sort(function (a, b) { return (b.c - a.c) || (b.r - a.r); });
    if (st.sort === 'high') return r.sort(function (a, b) { return eff(b) - eff(a); });
    return r.sort(function (a, b) { return eff(a) - eff(b); });
  }

  /* ───── 3. 描画 ───────────────────────────────────────────────── */
  function shotHTML(i, cls) {
    if (!i.im) return '<span class="ph">画像なし</span>';
    return '<img src="' + esc(i.im) + '" alt="" loading="lazy" decoding="async" width="200" height="200"' +
      ' onerror="this.parentNode.innerHTML=\\'<span class=&quot;ph&quot;>画像を読み込めません</span>\\'">';
  }

  function tagsHTML(i) {
    var t = '';
    if (i.c >= 200) t += '<span class="tag hot">人気</span>';
    if (i.r >= 4.5 && i.c >= MIN_REVIEWS) t += '<span class="tag">高評価</span>';
    if (i.pt > 1) t += '<span class="tag val">ポイント' + i.pt + '倍</span>';
    if (i.sp) t += '<span class="tag">送料別</span>';
    return t ? '<div class="tags">' + t + '</div>' : '';
  }

  function rowHTML(i, n) {
    var k = keyOf(i);
    return '<li class="row' + (st.sel === k ? ' on' : '') + '" data-k="' + esc(k) + '" tabindex="0" role="button">' +
      '<span class="rank">' + (n + 1) + '</span>' +
      '<span class="shot">' + shotHTML(i) + '</span>' +
      '<span><span class="nm">' + esc(i.n) + '</span>' +
        '<span class="sub">' + esc(i.g) + ' ・ ' + i.a + '% ・ ' + i.v.toLocaleString('ja-JP') + 'ml' +
        (i.s > 1 ? ' × ' + i.s : '') + '</span>' +
        (i.c > 0
          ? '<span class="rate"><i>★</i> ' + i.r.toFixed(1) + ' <span>(' + i.c.toLocaleString('ja-JP') + ')</span></span>'
          : '<span class="rate"><span>評価なし</span></span>') +
        tagsHTML(i) + '</span>' +
      '<span class="spec"><b>アルコール度数</b>' + i.a + '%<br><b>容量</b>' +
        i.v.toLocaleString('ja-JP') + 'ml<br><b>純アルコール</b>' + num(i.w) + ' g</span>' +
      '<span class="money"><span class="yen">¥' + Math.round(effPrice(i)).toLocaleString('ja-JP') + '</span>' +
        '<span class="per"><b>純アルコール20gあたり</b><i>¥' + num(eff(i)) + '</i></span></span>' +
      '<span class="chev" aria-hidden="true">›</span></li>';
  }

  function render() {
    var rows = picked();
    $('count').textContent = rows.length.toLocaleString('ja-JP') + ' 件';
    var ul = $('rows');
    ul.className = 'rows' + (st.view === 'grid' ? ' grid' : '');
    if (!rows.length) {
      ul.innerHTML = '<li class="empty">条件に合う銘柄がありません。<br>絞り込みを緩めるか、短い語で検索してください。</li>';
      $('more').hidden = true;
      renderPanel(); renderTray();
      return;
    }
    ul.innerHTML = rows.slice(0, st.shown).map(rowHTML).join('');
    $('more').hidden = rows.length <= st.shown;
    $('more').textContent = 'さらに' + Math.min(PAGE, rows.length - st.shown) + '件を表示';
    if (!st.sel || !byKey[st.sel]) st.sel = keyOf(rows[0]);
    renderPanel(); renderTray();
  }

  function renderPanel() {
    var box = $('panel');
    if (!box) return;
    var i = byKey[st.sel];
    if (!i) { box.hidden = true; return; }
    box.hidden = false;
    var tab = st.tab;
    var body;
    if (tab === 'price') {
      body = '<dl class="dl">' +
        '<dt>表示価格</dt><dd>¥' + i.p.toLocaleString('ja-JP') + '</dd>' +
        '<dt>還元率</dt><dd>' + effRate(i) + '%</dd>' +
        '<dt>実質価格</dt><dd>¥' + Math.round(effPrice(i)).toLocaleString('ja-JP') + '</dd>' +
        '<dt>純アルコール量</dt><dd>' + num(i.w) + ' g</dd>' +
        '<dt>20gあたり（定価）</dt><dd>¥' + num(i.y) + '</dd>' +
        '<dt>20gあたり（実質）</dt><dd>¥' + num(eff(i)) + '</dd>' +
        '<dt>送料</dt><dd>' + (i.sp ? '別' : '込み／不明') + '</dd></dl>' +
        '<p style="margin:14px 0 0;font-size:11.5px;color:var(--faint);line-height:1.8">還元率は入力値に商品個別の期間限定ポイント倍率を上乗せした値です。買いまわりの倍率と獲得上限は反映していません。</p>';
    } else if (tab === 'rev') {
      body = i.c > 0
        ? '<div class="bars">' +
            bar('総合', i.r) +
            '</div><p style="margin:14px 0 0;font-size:12px;color:var(--sub);line-height:1.9">楽天市場のレビュー ' +
            i.c.toLocaleString('ja-JP') + ' 件の平均です。味・香りなどの内訳はAPIが返さないため出していません。</p>'
        : '<p style="margin:0;font-size:12.5px;color:var(--sub);line-height:1.9">この商品にはまだレビューがありません。</p>';
    } else {
      body = '<dl class="dl">' +
        '<dt>種別</dt><dd>' + esc(i.g) + '</dd>' +
        '<dt>容量</dt><dd>' + i.v.toLocaleString('ja-JP') + 'ml' + (i.s > 1 ? ' × ' + i.s + '本' : '') + '</dd>' +
        '<dt>アルコール度数</dt><dd>' + i.a + '%</dd>' +
        '<dt>純アルコール量</dt><dd>' + num(i.w) + ' g</dd>' +
        '<dt>参考価格</dt><dd>¥' + i.p.toLocaleString('ja-JP') + '</dd>' +
        '<dt>20gあたり</dt><dd style="color:var(--gold)">¥' + num(eff(i)) + '</dd>' +
        '</dl>' + (i.c > 0 ? '<div class="bars">' + bar('評価', i.r) + '</div>' : '');
    }
    box.innerHTML =
      '<div class="panel-shot"><span class="badge">注目の銘柄</span>' + shotHTML(i) + '</div>' +
      '<div class="panel-body"><h2>' + esc(i.n) + '</h2>' +
      '<p class="sub">' + esc(i.g) + ' ・ ' + i.a + '% ・ ' + i.v.toLocaleString('ja-JP') + 'ml</p>' +
      (i.c > 0 ? '<span class="rate"><i>★</i> ' + i.r.toFixed(1) + ' <span>(' + i.c.toLocaleString('ja-JP') + ')</span></span>' : '') +
      '<div class="tabs" role="tablist">' +
        tabBtn('sum', '概要') + tabBtn('rev', 'レビュー') + tabBtn('price', '価格') +
      '</div>' + body +
      '<a class="buy" href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener">楽天市場で見る</a>' +
      '<button type="button" class="ghost" data-add="' + esc(keyOf(i)) + '">' +
        (st.picks.indexOf(keyOf(i)) >= 0 ? '比較リストから外す' : '比較リストに追加') + '</button></div>';
  }
  function tabBtn(id, label) {
    return '<button type="button" role="tab" data-tab="' + id + '" aria-selected="' +
      (st.tab === id) + '">' + label + '</button>';
  }
  function bar(label, v) {
    return '<div><span class="t">' + label + '</span><span class="m"><i style="width:' +
      (v / 5 * 100).toFixed(0) + '%"></i></span><span class="v">' + v.toFixed(1) + '</span></div>';
  }

  function renderTray() {
    var tray = $('tray');
    if (!tray) return;
    tray.hidden = st.picks.length === 0;
    if (!st.picks.length) return;
    $('trayCount').textContent = st.picks.length + ' / ' + MAX + ' 銘柄';
    $('trayThumbs').innerHTML = st.picks.map(function (k) {
      var i = byKey[k];
      return '<span>' + (i ? shotHTML(i) : '') + '</span>';
    }).join('');
  }

  function renderCompare() {
    var sec = $('compare');
    var list = st.picks.map(function (k) { return byKey[k]; }).filter(Boolean);
    if (!list.length) { sec.hidden = true; sec.innerHTML = ''; return; }
    sec.hidden = false;
    var bestY = Math.min.apply(null, list.map(eff));
    var bestP = Math.min.apply(null, list.map(effPrice));
    var bestR = Math.max.apply(null, list.map(function (i) { return i.r; }));
    var line = function (label, fn) {
      return '<div class="lbl">' + label + '</div>' + list.map(fn).join('');
    };
    sec.innerHTML = '<div class="list-head"><div><h2>比較</h2><p>各行で最も有利な値を金色にしています</p></div>' +
      '<button type="button" class="sortsel" id="cmpClose">閉じる</button></div>' +
      '<div class="cmp-wrap"><div class="cmp" style="grid-template-columns:120px repeat(' + list.length + ',minmax(0,1fr))">' +
      '<div></div>' + list.map(function (i) {
        return '<div class="h"><div class="shot" style="width:100%;height:120px;margin-bottom:10px">' + shotHTML(i) + '</div>' +
          '<span class="nm">' + esc(i.n) + '</span><span class="sub">' + esc(i.g) + '</span></div>';
      }).join('') +
      line('実質 ¥/20g', function (i) { return '<div class="cell big' + (eff(i) === bestY ? ' best' : '') + '">¥' + num(eff(i)) + '</div>'; }) +
      line('実質価格', function (i) { return '<div class="cell' + (effPrice(i) === bestP ? ' best' : '') + '">¥' + Math.round(effPrice(i)).toLocaleString('ja-JP') + '</div>'; }) +
      line('評価', function (i) { return '<div class="cell' + (i.c > 0 && i.r === bestR ? ' best' : '') + '">' + (i.c > 0 ? i.r.toFixed(1) + '（' + i.c + '）' : '—') + '</div>'; }) +
      line('度数', function (i) { return '<div class="cell">' + i.a + '%</div>'; }) +
      line('容量', function (i) { return '<div class="cell">' + i.v.toLocaleString('ja-JP') + 'ml' + (i.s > 1 ? ' × ' + i.s : '') + '</div>'; }) +
      line('純アルコール', function (i) { return '<div class="cell">' + num(i.w) + ' g</div>'; }) +
      '<div></div>' + list.map(function (i) {
        return '<div><a class="buy" href="' + esc(i.u) + '" target="_blank" rel="nofollow sponsored noopener">楽天市場で見る</a></div>';
      }).join('') + '</div></div>';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function togglePick(k) {
    var at = st.picks.indexOf(k);
    if (at >= 0) st.picks.splice(at, 1);
    else if (st.picks.length < MAX) st.picks.push(k);
    else return;
    store('sl-picks', JSON.stringify(st.picks));
    render();
    if (!$('compare').hidden) renderCompare();
  }

  /* ───── 4. 操作 ───────────────────────────────────────────────── */
  var timer;
  function onSearch(v) {
    clearTimeout(timer);
    timer = setTimeout(function () { st.q = v.trim(); st.shown = PAGE; render(); }, 110);
  }
  $('q').addEventListener('input', function (e) { onSearch(e.target.value); });
  var hq = $('heroQ');
  if (hq) hq.addEventListener('input', function (e) { $('q').value = e.target.value; onSearch(e.target.value); });
  var hf = $('heroForm');
  if (hf) hf.addEventListener('submit', function (e) {
    e.preventDefault();
    document.querySelector('.work').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('rows').addEventListener('click', function (e) {
    var row = e.target.closest('.row');
    if (row) { st.sel = row.dataset.k; render(); }
  });
  $('rows').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var row = e.target.closest('.row');
    if (row) { e.preventDefault(); st.sel = row.dataset.k; render(); }
  });
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) { togglePick(add.dataset.add); return; }
    var tab = e.target.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; renderPanel(); return; }
    if (e.target.closest('#cmpClose')) { $('compare').hidden = true; return; }
  });

  document.querySelectorAll('[data-genre]').forEach(function (el) {
    el.addEventListener('change', function () {
      st.genres[el.dataset.genre] = el.checked;
      st.shown = PAGE; render();
    });
  });
  var homeBox = $('homeOnly');
  if (homeBox) homeBox.addEventListener('change', function () { st.home = homeBox.checked; st.shown = PAGE; render(); });

  $('sort').addEventListener('change', function (e) { st.sort = e.target.value; st.shown = PAGE; render(); });
  $('more').addEventListener('click', function () { st.shown += PAGE; render(); });

  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      st.view = b.dataset.view;
      document.querySelectorAll('[data-view]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      store('sl-view', st.view);
      render();
    });
  });

  var price = $('price');
  if (price) price.addEventListener('input', function () {
    st.maxPrice = Number(price.value) >= Number(price.max) ? 0 : Number(price.value);
    $('priceVal').textContent = st.maxPrice ? '¥1,000 〜 ¥' + st.maxPrice.toLocaleString('ja-JP') : '¥1,000 〜 上限なし';
    st.shown = PAGE; render();
  });
  var abv = $('abv');
  if (abv) abv.addEventListener('input', function () {
    st.abvHi = Number(abv.value);
    $('abvVal').textContent = '0% 〜 ' + st.abvHi + '%';
    st.shown = PAGE; render();
  });
  var rate = $('rate');
  if (rate) rate.addEventListener('input', function () {
    st.rate = Number(rate.value);
    $('rateVal').textContent = st.rate + '%';
    store('sl-rate', st.rate);
    render();
  });
  document.querySelectorAll('[data-star]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = Number(b.dataset.star);
      st.minRate = st.minRate === v ? 0 : v;
      document.querySelectorAll('[data-star]').forEach(function (o) {
        o.dataset.on = Number(o.dataset.star) <= st.minRate ? '1' : '0';
      });
      $('starVal').textContent = st.minRate ? '★' + st.minRate + ' 以上' : 'すべて';
      st.shown = PAGE; render();
    });
  });
  $('reset').addEventListener('click', function () {
    st.genres = {}; st.minRate = 0; st.maxPrice = 0; st.abvHi = 100; st.home = true; st.q = '';
    document.querySelectorAll('[data-genre]').forEach(function (el) { el.checked = false; });
    if (homeBox) homeBox.checked = true;
    document.querySelectorAll('[data-star]').forEach(function (o) { o.dataset.on = '0'; });
    $('starVal').textContent = 'すべて';
    if (price) { price.value = price.max; $('priceVal').textContent = '¥1,000 〜 上限なし'; }
    if (abv) { abv.value = 100; $('abvVal').textContent = '0% 〜 100%'; }
    $('q').value = ''; if (hq) hq.value = '';
    st.shown = PAGE; render();
  });
  $('trayOpen').addEventListener('click', renderCompare);
  $('trayClear').addEventListener('click', function () {
    st.picks = []; store('sl-picks'); $('compare').hidden = true; render();
  });
  document.querySelectorAll('[data-mood]').forEach(function (b) {
    b.addEventListener('click', function () {
      var m = b.dataset.mood;
      if (m === 'value') { st.sort = 'value'; }
      else if (m === 'pop') { st.sort = 'pop'; }
      else if (m === 'slow') { st.sort = 'rated'; st.home = true; }
      else if (m === 'gift') { st.sort = 'high'; st.home = true; }
      $('sort').value = st.sort;
      st.shown = PAGE; render();
      document.querySelector('.work').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* 保存してあった状態を戻す */
  var sv = Number(read('sl-rate'));
  if (sv >= 1 && sv <= 18) { st.rate = sv; if (rate) { rate.value = sv; $('rateVal').textContent = sv + '%'; } }
  var vw = read('sl-view');
  if (vw === 'grid') {
    st.view = 'grid';
    document.querySelectorAll('[data-view]').forEach(function (o) {
      o.setAttribute('aria-pressed', String(o.dataset.view === 'grid'));
    });
  }
  try {
    var saved = JSON.parse(read('sl-picks') || '[]');
    if (Array.isArray(saved)) st.picks = saved.filter(function (k) { return byKey[k]; }).slice(0, MAX);
  } catch (e) {}

  render();

  /* 年齢確認。JSで描くので、検索エンジンからは本文が隠れない */
  if (read('sl-age') === 'ok') {
    startIntro();
  } else {
    var g = document.createElement('div');
    g.id = 'gate';
    g.innerHTML = '<div class="box"><p class="mk">AGE VERIFICATION</p><h2>20歳以上ですか？</h2>' +
      '<p>20歳未満の者の飲酒は法律で禁じられています。</p>' +
      '<button type="button" class="buy" id="ageOk">20歳以上です</button>' +
      '<button type="button" class="no" id="ageNo">20歳未満です</button></div>';
    document.body.appendChild(g);
    g.querySelector('#ageOk').addEventListener('click', function () {
      store('sl-age', 'ok'); g.remove(); startIntro();
    });
    g.querySelector('#ageNo').addEventListener('click', function () { location.href = 'https://www.google.com/'; });
  }
})();
`;
