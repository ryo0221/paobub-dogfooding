# SK-01 スケルトン手巻き腕時計

PaoBub の「メカニカル製品の開発」（product-design-engineering 1.0.0）の工程で作った、腕時計の Project です。

- 径 35.2 mm・厚み 7.5 mm、28,800 振動/時の手巻き。地板と受けを丸い穴で肉抜きしたスケルトン。
- 進め方〜詳細設計（P0〜P4）の 5 工程の成果物があり、状態は「進行中」です。受け入れは PaoBub で行います。
- 試作・設計検証より後（P5〜P10）は未着手です。
- これは第 2 版です。editor-platform に足したプロダクトデザインの機能（3D モデルの中の設計の目標・部品の属性と部品表・公差の積み上げ・標準品・ばね・動きのすき間の無い干渉の確かめ・視界の検査）で、第 1 版で「保留」や「図面だけ」だった所を 3D モデルに入れて確かめ直しました。
- 定義 product-design-engineering は open-workflow-definitions に足す PR の中です。マージ前に開くときは、PaoBub の定義の置き場をその PR のブランチ（`claude/product-design-engineering`）の `definitions` に向けます。
- 工程の状態と成果物のファイルの割り当ては `workflow.json`、工程の定義は `definition.json` にあります。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 要求（目標値・単位・優先度・確かめ方） | `docs/requirement-list.json` |
| 方式 3 案と外装の方向、評価 | `docs/concept-study.md` |
| 構成図（部分 9・つなぎ目 9） | `docs/architecture.json` |
| 配置の 3D モデル（ハードポイントの寸法 PR-01〜07 と部分の空間 EN-001〜013） | `cad/layout-model.cad.json` |
| 詳細の 3D モデル（部品 20 ファイル・形 97。ぜんまい・ひげぜんまい・裏ぶたのねじ・パッキン・ばね棒を含む） | `cad/detail/*.cad.json`、組んだ状態は `cad/detail/sk01-watch.assembly.cad.json` |
| 部品表・設計FMEA・調達の方針 | `docs/ebom.json`、`docs/dfmea.json`、`docs/sourcing-plan.json` |
| 解析（輪列・ぜんまい・干渉・質量・噛み合い・寸法・つぶし代・中心距離・見え方） | `docs/analysis-report.md`、生データは `cad/check-report.json` |
| 設計の目標 TG-01〜09・公差の積み上げ TS-01・02・視界の検査 SC-01・02 | 各部品の `cad/detail/*.cad.json` の中、結果は `cad/check-report.json` |
| 部品表（3D モデルから出したもの。品番・材料・調達の区分。費用は空） | `cad/bom.json` |
| 外装の確認の画像 | `assets/appearance/*.jpg` |
| 引用の表と、網羅から除いた項目の理由 | `trace/citations.json` |

## 確かめたこと

詳細の 3D モデルを形状のカーネル（editor-platform の OCCT の Wasm）で評価しました。

- 干渉：組んだ状態・分解した状態・針を 12 時間回す 97 の姿勢で、意図しない干渉 0 件。さらに、がんぎ車を 1 分回す間を 864 歩（どの部品も 1 歩 0.5 mm・5° 以下）、日の裏車と筒車の 12 時間を 1,735 歩で、すき間なく確かめて 0 件。出るのはパッキンの意図した接触（胴でつぶれる・溝に座る）だけ（AN-03）。
- 噛み合い：6 組すべて成り立つ（香箱→二番かな、三番→二番、四番→三番、がんぎ→四番、筒かな→日の裏車、日の裏かな→筒車）。
- パワーリザーブ：ぜんまい 0.1 × 0.5 × 278.6 mm で 65.7 時間（40 時間以上）。巻き上げたときの応力 1,907 MPa（上限 2,000 の 95 %）（AN-02、第 1 版は保留）。
- 防水のパッキン：つぶし代 0.13 mm、RSS 0.09〜0.17 mm で帯 0.09〜0.18 に入る。最悪の組合せ 0.07〜0.19 は外れ、モンテカルロで帯の外 0.12 %（AN-09）。
- 四番車とがんぎかなの中心距離：3.622〜3.658 mm で帯の中（AN-10）。
- てんぷの見え方：裏から 81.5 %、表から 41.0 %（40 % 以上）（AN-11）。
- 厚み：裏ぶたのねじの頭を含めて 7.90 mm（8.0 以下）。頭はざぐりで 0.15 mm 沈めた（AN-06）。
- 質量：23.40 g（ベルトを除く。部品表の合計）。
- 設計の目標 9 件すべて合格。
- 輪列：がんぎ車 12 回転/分 → 四番車 1 回転/分 → 二番車 1 回転/時 → 香箱 1 回転/8 時間。

PaoBub の読み込み（項目の索引と規則の評価、editor-platform は main a1ae9f2e）で、問題 0・規則の違反 0 でした。項目 292、引用 467。

## この版でまだ無いもの

受け入れのときに見てほしい、正直な欠けです。どれも `trace/citations.json` の除外か、製造性の指摘（`docs/dfm-review.json`）に理由を書いています。

- 巻上げと針合わせの切替（きち車・つづみ車）の形が無い（DM-06）。巻真と角穴車はつながっていない。リューズは地板と受けの間の高さにあり、角穴車は香箱受けの上なので、切替を足すには配置から直す。
- 受けに柱が無く、地板から浮いて描いてある。受けのねじの位置の下に歯車があり、標準のねじで留められない（DM-07）。直すには配置（P3）からやり直す。
- 風防とリューズのパッキンの溝は図面だけ（DM-05 は裏ぶただけ 3D モデルに入れた）。
- ぜんまいの疲れは見積りに入れていない（AN-02）。
- 部品の費用は入れていない（見積りがまだ無い。費用は人が入れる決まり）。部品表は費用の欄が空。
- 図面は 2D の絵でなく、3D モデルを正にした寸法・公差・材料の表です（`docs/drawings.md`）。
- 比べる製品（BM-01・BM-02）の値は一般的な値の想定で、出典がありません。
- 外装の確認の画像は、第 1 版のラグを直す前（ラグの間 11.2 mm）の形で撮ったものです。今の 3D モデルはラグの内幅 16.0 mm で、ばね棒と裏ぶたのねじが入っています（DM-01）。
- editor-platform の課題として残したもの：組立の部品の形を設計の目標や視界の検査から名指しできない（#1310。この道具では組んだ状態を平らにして測る）、12 時間の輪列全部は 4,096 歩を超えて一度に確かめられない（#1311）、意図した接触（パッキン）を 3D モデルに書けない（#1312。この道具の `meantContacts` で持つ）。

## 3D モデルを作り直す

`tools/cad/watch-sk01.cad.test.ts` が、editor-platform の `sk01Watch`・`sk01Layout` から配置と詳細の 3D モデルを書き、第 2 版の直し（香箱のくり抜きとぜんまい、ひげぜんまい、標準品、裏ぶたの溝とねじ、公差、設計の目標）を足して、カーネルで干渉・動きの確かめ・噛み合い・質量・見え方を確かめ、`cad/check-report.json` と `cad/bom.json` を書きます。全部で 35 分ほどかかります（1 分の確かめ 約 12 分、12 時間の確かめ 約 21 分）。

```sh
cd /path/to/editor-platform && npm ci && npm run cad:kernel:fetch
cp <この Project>/tools/cad/watch-sk01.cad.test.ts packages/cad-kernel-occt/src/
git -C <この Project> show <第 1 版>:projects/watch-sk01/cad/check-report.json | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["bodyMap"]))' > /tmp/v1map.json
V1_MAP=/tmp/v1map.json OUT=<この Project> CAD_OCCT_DIST=$PWD/work/cad-kernel npx vitest run packages/cad-kernel-occt/src/watch-sk01.cad.test.ts
```

- 詳細の部品の形の ID は、もとの形の ID から振り直しています。第 1 版にあった形は同じ ID（BD-001〜091、`V1_MAP`）、第 2 版で増えた形は BD-092〜097 です。対応は `cad/check-report.json` の `bodyMap` にあります。
- editor-platform は main（a1ae9f2e 以降）が要ります。
- ラグの位置は、この道具の中で 16 mm に直しています（もとの形は 11.2 mm）。
