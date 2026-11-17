# 架空の e-Axle の工場（工場のデジタルツイン）

PaoBub の「生産システム計画」（production-system-planning 1.0.0）の工程で作った、工場の計画の Project です。

> **架空の工場です。** 会社「Minato e-Drive」・工場・製品・数値はすべて作ったもので、実在の会社・工場・製品とは関係がありません。既存の工場のシミュレーションの製品の名前・画面・資料は使っていません。

- 電動の駆動の部品（e-Axle：電動機・インバーター・減速機を一つにした部品）を組み立てる 1 本のラインを、平屋の建屋（72 × 36 m）に置き、2 シフトで 1 日 720 台を目標に計画しました。
- 模型は Editor Platform の工場（factory。離散事象の物の流れ・作業者・AGV・実験・PLC のはしご図）と建物（BIM）で作り、流して確かめました。
- 計画案（AGV 2 台・組立の作業者 3 人）は 13.8 台/時で、律速は AGV。40 回の実験で、AGV 6 台・作業者 4 人の案（34.4 台/時、リードタイム 30 分）を採る案にしました。次の律速は最終の検査台と最終組立です。
- 状態：要件〜制御の確認の 9 工程は「受け入れ待ち」、承認と説明・記録は「進行中」（承認は Ryo さん）。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 対象・範囲・出口・AI の関与・名乗り方 | `docs/process-map.json` |
| 要件（1 日 720 台・タクト 85 秒・リードタイム 45 分・建屋・人・シフト、確からしさつき） | `docs/production-requirements.md` |
| 製品と作業（加工・洗浄・組付け・キッティング・最終組立・検査・梱包） | `docs/process-plan.json` |
| 資源とつながり（17 の設備・バッファ・コンベヤ、AGV、作業者） | `docs/line-model.json`、模型は `factory/plant-planned.factory.json`（計画案）・`factory/plant-adopted.factory.json`（採用案） |
| 入力のデータ（作業時間の分布・故障・投入・AGV・歩く速さ） | `docs/input-data.json` |
| 配置（区画・AGV の通路）と配置の事項 | `docs/layout-plan.json`、建屋は `bim/plant-hall.bim.json` |
| 妥当性の確認（手計算・極端な条件・流す長さ・建屋との干渉） | `docs/validation-record.json` |
| 案と所見（40 回の実験の表、道具の課題を含む） | `docs/experiment-record.json`、数値は `data/` |
| 制御の確認（正しいはしご・わざと誤ったはしご） | `docs/control-record.json` |
| 判断（Claude の案。承認待ち） | `docs/plan-approval.md` |
| 説明の場面 | `docs/presentation-record.md`、画像は `assets/*.jpg` |
| 引用の表と、網羅から除いた項目の理由 | `trace/citations.json` |

## 確かめたこと

- 手計算との比べ：計画案の AGV 2 台の上限 19.4 台/時から、降ろせずに待つ 29.1% を引くと 13.8 台/時で、模型と合う（VC-02）。採用案の検査台の上限 38.3 台/時に対し 34.4 台/時、検査台の働く割合は計算 61.1%・模型 61.2%（VC-03）。
- 極端な条件：AGV 20 台でも 34.4 台/時（検査台が上限）、組立の作業者 1 人では 2 人要る最終組立が始まらず 0 台、故障を無くすと 36.7 台/時（VC-04〜06）。
- 流す長さ：8 日・30 日・90 日で 34.38・34.43・34.40 台/時（VC-07）。
- 速さ（FT-U7）：採用案の 8 日（61 万の事象）は node で 0.5 秒・Playground の Worker で 1.4 秒、90 日（617 万の事象）は 5.4 秒・6.9 秒。40 回の実験は Worker で 13.5 秒。node は v22.23.4、Playground は headless Chromium（1920 × 1080）。
- 定義の規則（引用の向きと最低数、網羅）を open-workflow-definitions の検査（`scripts/fixture.mjs` に同じ項目と引用を写した見本）で確かめ、問題 0。項目 128、引用 275、網羅の例外 8。

## 道具の課題（Editor Platform に送る）

- ボトルネックの順位は設備だけを比べ、AGV と作業者を数えない。計画案で律速の AGV が出てこない（FD-003）。
- 1 年を一度に流せない（事象の上限 1,000 万。採用案は 1 日に約 7.6 万の事象）（FD-011）。
- 作業者の数が足りず始まらない設備を、モデルの検査が知らせない（FD-012）。
- 3D の再生は建屋の全体を枠に入れ、人と AGV が小さい（FD-013）。
- PLC の走査の上限（500 万回）が、走査 100 ミリ秒では 8 日に届かない（FD-014）。シフトの終わりにラインが休むと「止まった」と知らせる（CC-03）。

## この版でまだ無いもの

- 実績との比べ（架空の工場なので実績が無い）。値はすべて推定か仮定です。
- 人の通路と、人と AGV の動線の交わりの模擬（LI-03）。休憩・休日・不良と手直し。
- 検査台を 2 台にする案（DC-04、次の版）。
- PaoBub には工場の Editor がまだ無く、`factory/` と `bim/` の文書は成果物の「そのまま持つファイル」として置いています。

## 模型と文書と動画を作り直す

`tools/twin/` は Editor Platform のリポジトリで動かす source です（`tests/demo/factory/` に置く。Editor Platform の FT1〜FT6 の機能が要る）。

- `plant.ts`：建屋（BIM）と工場の模型。`ft7.test.ts`：建屋に収まるかと制御の確認。`ft7-facts.test.ts`：この Project が引く数値を `results.json` に書き出す。
- `ft7.demo.ts`（設定は `ft7-demo.config.ts`）：Playground で建屋を開き、計画案を流し、実験 40 回、採用案、90 日、3D の静止画と動画を書き出す。`ft7-clips.demo.ts`（`DEMO=ft7-clips`）：寄った 3D の静止画と、3 日目 10:00〜10:30 の動画。

```sh
# Editor Platform で（CAD_OCCT_DIST はカーネルの置き場）
npx vitest run -c tests/demo/factory/vitest.demo.config.ts tests/demo/factory/ft7-facts.test.ts
cd tests/demo/factory && npx playwright test -c ft7-demo.config.ts
# この Project で
FT7_OUT=/path/to/ft7 OWD=/path/to/open-workflow-definitions python tools/build-project.py
```

`tools/video/` は紹介の動画（ナレーションつき）を組む道具です。

```sh
export VIDEO_WORK=/path/to/work FONT_DIR=/path/to/@expo-google-fonts/noto-sans-jp
python tools/video/tts.py && python tools/video/graphics.py && python tools/video/make.py && python tools/video/final.py
```

- 素材の映像（`ft7-clips.demo.ts` の `planned-day3-1000-1030.mp4`・`adopted-day3-1000-1030.mp4`）は `$VIDEO_WORK/src/` に置きます。動画そのものはこのリポジトリに入れていません。
- 静止画は `assets/*.jpg`、数値は `data/` を使います。撮り直した PNG と数値を使うときは `FT7_OUT` にその置き場を指定します。
