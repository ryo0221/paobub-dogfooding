# 新規事業の企画のプロモーション動画（ナレーション付き）

東雲物産（架空）の Project B「新規事業の企画」を、手元の PaoBub で 13 工程すべて受け入れたあとに撮った約 2 分 44 秒の動画の道具。工場の動画（projects/factory-twin/tools/video）と同じ組み立て方。

1. 手元の PaoBub（127.0.0.1:4840/4841、dev の outbox でログイン）を立てる。
2. `VIDEO_WORK=<作業フォルダー> node shots.mjs` で画面を、`node clips.mjs` で動く画面（webm）を撮る。
3. `VIDEO_WORK=... FONT_DIR=<@expo-google-fonts/noto-sans-jp の package> python tts.py`（pyopenjtalk-plus）→ `python graphics.py` → `python make.py` → `python final.py out.mp4`。

場面とナレーションは scenes.py、絵の割り当ては visuals.py。数字は受け入れた版（pin/financial-plan/2 など）のもの。
