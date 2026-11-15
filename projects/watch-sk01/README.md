# SK-01 スケルトン手巻き腕時計

PaoBub の「メカニカル製品の開発」（product-design-engineering 1.0.0）の工程で作った、腕時計の Project です。

- 径 35.2 mm・厚み 7.5 mm、28,800 振動/時の手巻き。地板と受けを丸い穴で肉抜きしたスケルトン。
- 進め方〜詳細設計（P0〜P4）の 5 工程の成果物があり、状態は「進行中」です。受け入れは PaoBub で行います。
- 試作・設計検証より後（P5〜P10）は未着手です。
- 定義 product-design-engineering は open-workflow-definitions に足す PR の中です。マージ前に開くときは、PaoBub の定義の置き場をその PR のブランチ（`claude/product-design-engineering`）の `definitions` に向けます。
- 工程の状態と成果物のファイルの割り当ては `workflow.json`、工程の定義は `definition.json` にあります。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 要求（目標値・単位・優先度・確かめ方） | `docs/requirement-list.json` |
| 方式 3 案と外装の方向、評価 | `docs/concept-study.md` |
| 構成図（部分 9・つなぎ目 9） | `docs/architecture.json` |
| 配置の 3D モデル（ハードポイントの寸法 PR-01〜07 と部分の空間 EN-001〜013） | `cad/layout-model.cad.json` |
| 詳細の 3D モデル（部品 17 ファイル・形 91） | `cad/detail/*.cad.json`、組んだ状態は `cad/detail/sk01-watch.assembly.cad.json` |
| 部品表・設計FMEA・調達の方針 | `docs/ebom.json`、`docs/dfmea.json`、`docs/sourcing-plan.json` |
| 解析（輪列・干渉・質量・噛み合い・寸法） | `docs/analysis-report.md`、生データは `cad/check-report.json` |
| 外装の確認の画像 | `assets/appearance/*.jpg` |
| 引用の表と、網羅から除いた項目の理由 | `trace/citations.json` |

## 確かめたこと

詳細の 3D モデルを形状のカーネル（editor-platform の OCCT の Wasm）で評価しました。

- 干渉：組んだ状態 0 件、分解した状態 0 件、針を 12 時間回す 49 の姿勢で 0 件。
- 噛み合い：6 組すべて成り立つ（香箱→二番かな、三番→二番、四番→三番、がんぎ→四番、筒かな→日の裏車、日の裏かな→筒車）。
- 質量：23.37 g（ぜんまい・パッキン・ベルトを除く）。
- 輪列：がんぎ車 12 回転/分 → 四番車 1 回転/分 → 二番車 1 回転/時 → 香箱 1 回転/8 時間。

PaoBub の読み込み（項目の索引と規則の評価）で、問題 0・規則の違反 0 でした。項目 272、引用 433（うち CAD の中身から 8）。

## この版でまだ無いもの

受け入れのときに見てほしい、正直な欠けです。どれも `trace/citations.json` の除外か、製造性の指摘（`docs/dfm-review.json`）に理由を書いています。

- 巻上げと針合わせの切替（きち車・つづみ車）の形が無い（DM-06）。巻真と角穴車はつながっていない。
- ぜんまいの形が無い。パワーリザーブ 40 時間は「保留」（AN-02）。
- 防水のパッキンの溝は図面の表に足しただけで、3D モデルにはまだ無い（DM-05）。インデックスの厚みの直し（0.05 → 0.2 mm）も同じ（DM-02）。
- 図面は 2D の絵でなく、3D モデルを正にした寸法・公差・材料の表です（`docs/drawings.md`）。
- 比べる製品（BM-01・BM-02）の値は一般的な値の想定で、出典がありません。
- 外装の確認の画像は、ラグを直す前（ラグの間 11.2 mm）の形で撮ったものです。今の 3D モデルはラグの内幅 16.0 mm です（DM-01）。

## 3D モデルを作り直す

`tools/cad/watch-sk01.cad.test.ts` が、editor-platform の `sk01Watch`・`sk01Layout` から配置と詳細の 3D モデルを書き、カーネルで干渉・噛み合い・質量を確かめて `cad/check-report.json` を書きます。

```sh
cd /path/to/editor-platform && npm ci && npm run cad:kernel:fetch
cp <この Project>/tools/cad/watch-sk01.cad.test.ts packages/cad-kernel-occt/src/
OUT=<この Project> CAD_OCCT_DIST=$PWD/work/cad-kernel npx vitest run packages/cad-kernel-occt/src/watch-sk01.cad.test.ts
```

- 詳細の部品の形の ID（BD-001〜091）は、もとの形の ID から振り直しています。対応は `cad/check-report.json` の `bodyMap` にあります。
- ラグの位置は、この道具の中で 16 mm に直しています（もとの形は 11.2 mm）。
