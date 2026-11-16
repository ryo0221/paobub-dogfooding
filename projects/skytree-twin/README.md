# 634 m の電波塔の建設（東京スカイツリーを題材にした近似のデジタルツイン）

PaoBub の「施工計画」（construction-planning 1.0.0）の工程で作った、建設の Project です。

> **公開の情報からの近似です。** 実物の図面・施工計画ではなく、塔の所有者・設計者・施工者とは関係がありません。ロゴや公式の画像は使っていません。

- 高さ 634 m の鋼管トラスの塔（足元の三角形、心柱、350 m・450 m の展望台、ゲイン塔）を、着工 2008-07-14 から竣工 2012-02-29 まで日付ごとに建てる計画です。
- 模型は Editor Platform の建物（BIM、2,927 要素）、工程と揚重・搬入は工事の工程（construction、66 作業・2,208 回の吊り）で作りました。
- 揚重は、168 m まではクローラークレーン 3 台、その上は中心の吹き抜けに立てて鉄骨と一緒に昇るタワークレーン 4 台（想定）。ゲイン塔は吹き抜けの底で組み、5 回に分けて引き上げます。部材はトレーラーが吊りの 30 分前に運び込み、荷台から吊ります。
- 状態：与条件〜安全の 8 工程は「受け入れ待ち」、構造は「省いた」（下）、承認と説明・記録は「進行中」。
- 定義 construction-planning は open-workflow-definitions に足す PR の中です（ブランチ `claude/construction-planning`）。マージ前に開くときは、PaoBub の定義の置き場をそのブランチの `definitions` に向けます。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 与条件（工期・形・敷地・搬入・クレーン、確からしさつき） | `docs/site-conditions.md` |
| 施工の単位（鉄骨の節・心柱・展望台・ゲイン塔） | `docs/construction-model.json`、模型は `bim/construction-model.bim.json` |
| 工法（クローラー、昇るタワークレーン、引き上げ、スリップフォーム） | `docs/method-statement.md` |
| 工程と節目（100 m・300 m・497 m・634 m の記録の日付） | `docs/master-schedule.json`、工事の工程の文書は `construction/skytree-twin.construction.json` |
| クレーン・動線・仮設 | `docs/site-logistics-plan.json` |
| 模擬の記録（最初の計画の 3,573 件の問題と、何をどう直したか） | `docs/simulation-record.json` |
| 安全の確認 | `docs/hazard-review.json` |
| 承認の記録と判断 | `docs/plan-approval.md` |
| 説明の場面と画像 | `docs/presentation-record.md`、`assets/*.jpg` |
| 引用の表と、網羅から除いた項目の理由 | `trace/citations.json` |

## 確かめたこと

- 吊りの検査（届く範囲・荷重表・吊り荷とジブの干渉・昇りの支え・旋回の重なり）：最初の計画は 3,573 件。道具に足りない機能（昇るクレーン、引き上げ、搬入、検査の速さ）を Editor Platform に足し、計画を直して 9 件にしました。9 件はすべて旋回の範囲が重なる注意で、作業範囲と時刻を分ける取り決め（HZ-02・HZ-03）で扱います。
- 節目の日付：634 m の到達は記録と同じ 2011-03-18。
- 検査の時間：node で約 24 秒。Playground（ブラウザー）では画面のスレッドで約 67 秒止まります（Editor Platform の課題）。
- 定義の規則（引用の向きと最低数、網羅）を open-workflow-definitions の検査（`scripts/check.mjs` に同じ項目と引用を写した見本）で確かめ、問題 0。項目 195、引用 520、網羅の例外 1（CO-10 は制約で扱う）。

## この版でまだ無いもの

- 構造の確認（施工中の段階ごとの解析）を省きました。この版を作った環境に、構造の計算の道具（CalculiX を入れた Reference Host）が無かったためです。代わりに、昇りの支えがその日に建っていることを揚重の検査で確かめました（SI-008）。
- 寸法・敷地・ゲート・クレーンの機種と荷重表は推定か仮定です（与条件に確からしさを書いています）。
- 足元の街区の建物は箱の形だけです。
- PaoBub には工事の工程の Editor がまだ無く、`construction/` と `bim/` の文書は成果物の「そのまま持つファイル」として置いています。

## 模型と動画を作り直す

`tools/twin/` は Editor Platform のリポジトリで動かす source です（`tests/demo/sky/` に置く）。

- `twin-bim.ts`・`lattice.ts`：塔の BIM。`tt5-construction.ts`：工程・クレーン・吊り・搬入。`build-project.ts`：この Project の文書を書き出す。
- `tt5.ts`：node で検査を測る。`tt5.demo.ts`（設定は `tt5-demo.config.ts`）：Playground で塔を開いて検査し、静止画・path tracing・工程の動画を書き出す。環境変数 `RECORD_ONLY`（工程の動画だけ）、`CLIPS`（3D の画面だけの映像）。
- Editor Platform の `feat/skytree-twin` の機能（TT1〜TT5）が要ります。

`tools/video/` は紹介の動画（ナレーションつき）を組む道具です。漫画の Project と同じ形です。

```sh
export VIDEO_WORK=/path/to/work FONT_DIR=/path/to/@expo-google-fonts/noto-sans-jp
python tools/video/tts.py && python tools/video/graphics.py && python tools/video/make.py && python tools/video/final.py
```

- 素材の映像（`tt5.demo.ts` の `CLIPS` で撮った `clips.webm` と、工程の動画 `tt5-schedule.mp4`）は `$VIDEO_WORK/src/` に置きます。動画そのものはこのリポジトリに入れていません。
- 静止画は `assets/*.jpg` を使います。撮り直した PNG を使うときは `TT5_OUT` にその置き場を指定します。
