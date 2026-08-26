// 商品名・商品説明から「度数」「容量」「本数」を抽出する。
//
// この製品の成否はここに集約される。純アルコール単価が計算できなければ
// 比較軸が存在しないため。抽出できない商品は載せない —— 誤った数値を出すより除外する。

/**
 * 全角英数記号を半角に寄せ、空白を圧縮する。
 * 乗算の x は × に統一する。単位(ml/L)の直後に英字が来ると
 * 単位の切れ目が判定できなくなるため、ここで非英字に寄せておく。
 */
export function normalize(s) {
  if (!s) return '';
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[％]/g, '%')
    .replace(/[．]/g, '.')
    .replace(/[－ー―‐]/g, '-')
    .replace(/[✕╳]/g, '×')
    .replace(/([0-9a-zA-Z])\s*[x*]\s*(?=[0-9])/gi, '$1×')
    .replace(/\s+/g, ' ')
    .trim();
}

// 「10%OFF」「500円引き」等を度数と誤認しないための除外語
const DISCOUNT_CONTEXT = /(?:off|オフ|引|割|還元|ポイント|クーポン|増量|以上|未満)/i;

// 酒として現実的な度数の範囲（ノンアル 0.5 〜 スピリタス 96）
const ABV_MIN = 0.5;
const ABV_MAX = 96;

/**
 * アルコール度数を抽出する。見つからなければ null。
 * ラベル付き（「アルコール分40度」）を優先し、無ければ裸の「40度」を拾う。
 */
export function parseAbv(text) {
  const s = normalize(text);
  if (!s) return null;

  const labeled = /(?:アルコール(?:分|度数?)?|alc\.?|度数)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:度|°|%)/i;
  const m = s.match(labeled);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= ABV_MIN && v <= ABV_MAX) return v;
  }

  // 裸の数値。直後が割引表現なら度数ではない
  const bare = /(\d{1,2}(?:\.\d+)?)\s*(?:度|°|%)/gi;
  let hit;
  while ((hit = bare.exec(s)) !== null) {
    const tail = s.slice(hit.index + hit[0].length, hit.index + hit[0].length + 8);
    if (DISCOUNT_CONTEXT.test(tail)) continue;
    if (/^\s*[C℃]/.test(tail)) continue; // 「40度C」は温度
    const v = parseFloat(hit[1]);
    if (v >= ABV_MIN && v <= ABV_MAX) return v;
  }
  return null;
}

// 現実的な1本あたり容量（ミニチュア 50ml 〜 業務用 20L）
const VOL_MIN = 50;
const VOL_MAX = 20000;

/** 1本あたりの容量を ml で返す。見つからなければ null。 */
export function parseVolume(text) {
  const s = normalize(text);
  if (!s) return null;

  // ml / cc。直後に英字が続く場合は別語なので除外
  const ml = /(\d{2,5}(?:\.\d+)?)\s*(?:ml|cc|ミリリットル)(?![a-z])/gi;
  let hit;
  while ((hit = ml.exec(s)) !== null) {
    const v = parseFloat(hit[1]);
    if (v >= VOL_MIN && v <= VOL_MAX) return v;
  }

  // L / リットル。サイズ表記の L と衝突しないよう数値を必須にする
  const liter = /(\d{1,2}(?:\.\d+)?)\s*(?:l|リットル)(?![a-z])/gi;
  while ((hit = liter.exec(s)) !== null) {
    const v = parseFloat(hit[1]) * 1000;
    if (v >= VOL_MIN && v <= VOL_MAX) return v;
  }
  return null;
}

/** セット本数を返す。単品なら 1。 */
export function parseSetCount(text) {
  const s = normalize(text);
  if (!s) return 1;

  const patterns = [
    /×\s*(\d{1,3})\s*(?:本|缶|パック|セット|P\b)/i,
    /(\d{1,3})\s*(?:本|缶)\s*(?:セット|入)/,
    /(\d{1,3})\s*(?:本|缶)パック/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 200) return n;
    }
  }
  return 1;
}

/**
 * 商品1件を解析する。
 * 度数と容量の両方が取れた場合のみ ok:true とし、純アルコール単価まで算出する。
 */
export function parseItem({ itemName, itemCaption = '', itemPrice }) {
  const haystack = `${itemName} ${itemCaption}`;

  const abv = parseAbv(haystack);
  const volumeMl = parseVolume(itemName) ?? parseVolume(haystack);
  const setCount = parseSetCount(itemName);

  if (abv === null || volumeMl === null) {
    return { ok: false, abv, volumeMl, setCount, reason: abv === null ? 'abv' : 'volume' };
  }

  // 純アルコール量(ml) = 総容量 × 度数/100
  const totalMl = volumeMl * setCount;
  const pureAlcoholMl = totalMl * (abv / 100);
  const yenPerPureAlcoholMl =
    typeof itemPrice === 'number' && pureAlcoholMl > 0 ? itemPrice / pureAlcoholMl : null;

  return { ok: true, abv, volumeMl, setCount, totalMl, pureAlcoholMl, yenPerPureAlcoholMl };
}
