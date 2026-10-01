# 画像・映像の出典

外部素材はいずれも商用利用可・帰属不要のライセンスだが、出どころは残しておく。

| ファイル | 出典 | 作者 | ライセンス |
|---|---|---|---|
| `bar.jpg` | 画像生成AIで作成（2026-10-01）。元画像は `design/photos/bar-original.png` | 運営者 | — |
| `/og.jpg` の背景写真 | 画像生成AIで作成（2026-10-01）。元画像は `design/photos/og-photo.png` | 運営者 | — |
| `pour.mp4` / `glass-poster.jpg` | [Pexels](https://www.pexels.com/video/pouring-whiskey-in-glass-with-elegant-bokeh-34292842/) | Naresh Babu | Pexels License |

以前の `bar.jpg` は Unsplash の写真（Alex Dev「dimly lit bar interior with bottles on shelves」）だった。

## bar.jpg の作り方

```
ffmpeg -i design/photos/bar-original.png -q:v 2 -pix_fmt yuvj420p dist/assets/bar.jpg
```

暗い画像は圧縮を強くすると階調に段が出るので、`-q:v 2` より下げない。

## og.jpg（SNS共有カード）の作り方

原稿は `design/og-image.html`（写真の上に文字を重ねたもの）。`npm run og` で
Edge か Chrome のヘッドレスで 1200×630 を撮り、`dist/og.jpg` に書き出す。
文言を変えたらこれを再実行して、続けて `npm run build`。

## pour.mp4 の作り方

元映像は 1920×1080 / 50fps / 10秒 / 5.7MB。**右側に実在ブランドのボトルが写っている**ため、
crop で範囲外に出している。再生成する場合は同じ手順で。

```
ffmpeg -ss 0 -t 3.6 -i pour.mp4   -vf "crop=720:1020:520:60,scale=540:766:flags=lanczos,fps=30"   -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 30 -preset slow   -movflags +faststart pour-cut.mp4

ffmpeg -sseof -0.12 -i pour-cut.mp4 -frames:v 1 -q:v 3 glass-poster.jpg
```

**poster は必ず映像の最終フレームにすること。** 演出を再生しない経路
（スキップ／視差効果を減らす設定／2回目以降）では poster だけが出るので、
ここがずれると経路によって絵が変わってしまう。

## 差し替えるとき

- `bar.jpg` — 暗めで、明るいもの（棚・照明）は中央〜右に寄せたもの。左に見出しが乗るので、左が明るいと読めない
- `pour.mp4` — 縦長（540×766 前後）で、グラスが中央にあり、最後に液が溜まっているもの。
  アスペクト比を変えたら `scripts/lib/view.mjs` の `.glass{aspect-ratio}` も合わせる
- どちらも**実在ブランドのラベルが写り込んでいないこと**を確認する

## glass-mask.svg（映像の背景を落とす型）

`pour.mp4` に CSS の `mask` で掛けて、グラス・液体・注ぎの筋だけを残す。
カメラが固定でグラスが動かないので、1枚の型で全フレームに効く。
座標は映像と同じ 540×766。**映像を差し替えたら輪郭を測り直すこと**
（映像の複数時点に輪郭を重ねて合わせた）。

- グラスの外形（縁・壁・液体・脚）は不透明
- 空の上半分の内側は上ほど薄くする。そのままだとガラス越しに映像の玉ボケが残る
- 注ぎの筋の帯は、縁より上は揺れ幅ぶん広く、縁より下は細くする
