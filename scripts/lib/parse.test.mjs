import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbv, parseVolume, parseVolumeLoose, parseAbvVolumePair, parseSetCount, parseItem, hasAmbiguousQuantity, normalize } from './parse.mjs';

test('度数: ラベルなしの基本形', () => {
  assert.equal(parseAbv('サントリー ウイスキー 角瓶 40度 700ml'), 40);
  assert.equal(parseAbv('スピリタス 96度 500ml'), 96);
  assert.equal(parseAbv('ジムビーム 40% 700ml'), 40);
  assert.equal(parseAbv('カミュ VSOP 40°'), 40);
});

test('度数: 全角と小数', () => {
  assert.equal(parseAbv('ウイスキー ４３度'), 43);
  assert.equal(parseAbv('日本酒 15.5度'), 15.5);
  assert.equal(parseAbv('ビール ５％'), 5);
});

test('度数: ラベル付きが優先される', () => {
  assert.equal(parseAbv('10%OFF ウイスキー アルコール分40度 700ml'), 40);
  assert.equal(parseAbv('セール Alc.43% ブランデー'), 43);
});

test('度数: 割引表記を誤検出しない', () => {
  assert.equal(parseAbv('30%OFF 焼酎 1800ml'), null);
  assert.equal(parseAbv('20%オフ ワイン'), null);
  assert.equal(parseAbv('ポイント10倍 5%還元 ウイスキー'), null);
});

test('度数: 範囲外は採用しない', () => {
  assert.equal(parseAbv('ノンアルコールビール 0.00% 350ml'), null);
  assert.equal(parseAbv('年式 99度'), null);
});

test('容量: ml と L', () => {
  assert.equal(parseVolume('角瓶 700ml'), 700);
  assert.equal(parseVolume('いいちこ 1800ml パック'), 1800);
  assert.equal(parseVolume('焼酎 1.8L'), 1800);
  assert.equal(parseVolume('ウイスキー 1L'), 1000);
  assert.equal(parseVolume('日本酒 720ML'), 720);
  assert.equal(parseVolume('ミニチュア 50ml'), 50);
});

test('容量: 単位直後に乗算記号が来ても取れる', () => {
  assert.equal(parseVolume('ビール 350ml×24本'), 350);
  assert.equal(parseVolume('ビール 350mlx24本'), 350);
  assert.equal(parseVolume('焼酎 1.8Lx6本'), 1800);
});

test('容量: 年数などを拾わない', () => {
  assert.equal(parseVolume('山崎 12年'), null);
  assert.equal(parseVolume('ウイスキー 40度'), null);
});

test('本数: セット表記', () => {
  assert.equal(parseSetCount('ビール 350ml×24本'), 24);
  assert.equal(parseSetCount('ジムビーム 700mlx12本'), 12);
  assert.equal(parseSetCount('ワイン 6本セット'), 6);
  assert.equal(parseSetCount('角瓶 700ml'), 1);
});

test('統合: 純アルコール単価を算出する', () => {
  const r = parseItem({
    itemName: 'サントリー ウイスキー 角瓶 40度 700ml',
    itemCaption: 'アルコール分40度',
    itemPrice: 1680,
  });
  assert.equal(r.ok, true);
  assert.equal(r.abv, 40);
  assert.equal(r.volumeMl, 700);
  assert.equal(r.setCount, 1);
  // 700ml × 40% × 0.8 = 224g
  assert.equal(r.pureAlcoholG, 224);
  // 1680円 / 224g × 20g = 150円/単位
  assert.ok(Math.abs(r.yenPerUnit - 150) < 0.01);
});

test('統合: セット品は総量で計算する', () => {
  const r = parseItem({
    itemName: 'ジムビーム 40度 700ml×12本',
    itemPrice: 20160,
  });
  assert.equal(r.ok, true);
  assert.equal(r.setCount, 12);
  assert.equal(r.totalMl, 8400);
  // 8400ml × 40% × 0.8 = 2688g
  assert.equal(r.pureAlcoholG, 2688);
});

test('統合: 抽出できなければ ok:false と理由を返す', () => {
  const a = parseItem({ itemName: 'ウイスキー 700ml', itemPrice: 1000 });
  assert.equal(a.ok, false);
  assert.equal(a.reason, 'abv');

  const b = parseItem({ itemName: 'ウイスキー 40度', itemPrice: 1000 });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'volume');
});

test('度数: 半濁点を度記号として扱う', () => {
  assert.equal(parseAbv('吟香露（20゜）酒粕焼酎 1800ml'), 20);
  assert.equal(parseAbv('本格焼酎 25゜ 720ml'), 25);
});

test('容量: 単位が落ちていても規格サイズなら拾う', () => {
  const r = parseItem({ itemName: 'つくし白 麦焼酎 黒麹仕込 25度 1800', itemPrice: 2000 });
  assert.equal(r.ok, true);
  assert.equal(r.volumeMl, 1800);
  assert.equal(r.abv, 25);
});

test('容量: 度数が無ければ裸の数値は容量とみなさない', () => {
  const r = parseItem({ itemName: '日本酒 純米大吟醸 1800', itemPrice: 3000 });
  assert.equal(r.ok, false);
});

test('容量: 規格外の裸の数値は拾わない', () => {
  const r = parseItem({ itemName: '焼酎 25度 1234', itemPrice: 2000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'volume');
});

test('容量: 年号や価格を容量と誤認しない', () => {
  assert.equal(parseVolumeLoose('2020年醸造'), null);
  assert.equal(parseVolumeLoose('1800円'), null);
  assert.equal(parseVolumeLoose('720本'), null);
});

test('度数: 商品名を商品説明より優先する', () => {
  // 店舗の説明文に別商品の記述が混ざるケース。商品名の40度が正しい。
  const r = parseItem({
    itemName: 'ウヰルキンソン ウォッカ 40度 720ml 正規',
    itemCaption: '当店では除菌用アルコール85%も取り扱っております',
    itemPrice: 778,
  });
  assert.equal(r.abv, 40);
});

test('度数: 商品名に無ければ商品説明から拾う', () => {
  const r = parseItem({
    itemName: 'サントリー 角瓶 700ml',
    itemCaption: 'アルコール分40度のブレンデッドウイスキー',
    itemPrice: 1680,
  });
  assert.equal(r.abv, 40);
});

test('度数: 欧州式の小数点カンマを読む', () => {
  assert.equal(parseAbv('マルセル・トゥレプー 700ml 39,1％'), 39.1);
  assert.equal(parseAbv('コニャック 40,5度 700ml'), 40.5);
});

test('度数: カンマ区切りの金額を度数と誤認しない', () => {
  assert.equal(parseAbv('1,000円ポッキリ ウイスキー'), null);
});

test('度数と容量: 「45/700」形式を組として読む', () => {
  const r = parseItem({ itemName: 'カポヴィッラ モンタナ ロッソ 10年 45/700 [正規輸入]', itemPrice: 12000 });
  assert.equal(r.ok, true);
  assert.equal(r.abv, 45);
  assert.equal(r.volumeMl, 700);
});

test('度数と容量: 規格外の組み合わせは採用しない', () => {
  assert.equal(parseAbvVolumePair('商品番号 45/123'), null);
  assert.equal(parseAbvVolumePair('10/700'), null); // 度数として低すぎる
});

test('数量: 単品とケースの選択式は数量が確定しないので弾く', () => {
  // 表示価格3,080円は単品1本の値段だが、名前は12本セットに見える。
  const r = parseItem({
    itemName: 'サントリー ウイスキー スペシャル リザーブ 700ml瓶 単品／ケース【12本セット】',
    itemPrice: 3080,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ambiguous');
});

test('数量: よりどり・選べる系も弾く', () => {
  assert.equal(hasAmbiguousQuantity('よりどり6本 焼酎 25度 1800ml'), true);
  assert.equal(hasAmbiguousQuantity('選べる ウイスキー 3本セット 40度 700ml'), true);
});

test('数量: 通常のセット品は弾かない', () => {
  const r = parseItem({ itemName: 'ジムビーム 40度 700ml×12本 ケース', itemPrice: 20160 });
  assert.equal(r.ok, true);
  assert.equal(r.setCount, 12);
});

test('正規化: カタカナの長音符を壊さない', () => {
  // 「ー」(U+30FC) をダッシュとして正規化すると、以後カタカナでの照合が全て破綻する。
  assert.equal(normalize('サントリー ウイスキー ケース'), 'サントリー ウイスキー ケース');
  assert.equal(normalize('ウォッカ ペットボトル'), 'ウォッカ ペットボトル');
  // 記号としてのダッシュは半角化してよい
  assert.equal(normalize('A－B'), 'A-B');
});

test('容量: 単位付きの数値が銘柄名の数字に勝つ', () => {
  // 「タリバーディン 500」は銘柄名。容量は明記された 30ml のほう。
  const r = parseItem({ itemName: '【量り売り】タリバーディン 500 シェリー・フィニッシュ 43度 30ml', itemPrice: 470 });
  assert.equal(r.ok, true);
  assert.equal(r.volumeMl, 30);
});

test('容量: 単位が書かれていれば裸の数値は見にいかない', () => {
  assert.equal(parseVolumeLoose('タリバーディン 500 43度 30ml'), null);
  // 単位が一切ないときだけフォールバックが働く
  assert.equal(parseVolumeLoose('麦焼酎 25度 1800'), 1800);
});

test('容量: 量り売りの小容量も扱える', () => {
  assert.equal(parseVolume('ウイスキー 43度 30ml'), 30);
  assert.equal(parseVolume('ミニチュア 50ml'), 50);
});
