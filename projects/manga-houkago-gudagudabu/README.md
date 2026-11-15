# 放課後ぐだぐだ部

PaoBub の「漫画の制作」（fiction-manga 1.5.0）の工程で作った、学園ギャグ漫画の Project です。

- 第1話「活動内容：特になし」：8 ページ・36 コマ、白黒。
- 13 工程はすべて受け入れ済みです。
- 工程の状態と成果物のファイルの割り当ては `workflow.json`、工程の定義は `definition.json` にあります。

作画は [gulliver-manga](https://github.com/ryo0221/gulliver-manga) を手本にしています。
3D の舞台でコマごとのカメラを決め、Codex（画像生成）にラフ・線画・仕上げを描かせます。採るか描き直すかは作者が決めます。

## 見どころ

| 見たいもの | ファイル |
| --- | --- |
| 仕上げた原稿（Design・レイヤーつき） | `docs/finished-pages.json` |
| 仕上げたページの画像 | `assets/ep01/finish/pages/page-01.png`〜`page-08.png` |
| 線画・ラフのページ | `assets/ep01/ink/pages/`、`assets/ep01/rough/pages/` |
| ネーム（3D のカメラの絵を敷いたページ） | `assets/ep01/name/pages/` |
| 人物の設定画（三面図と背の比べ） | `assets/character/*.png`（下絵の 3D は `assets/character/underlay/`） |
| 3D の舞台（コマごとのカメラの絵・配置図） | `assets/ep01/stage/underlay/`、`assets/ep01/stage/plans/`、記録は `ep01-stage.json` |
| 脚本と「続く状態」 | `docs/script-doc.md` |
| 画作りガイド（決まり・レイヤー） | `docs/art-guide.md` |
| 写植の記録 | `docs/lettering-record.json` |
| 定義の変更の記録 | `trace/definition-changes.md` |

## 成果物のレイヤー（画作りガイドの LY）

漫画ページ（`docs/rough-pages.json`・`ink-pages.json`・`finished-pages.json`）では、コマごとにレイヤーのグループを持ちます。

| レイヤー | 中身 |
| --- | --- |
| LY-01 下描き | 3D のカメラの絵とラフ。線画・仕上げでは非表示で残す |
| LY-02 背景 | 線画を描かせた三色のペンのうち、青で描いた線 |
| LY-03 ベタ | 仕上げで塗りつぶした面 |
| LY-04 トーン | 仕上げで足した網点 |
| LY-05 線画 | 黒で描いた人物の線 |
| LY-06 効果 | 赤で描いた効果の線（あるコマだけ） |
| LY-07 吹き出し | 枠の形（path）。台詞と一緒に動かせるグループ |
| LY-08 文字 | 台詞（編集できる文字） |

各原稿の左端には「記録」のページがあります。中身は、成果物の見出しごとの記録（使った資料、レイヤー、AI の道具と版、背景の線の無いコマなど）です。

## 絵を作り直す

道具は `tools/` にあります。Python 3（Pillow・numpy）と、ログイン済みの Codex CLI が要ります。
作業用のフォルダー（下の例の `WORK`）は、リポジトリの外に置きます。

### 3D の舞台（コマごとのカメラの絵）

[editor-platform](https://github.com/ryo0221/editor-platform) の Playground で組みます。

```sh
cd /path/to/editor-platform && npm ci --ignore-scripts
cp <この Project>/tools/stage/gudaguda-ep01-stage.demo.ts tests/demo/
cp <この Project>/tools/stage/gudaguda-stage.config.ts .
STAGE_OUT=/tmp/gstage STAGE_SETS=council,club,sheet npx playwright test -c gudaguda-stage.config.ts --trace off
cd <この Project>
python3 tools/stage/stage-assets.py /tmp/gstage docs/storyboard-pages.json assets/ep01/stage
```

- 部屋（生徒会室・部室と廊下）と、4 頭身の人物の箱の体を組みます。
- コマごとのカメラ・ポーズ・配置は `docs/storyboard-pages.json` から読みます。
- `stage-assets.py` は、カメラの絵をコマの枠に切り、配置図を描き、主役がコマの枠に入っているかを確かめます。

### ラフ・線画・仕上げ（Codex）

```sh
python3 tools/art/briefs.py rough WORK/rough          # コマごとの説明と構図の型を作る（ink・finish も同じ）
PAR=6 bash tools/art/run.sh WORK/rough                # raw.png の無いコマを Codex で描く（1 コマ約 5 分）
python3 tools/art/panel-assets.py rough WORK/rough    # コマの枠に切り戻し、記録（道具・参照・sha256）を書く
```

- 決まったコマだけ描き直すときは、`ONLY=PN-001,PN-002` を付けて `briefs.py` を流します。そのコマの `raw.png` をどけてから `run.sh` を流します。
- 作者の直しは `assets/ep01/<rough|ink|finish>-notes.json` に `{"PN-010": "直す点"}` の形で書くと、説明に入ります。
- `panel-assets.py` は、線画を色で背景・人物・効果に分け、仕上げはベタとトーンに分けます（`assets/ep01/<種類>/layers/`）。
- `codex exec` は `--sandbox workspace-write` で流します。

### ページと吹き出し・Design の原稿

```sh
python3 tools/pages/compose.py finish assets/ep01/finish/pages   # ページを組み、吹き出しを置く（name・rough・ink も）
python3 tools/pages/lettering.py assets/ep01/finish/pages/balloons.json   # 写植の記録を合わせる
python3 tools/pages/records.py finish                            # 記録のページの中身
python3 tools/pages/build-design.py finish assets/ep01/finish/pages/balloons.json docs/finished-pages.json
```

- 吹き出しは、3D で写る頭と、線画の人物の線を避けて置きます。読む順（右上から左下）も守ります。
- 自動で置けなかった吹き出しは、`assets/ep01/lettering-notes.json` に `{"DL-040": {"at": [x, y], "why": "..."}}` で位置を決めます。x と y は、コマの幅・高さに対する割合です。
- できた Design は、Editor Platform の `isDesignWithPaths` で確かめてから PaoBub で開きます。

## メイキング動画を作る

この Project の制作の流れを、約10分の紹介動画（ナレーション・字幕つき）にする道具と手順は、[`tools/video/README.md`](tools/video/README.md) にあります。
PaoBub の画面を録画し、`assets/` の絵から作った図と合わせて、合成音声のナレーションで書き出します。

## 経緯

- 2026-11-14：PaoBub の通し試験として、全 13 工程を通しました。
- 2026-11-15：工程の定義を fiction-manga 1.5.0 に上げました。gulliver-manga の手本に合わせて、設定画・3D の舞台・ラフ・線画・仕上げを作り直しています。
- 見つけた PaoBub の不具合は [ryo0221/paobub#286](https://github.com/ryo0221/paobub/pull/286)、定義の変更は [ryo0221/open-workflow-definitions#6](https://github.com/ryo0221/open-workflow-definitions/pull/6) で直しています。
- 地図（`docs/stage-map.json`）は、まだ gulliver-manga の水準に作り直していません。
