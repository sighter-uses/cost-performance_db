# cost-performance_db

数値で比較できるものだけを横断比較するデータベース。第一弾は蒸留酒・果実酒。

## 何を作っているか

楽天市場の商品データから度数・容量を抽出し、以下を横断比較できるようにする。

- **純アルコール1mlあたりの単価** — 度数と容量から一意に決まる
- **ポイント還元込みの実質価格**
- **評価スコアと件数** — 楽天APIが返す事実データ

味の評価は扱わない。主観が入ると自動化できなくなるため。

## 構成

| パス | 役割 |
|---|---|
| `scripts/lib/parse.mjs` | 度数・容量・本数の抽出。**この製品の核** |
| `scripts/lib/parse.test.mjs` | 上記のテスト |
| `scripts/validate.mjs` | フェーズ1の抽出率検証 |
| `dist/` | 配信される生成物。Cloudflare Workers がここを配信する |
| `data/` | 取得した生データ（gitignore対象） |

## セットアップ

```
cp .env.example .env
```

`.env` に楽天ウェブサービスのアプリIDを記入する。**`.env` はコミットしない**（`.gitignore` 済み）。

## コマンド

```
npm test            # パーサーのテスト
npm run validate    # 抽出率を実測（要アプリID）
```

## フェーズ1の合格ライン

`npm run validate` の抽出率が **90%以上**なら設計どおり進める。
**70%未満**なら設計を作り直す。抽出できない商品は載せない —— 誤った数値を出すより除外する。

## 配信

Cloudflare Workers（static assets）。`wrangler.jsonc` の `assets.directory` が `./dist` を指す。
`main` は不要（assets-only Worker では省略可）。
