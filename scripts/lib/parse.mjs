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
    .replace(/[゜ﾟ]/g, '°')   // 「20゜」の半濁点を度記号として扱う
    .replace(/(\d),(\d)(?=\s*[%度°])/g, '$1.$2')  // 「39,1％」欧州式の小数点
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

// エタノールの比重。厚労省ガイドラインの純アルコール量の計算式に合わせる。
export const ALCOHOL_DENSITY = 0.8;
// 1単位あたりの純アルコール量(g)。日本酒1合、ビール中瓶1本にほぼ相当する。
export const UNIT_GRAMS = 20;

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

// 単位が省略された容量の受け皿。日本の酒瓶は規格サイズがほぼ決まっているため、
// その集合に一致する裸の数値のみを容量とみなす。範囲で受けると誤爆する。
const BOTTLE_SIZES = new Set([180, 200, 300, 360, 500, 640, 700, 720, 750, 900, 1000, 1800, 2000, 2700, 4000, 5000]);

/**
 * 「25度 1800」のように単位が落ちている容量を拾う。
 * 規格サイズに一致し、かつ他の単位が続かない数値だけを採用する。
 */
export function parseVolumeLoose(text) {
  const s = normalize(text);
  if (!s) return null;
  const re = /(?<![\d.])(\d{3,4})(?![\d.])\s*(?![a-z年円個入本缶%°度])/gi;
  let hit;
  while ((hit = re.exec(s)) !== null) {
    const v = parseInt(hit[1], 10);
    if (BOTTLE_SIZES.has(v)) return v;
  }
  return null;
}

/**
 * 「45/700」形式を度数と容量の組として読む。輸入酒の専門店がよく使う表記で、
 * 単位が一切書かれないため通常の抽出では取りこぼす。
 * 度数として妥当な範囲かつ容量が規格サイズのときだけ採用する。
 */
export function parseAbvVolumePair(text) {
  const s = normalize(text);
  if (!s) return null;
  const re = /(?<![\d.])(\d{2}(?:\.\d)?)\s*\/\s*(\d{3,4})(?![\d.])/g;
  let hit;
  while ((hit = re.exec(s)) !== null) {
    const abv = parseFloat(hit[1]);
    const vol = parseInt(hit[2], 10);
    if (abv >= 15 && abv <= ABV_MAX && BOTTLE_SIZES.has(vol)) return { abv, volumeMl: vol };
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

  // 商品名を最優先する。店舗の説明文には他商品の記述（除菌用アルコール85%など）が
  // 混ざることがあり、そちらを拾うと商品名に「40度」と書いてあるのに85度と判定してしまう。
  // 誤った単価は、単価が出ないことより悪い。
  // 「45/700」形式は度数と容量が不可分なので、両方欠けているときの最後の手段として使う。
  const pair = parseAbvVolumePair(itemName);
  const abv = parseAbv(itemName) ?? parseAbv(itemCaption) ?? pair?.abv ?? null;
  // 度数が取れている＝酒の商品説明である確度が高いときに限り、単位なし容量を許す
  const volumeMl =
    parseVolume(itemName) ??
    parseVolume(haystack) ??
    pair?.volumeMl ??
    (abv !== null ? parseVolumeLoose(itemName) : null);
  const setCount = parseSetCount(itemName);

  if (abv === null || volumeMl === null) {
    return { ok: false, abv, volumeMl, setCount, reason: abv === null ? 'abv' : 'volume' };
  }

  // 純アルコール量(g) = 量(ml) × 度数/100 × 0.8（アルコール比重）
  // 厚生労働省「健康に配慮した飲酒に関するガイドライン」(2024) と同じ式。
  // 一般に流通している単位に合わせることで、表示された数値を他所と突き合わせられる。
  const totalMl = volumeMl * setCount;
  const pureAlcoholG = totalMl * (abv / 100) * ALCOHOL_DENSITY;

  const price = typeof itemPrice === 'number' ? itemPrice : null;
  // 1単位 = 純アルコール20g（日本酒1合・ビール中瓶1本相当）。ml単価では桁が小さすぎて直感が働かない。
  const yenPerUnit =
    price !== null && pureAlcoholG > 0 ? (price / pureAlcoholG) * UNIT_GRAMS : null;
  const yenPerMl = price !== null && totalMl > 0 ? price / totalMl : null;

  return {
    ok: true, abv, volumeMl, setCount, totalMl,
    pureAlcoholG, yenPerUnit, yenPerMl,
  };
}
