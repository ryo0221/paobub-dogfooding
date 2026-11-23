# 新規事業の企画のプロモーション動画（ナレーション付き）

東雲物産（架空）の Project B「新規事業の企画」を、手元の PaoBub で 13 工程すべて受け入れたあとに撮った約 2 分 44 秒の動画の道具。工場の動画（projects/factory-twin/tools/video）と同じ組み立て方。

1. 手元の PaoBub（127.0.0.1:4840/4841、dev の outbox でログイン）を立てる。
2. `VIDEO_WORK=<作業フォルダー> node shots.mjs` で画面を、`node clips.mjs` で動く画面（webm）を撮る。
3. `VIDEO_WORK=... FONT_DIR=<@expo-google-fonts/noto-sans-jp の package> python tts.py`（pyopenjtalk-plus）→ `python graphics.py` → `python make.py` → `python final.py out.mp4`。

場面とナレーションは scenes.py、絵の割り当ては visuals.py。数字は受け入れた版（pin/financial-plan/2 など）のもの。

## 見直し（2026-11-23）

本投資の見送り（MD-01）のあと、拠点の模型（デジタルツイン）から収支を作り直した流れを s27〜s35 に足した（全 37 場面、約 13 分半）。

- `shots3.mjs '[["名前","工程","成果物のパス or null","スクロール先の文字",n]]'`：見直しの画面を `VIDEO_WORK/shots3/` に撮る（見出しへスクロール）。
- `fin-edit.mjs --save`：石田として収支の道具で前提を入れ直し、録画を `VIDEO_WORK/rec/` に残す（`src/fin-edit.webm` にして使う）。保存まで行うので、撮り直しは版が増える。
- graphics.py の後半：拠点の模型の図（`TWIN_JSON` = docs/plant-model.json の写し）、年ごとの構成、費用の積み上げ、前の版との比べ、再審査のスライド（`SLIDES_DIR`）。

## 撮る素材の一覧（作業フォルダー `VIDEO_WORK` の中）

graphics.py と make.py は、次の素材がそろってから流します。足りないと止まります。

| 置き場 | 作る道具 | 中身 |
| --- | --- | --- |
| `shots/` | `shots.mjs` | Project B の工程と成果物の画面 |
| `shots2/` | `shots2.mjs` | 道具づくり（Project A）と Project B の対話面（`a-*`・`b-*`）と成果物（`*-f`） |
| `shots3/` | `shots3.mjs` | 見直し（s27〜s35）の画面 |
| `src/create.webm`・`share.webm`・`mindmap.webm`・`room.webm` | `clips-a.mjs` | Project を作る・人を割り当てる・マインドマップ・対話面の録画 |
| `src/fit-map.webm`・`model-fit.webm`・`cite.webm`・`slides.webm`・`scenario.webm` | `clips.mjs` | 収支・引用・スライドの録画 |
| `src/fin-edit.webm` | `fin-edit.mjs --save` | 収支の道具で前提を入れ直す録画（`rec/` から移す） |
| `src/reman-3d.mp4`・`reman3d/still.png`・`ui.png` | Editor Platform の Playground の工場の Editor（下） | 拠点の模型の 3D |
| `twin/plant-model.json`（`TWIN_JSON`）・`sl/`（`SLIDES_DIR`） | Project の `docs/plant-model.json` の写しと、説明の資料の書き出し | 見直しの図とスライド |

- 道具の中の Project の ID（`rprj_…`）とペルソナのメールは、撮った手元の PaoBub のものです。別の手元で撮るときは、その PaoBub の ID に差し替えてください。
- 拠点の模型の 3D：Playground で工場の Artifact を作り、`docs/plant-model.json` の `model` に 2035 年のケースを当てた模型を取り込んで流し、3D のタブで再生の時刻（3 日目 7:54〜10:24）を少しずつ進めて「Save still」で 1 コマずつ書き出し、ffmpeg で 24 コマ/秒の mp4 にします（画面の録画は 1080p だと途中で止まるため）。
