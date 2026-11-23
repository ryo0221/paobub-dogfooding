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
