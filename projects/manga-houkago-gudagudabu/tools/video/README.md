# メイキング動画を作る

この Project の制作の流れを、約10分の紹介動画（1920×1080、日本語のナレーションと字幕つき）にする道具です。
PaoBub の画面を録画し、成果物の絵から作った図と合わせて、合成音声のナレーションで進めます。

- 2026-11-15 に作った動画は、15 のチャプター（オープニング、13 の工程、第1話を読む、まとめ）で 10 分 8 秒です。
- PaoBub の画面が映っている間は、右上に「開発中の画面です」と出します。

## 要るもの

| もの | 用途 |
| --- | --- |
| [PaoBub](https://github.com/ryo0221/paobub) を手元で動かせること | 画面の録画 |
| Node.js 22 と Playwright（Chromium） | 画面の録画（`clips.mjs`） |
| Python 3（Pillow・numpy） | 図・映像の組み立て |
| [pyopenjtalk-plus](https://pypi.org/project/pyopenjtalk-plus/) | 合成音声（ネットにつながずに読み上げる） |
| ffmpeg（libx264・libass 入り） | 映像の書き出し、字幕の焼き込み |
| Noto Sans JP の TTF | 図と字幕の文字 |

## 手順

### 1. 準備

```sh
# 作業フォルダー（リポジトリの外に置く。録画や途中の映像で数 GB になる）
export VIDEO_WORK=~/work/gudaguda-video

# 合成音声
python3 -m venv ~/work/tts && ~/work/tts/bin/pip install pyopenjtalk-plus numpy

# 文字（npm から TTF を取る）
mkdir -p ~/work/fonts && cd ~/work/fonts && npm pack @expo-google-fonts/noto-sans-jp && tar xzf expo-google-fonts-noto-sans-jp-*.tgz
export FONT_DIR=~/work/fonts/package

# Playwright をこのフォルダーに入れていなければ、入っている場所を教える
export PLAYWRIGHT_DIR="$(npm root -g)"
```

### 2. PaoBub を立ち上げ、この Project を開く

```sh
cd /path/to/paobub
git submodule update --init && npm install
PAOBUB_MVP_AI=fake scripts/dev.sh        # 画面 http://127.0.0.1:4840
```

- この Project のフォルダーを、git のリポジトリとして `~/repos/放課後ぐだぐだ部` に置きます（コピーして `git init` → commit）。
- PaoBub の「Project を作る」で、そのリポジトリを主のリポジトリにして開きます。開いた Project の URL `/r/rprj_…/` の `rprj_…` を控えます。
- 録画は AI を呼ばないので、`PAOBUB_MVP_AI=fake` で足ります。

```sh
export PAOBUB_PROJECT_ID=rprj_xxxxxxxxxxxxxxxx
# 既定と違うときだけ
# export PAOBUB_WEB=http://127.0.0.1:4840
# export PAOBUB_OUTBOX=~/.paobub-mvp/outbox   # ログインの番号が届く受け箱
# export PAOBUB_EMAIL=video@example.com
```

### 3. 図・音声・映像を作る

このフォルダーで、順に流します。

```sh
python3 graphics.py               # 図（題名、13 の工程、コマの変化、レイヤーなど）→ $VIDEO_WORK/img/
~/work/tts/bin/python tts.py      # ナレーションの音声と時刻 → $VIDEO_WORK/audio/、timing.json
python3 make.py                   # 場面ごとに、画面の録画と図を音声に合わせて並べる → $VIDEO_WORK/scene/
python3 final.py final.mp4        # つなぎ、字幕・「開発中の画面です」・BGM を足して書き出す
```

- `make.py` は画面を実時間で録画するので、全部で 15〜20 分かかります。場面を名指しすると、その場面だけ作り直せます（例 `python3 make.py s05 s09`）。
- 録画したものは `$VIDEO_WORK/seg/*_raw.mp4` に残り、次からは使い回します。録り直すときは、その場面の `_raw.mp4` を消すか、`REC=1` を付けて流します。
- `final.py` は、`$VIDEO_WORK` に `final.mp4` のほか、`out.srt`（字幕）と `chapters.txt`（YouTube のチャプターの時刻）を書きます。

## ファイルの役割

| ファイル | 中身 |
| --- | --- |
| `scenes.py` | 場面ごとのナレーション（字幕の文）と、合成音声の読み（`YOMI`。PaoBub→パオバブ など） |
| `visuals.py` | 場面ごとに、何番目の文から何を映すか（`ui`＝画面の録画、`img`＝図、`phases`＝13 の工程を順に光らせる図） |
| `clips.mjs` | 画面の録画の台本。録画の名前ごとに、開く画面と操作（スクロール、ページに寄る、コマを選ぶなど） |
| `login.mjs`・`rec.mjs` | ログイン（受け箱の番号を使う）と、CDP の screencast で 1920×1080 に録る道具 |
| `graphics.py` | 図を作る。素材は `assets/`（設定画、3D のカメラの絵、ラフ・線画・仕上げのコマ、レイヤー） |
| `tts.py` | pyopenjtalk で読み上げ、文ごとの時刻を `timing.json` に書く |
| `make.py` | 場面ごとの映像（録画は音声の長さに合わせて伸ばす・止める、図はゆっくり寄る） |
| `final.py` | 字幕（ASS）と「開発中の画面です」の表示、BGM（その場で作る静かな和音）、音量をそろえて書き出す |

## 直したいとき

- 言い回し：`scenes.py` を直して、`tts.py` → `make.py` → `final.py` を流します。文の数が変わったら、`visuals.py` の番号も合わせます。
- 映す画面：`visuals.py` で録画の名前を差し替えます。新しい録画は `clips.mjs` の `C` に足します。台本は `T`（その録画の秒数）に対する割合で動きを置き、`until(1)` で終わります。
- 読み間違い：`scenes.py` の `YOMI` に足します（字幕はそのまま、音声だけ読みが変わります）。
- BGM を差し替える：`final.py` の `bgm.wav` を作る所を、好きな音源の読み込みに替えます。

## 注意

- 文書の Editor（企画書・脚本など）で、「Markdown のまま」の注意書き（`.native-editor > .raw-note`）が編集欄の高さの半分を取り、本文が細くしか見えません。録画のときだけ、`clips.mjs` の `go()` で CSS を足して詰めています。PaoBub 側で直ったら、この CSS は消せます。
- 画面の文字を読みやすくするため、ブラウザーは 1280×720 を 1.5 倍で描き、1920×1080 で録ります。
- PaoBub の画面が変わると、`clips.mjs` のボタン名や座標（ページ・コマをクリックする位置）が合わなくなることがあります。`make.py` はそのとき「画面の録画 … に失敗しました」で止まります。
