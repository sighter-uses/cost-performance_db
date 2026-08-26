import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbv, parseVolume, parseSetCount, parseItem } from './parse.mjs';

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
  assert.equal(r.pureAlcoholMl, 280);
  assert.ok(Math.abs(r.yenPerPureAlcoholMl - 6) < 0.01);
});

test('統合: セット品は総量で計算する', () => {
  const r = parseItem({
    itemName: 'ジムビーム 40度 700ml×12本',
    itemPrice: 20160,
  });
  assert.equal(r.ok, true);
  assert.equal(r.setCount, 12);
  assert.equal(r.totalMl, 8400);
  assert.equal(r.pureAlcoholMl, 3360);
});

test('統合: 抽出できなければ ok:false と理由を返す', () => {
  const a = parseItem({ itemName: 'ウイスキー 700ml', itemPrice: 1000 });
  assert.equal(a.ok, false);
  assert.equal(a.reason, 'abv');

  const b = parseItem({ itemName: 'ウイスキー 40度', itemPrice: 1000 });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'volume');
});
