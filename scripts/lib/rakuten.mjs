// 楽天ウェブサービスのAPIクライアント。
// 2026年の仕様変更で applicationId(UUID) と accessKey の両方が必須。
// エンドポイントは openapi.rakuten.co.jp 配下へ移動している。

import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';

// 必ずIPv4で出る。
//
// 楽天のAPIはIP許可リスト方式で、登録できるのは事実上IPv4のアドレス。
// 一方 Node は既定で Happy Eyeballs を使い、IPv6が使える回線ではIPv6を選ぶ。
// すると楽天からは登録していないIPv6アドレスに見えて CLIENT_IP_NOT_ALLOWED になる。
// 「正しいIPを登録したのに弾かれる」という、原因の見えない止まり方をする。
//
// IPv6アドレスを登録する手もあるが、プライバシー拡張で頻繁に変わるので許可リストと相性が悪い。
// 出口をIPv4に固定するほうが安定する。
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

export const ITEM_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
export const GENRE_API = 'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';

export const HITS = 30;          // APIの1ページあたり上限
export const INTERVAL_MS = 1400; // レート制限回避
const MAX_RETRY = 4;

// 蒸留酒。度数を商品名に書く慣習があり、純アルコール量を機械的に出せる。
export const IN_SCOPE = /焼酎|ウイスキー|ウィスキー|ブランデー|ジン|ラム|ウォッカ|テキーラ|スピリッツ/;
// 日本酒・ワインは度数を書かないため、この比較軸では扱えない。
export const OUT_SCOPE = /日本酒|清酒|ワイン/;

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function loadCredentials() {
  try { process.loadEnvFile('.env'); } catch { /* 環境変数を使う */ }
  const appId = (process.env.RAKUTEN_APP_ID ?? '').trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY ?? '').trim();
  const affiliateId = (process.env.RAKUTEN_AFFILIATE_ID ?? '').trim();

  const missing = [!appId && 'RAKUTEN_APP_ID', !accessKey && 'RAKUTEN_ACCESS_KEY'].filter(Boolean);
  if (missing.length) {
    console.error(`${missing.join(' と ')} が未設定です。`);
    console.error('楽天のアプリ情報画面の「アプリケーションID」と「アクセスキー」を .env に記入してください。');
    process.exit(1);
  }
  return { appId, accessKey, affiliateId };
}

/**
 * APIを叩く。429 は一時的なので指数バックオフで粘る。
 * ここで諦めると特定ジャンルが丸ごと欠測し、集計が静かに嘘になる。
 */
export async function call(creds, base, params) {
  let wait = 2000;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const q = new URLSearchParams({
      applicationId: creds.appId,
      accessKey: creds.accessKey,
      format: 'json',
      ...(creds.affiliateId ? { affiliateId: creds.affiliateId } : {}),
      ...params,
    });
    const res = await fetch(`${base}?${q}`);
    const body = await res.text();
    if (res.ok) return JSON.parse(body);

    if (res.status === 429 && attempt < MAX_RETRY) {
      const hinted = Number(body.match(/again in (\d+) second/i)?.[1]);
      const delay = Number.isFinite(hinted) ? (hinted + 1) * 1000 : wait;
      await sleep(delay);
      wait *= 2;
      continue;
    }
    // 許可リスト落ちは原因が画面に出ないと直しようがない。
    // 「登録したのに弾かれる」ときの実際の原因は、たいてい登録後にIPが変わったこと。
    // 何を登録すればよいかをその場で出す。
    if (res.status === 403 && /CLIENT_IP_NOT_ALLOWED/.test(body)) {
      throw new Error(`許可されていないIPからの接続です。\n\n${await ipAdvice()}`);
    }
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  throw new Error('リトライ上限に達しました');
}

/** 今この瞬間の送信元IPv4を調べ、登録すべき値として提示する */
async function ipAdvice() {
  let ip = '(取得できませんでした)';
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    if (r.ok) ip = (await r.json()).ip;
  } catch { /* 提示できなくても本体のエラーは伝える */ }
  return [
    `  いま登録すべきIP: ${ip}`,
    '',
    '  楽天ウェブサービスのアプリ設定 → 「許可されたIPアドレス」に上記を追加してください。',
    '  https://webservice.rakuten.co.jp/app/list',
    '',
    '  このIPは回線の都合で不定期に変わります（1日で変わった実績あり）。',
    '  設定画面がCIDR表記を受け付けるなら、範囲で登録しておくと再発しません。',
  ].join('\n');
}

const nameOf = g => g.nameJa ?? g.genreName ?? '';
const childrenOf = j => (j.children ?? []).map(c => c.child ?? c);

/** ジャンル木を2段たどり、対象のサブジャンルだけを集める */
export async function findTargetGenres(creds) {
  const roots = childrenOf(await call(creds, GENRE_API, { genreId: '0' }))
    .filter(g => /酒|ビール|洋酒/.test(nameOf(g)));

  const found = [];
  for (const root of roots) {
    await sleep(INTERVAL_MS);
    for (const s of childrenOf(await call(creds, GENRE_API, { genreId: String(root.genreId) }))) {
      const name = nameOf(s);
      if (IN_SCOPE.test(name) && !OUT_SCOPE.test(name)) {
        found.push({ id: s.genreId, name, root: nameOf(root) });
      }
    }
  }
  return found;
}

/** 商品検索1ページ分。応答の形が変わっても落ちないよう両方の形を受ける。 */
export async function fetchItems(creds, genreId, page, extra = {}) {
  const json = await call(creds, ITEM_API, {
    genreId: String(genreId), hits: String(HITS), page: String(page), ...extra,
  });
  return (json.Items ?? json.items ?? []).map(x => x.Item ?? x);
}
