# 画像・映像の出典

いずれも商用利用可・帰属不要のライセンスだが、出どころは残しておく。

| ファイル | 出典 | 作者 | ライセンス |
|---|---|---|---|
| `bar.jpg` | [Unsplash](https://unsplash.com/photos/dimly-lit-bar-interior-with-bottles-on-shelves-1zGxaFuG7LY) | Alex Dev | Unsplash License |
| `pour.mp4` / `glass-poster.jpg` | [Pexels](https://www.pexels.com/video/pouring-whiskey-in-glass-with-elegant-bokeh-34292842/) | Naresh Babu | Pexels License |

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

- `bar.jpg` — 暗めで中央から下に焦点があるもの。明るいと見出しが読めない
- `pour.mp4` — 縦長（540×766 前後）で、グラスが中央にあり、最後に液が溜まっているもの。
  アスペクト比を変えたら `scripts/lib/view.mjs` の `.glass{aspect-ratio}` も合わせる
- どちらも**実在ブランドのラベルが写り込んでいないこと**を確認する
