# 「翔」 ミッドシップの 2 人乗りスポーツカー

PaoBub の「メカニカル製品の開発」（product-design-engineering 1.0.0）の工程で作った、自動車の Project です。

- 全長 4,350・全幅 1,950・全高 1,130 mm、ホイールベース 2,650 mm。運転席の後ろにエンジンを置く後輪駆動。涙の形のガラスの屋根（キャノピー）を胴に浮かせる。
- 進め方〜詳細設計（P0〜P4）の 5 工程の成果物があり、状態は「進行中」です。受け入れは PaoBub で行います。
- これは第 2 版です。editor-platform に足したプロダクトデザインの機能（3D モデルの中の設計の目標・部品の属性と部品表・視界の検査・板の厚み）で、外形を測り直しました。測り直して、全幅と横の頭上の 2 つの要求を外れていると分かりました（下の「確かめたこと」）。
- 詳細設計は**外形だけ**（外板・窓・床とディフューザー）です。車体の骨格・サスペンション・灯火は次の版です。
- 定義 product-design-engineering は open-workflow-definitions に足す PR の中です。マージ前に開くときは、PaoBub の定義の置き場をその PR のブランチ（`claude/product-design-engineering`）の `definitions` に向けます。
- 工程の状態と成果物のファイルの割り当ては `workflow.json`、工程の定義は `definition.json` にあります。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 要求（目標値・単位・優先度・確かめ方） | `docs/requirement-list.json` |
| 方式 3 案と外形 3 案（くさび・流れ・キャノピー） | `docs/concept-study.md` |
| ハードポイント | `docs/hard-points.json` |
| 配置の 3D モデル（寸法 PR-01〜13 で車輪・乗員・機械の箱が動く） | `cad/layout-model.cad.json` |
| 詳細の 3D モデル（外板・窓・床とディフューザー、形 30） | `cad/detail-model.cad.json` |
| 解析（寸法と比・配置・前面投影面積・質量・床下・設計の目標） | `docs/analysis-report.md`、生データは `cad/check-report.json` |
| 設計の目標 TG-01〜07 と視界の検査 SC-01・02（3D モデルの中） | `cad/detail-model.cad.json` の `designTargets`・`sightChecks`、結果は `cad/check-report.json` |
| 部品表（3D モデルから出したもの） | `cad/bom.json` |
| 外装の確認の画像（レンダリング・ゼブラ・床下） | `assets/appearance/*.jpg` |
| 引用の表と、網羅から除いた項目の理由 | `trace/citations.json` |

## 確かめたこと

- 配置：機械（エンジン・変速機・燃料タンク・ラジエーター・荷室）と車輪の箱の重なり 0 組。頭上のすき間 64 mm、胴と燃料タンクのすき間 15 mm。
- 比：ホイールベース/全長 0.609、全幅/全高 1.73。
- 前面投影面積：1.723 m²（車輪を含む）。
- 外板・床・吸気ダクトの質量：外板 45.6 kg・床とディフューザー 21.6 kg・ダクト 2.3 kg、合計 69.5 kg（炭素繊維。面積と体積は形状のカーネルで評価）。部品表の合計と同じ。
- ディフューザーの立ち上がり 10.0°。
- 設計の目標 7 件のうち合格 4・不合格 3（AN-08）：
  - 全幅（車輪を含む）1,951.9 mm で、上限 1,950 を 1.9 mm 超える（RQ-02）。第 1 版は配置の寸法だけを見て合格にしていた。
  - 運転者の頭とキャノピー外板の距離 0 mm（50 以上が要る、RQ-05）。配置の 64 mm は運転者の中心の断面の値で、外板は頭の外側の上の角を通る。丸い頭と見ても 7 mm ほど（AN-02）。
  - 全長 4,350.000 mm は浮動小数の誤差で不合格と出る（editor-platform の課題 #1309）。
- A ピラーの視界：キャノピー外板が側面の窓まで一枚の不透明な面なので、前から真横まで隠すと出る（SC-01 90°・SC-02 57.5°）。窓とピラーに分けるまで判定できない（DM-05）。

PaoBub の読み込み（項目の索引と規則の評価、editor-platform は main a1ae9f2e）で、問題 0・規則の違反 0 でした。項目 205、引用 362。

## この版でまだ無いもの

- 全幅と横の頭上を直した外形がまだ無い（RK-06）。詳細設計のゲートはこれを直してから通す。
- 車体の骨格・サスペンション・灯火・シートの形が無い（部品表の行だけ。網羅から理由つきで除外）。衝突（RQ-11）・灯火（RQ-10）は次の版で確かめる。
- キャノピー外板が窓とピラーに分かれていない（DM-05）。窓ガラスは、板でなく閉じた塊の形（DM-02）で、質量は概算（約 24 kg）。吸気ダクトは厚み 2 mm の壁にした（DM-03 は直した）。
- 部品の費用は入れていない（見積りがまだ無い。費用は人が入れる決まり）。
- エンジンと変速機は外形の箱。乗員は身長 1.69 m の座った人の箱で、部品表では「確認用の人形（作らない）」にしている。
- 外板は左右で一枚ずつの大きな面で、ドアなどの分割の線が無い（DM-01）。
- 流れの解析はしていない。床下と前面投影面積は形の指標だけ。
- 比べる製品（BM-01・BM-02）の値は一般的な値の想定で、出典がありません。

## 3D モデルを作り直す

`tools/cad/car-sho.cad.test.ts` が、editor-platform の `f82Package`（配置）と `f142Package`（外形）から 3D モデルを書き、カーネルで評価して `cad/check-report.json` を書きます。
`f142Package` は editor-platform の `feat/cad-car-look` のブランチにあり、設計の目標・視界の検査・部品表は main（a1ae9f2e 以降）にあります。`feat/cad-car-look` が main に入るまでは、手元で main を取り込んだブランチで動かします（cad-core の commands.ts と index.ts がぶつかるので、両方を残して解く）。

```sh
cd /path/to/editor-platform && git checkout -b local/car-v2 origin/feat/cad-car-look && git merge origin/main && npm ci && npm run cad:kernel:fetch
cp <この Project>/tools/cad/car-sho.cad.test.ts packages/cad-kernel-occt/src/
OUT=<この Project> CAD_OCCT_DIST=$PWD/work/cad-kernel npx vitest run packages/cad-kernel-occt/src/car-sho.cad.test.ts
```

- 形の ID は振り直しています（配置は EN-001〜018、詳細は BD-001〜030）。詳細の対応は `cad/check-report.json` の `bodyMap` にあります。
- PaoBub で読むには、editor-platform の main（a1ae9f2e 以降）の CAD の形式が要ります（設計の目標・視界の検査・部品の属性・比の検査を読むため）。
- 外形の検討で使った塊（CL4 の block）は外し、スケッチの注記と線の色は外しています（今の main の CAD の形式がまだ読まないため）。
