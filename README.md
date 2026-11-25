# paobub-dogfooding

[PaoBub](https://github.com/ryo0221/paobub) を実際の制作で使ってみた Project を置くリポジトリです。
1 つの Project を、`projects/<名前>/` に 1 フォルダーで置きます。
各フォルダーは、PaoBub の Project の主のリポジトリの中身です。中身は `workflow.json`・`definition.json`・成果物・記録で、PaoBub でそのまま開けます。

## Project の一覧

| フォルダー | 工程の定義 | 中身 |
| --- | --- | --- |
| [projects/manga-houkago-gudagudabu](projects/manga-houkago-gudagudabu/) | 漫画の制作（fiction-manga 1.5.0） | 学園ギャグ漫画「放課後ぐだぐだ部」の第1話・第2話（16 ページ・72 コマ）。全 13 工程。3D の舞台・設定画・ラフ・線画・白黒の仕上げまで |
| [projects/watch-sk01](projects/watch-sk01/) | メカニカル製品の開発（product-design-engineering 1.0.0） | スケルトンの手巻き腕時計 SK-01。進め方〜詳細設計（P0〜P4）。配置と部品ごとの詳細の 3D モデル、干渉と噛み合いの解析 |
| [projects/car-sho](projects/car-sho/) | メカニカル製品の開発（product-design-engineering 1.0.0） | ミッドシップの 2 人乗り「翔」。進め方〜詳細設計（P0〜P4）。配置の 3D モデルと外形（外板・窓・床）の詳細の 3D モデル |
| [projects/skytree-twin](projects/skytree-twin/) | 施工計画（construction-planning 1.0.0） | 東京スカイツリーを題材にした近似のデジタルツイン（公開の情報からの近似、所有者・施工者とは関係なし）。634 m の塔の建設を、昇るタワークレーン・ゲイン塔の引き上げ・トレーラーの搬入と一緒に日付で模擬。吊りの検査 3,573 件 → 9 件 |
| [projects/factory-twin](projects/factory-twin/) | 生産システム計画（production-system-planning 1.0.0） | 架空の e-Axle の工場のデジタルツイン（実在の会社・工場・製品とは関係なし）。1 本の組立ラインを建屋に置き、物の流れ・作業者・AGV・PLC を模擬。計画案 13.8 台/時（律速は AGV）→ 実験 40 回 → 採用案 34.4 台/時 |
| [projects/shiraha](projects/shiraha/) | アニメのメカデザインと玩具化（mecha-design 1.2.0） | オリジナルの可変機「白羽」。白鳥のような飛ぶ形から人の形へ変わり、兜を外すと素顔。進め方〜配色の 10 工程。作業役（Codex）が CAD で組んだ 152 部品・21 姿勢の 3D モデル（干渉 0 件）、東京駅のデジタルツインでの絵 |
| [projects/shinonome-ev-circular](projects/shinonome-ev-circular/) | 新規事業の企画（new-business-planning 1.0.0 を元にした Project 内の定義 3.6.1） | 架空の総合商社「東雲物産」が、タイで EV の e-Axle と電池を集めて生かす循環事業を企画（実在の会社とは関係なし）。全 14 工程を受け入れ。最初の判断は見送り（NPV −12.8 億円）→ 再製造の拠点を工場のデジタルツインで組んで収支の道具で入れ直し（NPV +0.37 億円）→ 再審査で保留の継続。マインドマップ・収支の道具・生きた引用も PaoBub で作って使用 |
| [projects/accident-analysis-kr7](projects/accident-analysis-kr7/) | 故障の原因解析と対策（failure-analysis 1.1.0） | 架空の協働ロボット KR-7 の肘関節の停止遅れ（ヒヤリハット）。特性要因図・FMEA・FTA を明示した引用でつなぐ。FMEA と FTA は 2 社の担当者が共同編集で同時に開き、「候補から選ぶ」で根拠を選んだ（選んだ人と版が残る） |

## Project を PaoBub で開く

PaoBub は、Project の主のリポジトリを git のリポジトリとして読みます。開く手順は次のとおりです。

1. Project のフォルダーを、それだけの git リポジトリとして複製します。

   ```sh
   git clone https://github.com/ryo0221/paobub-dogfooding
   mkdir -p ~/paobub-projects
   cp -R paobub-dogfooding/projects/manga-houkago-gudagudabu ~/paobub-projects/
   cd ~/paobub-projects/manga-houkago-gudagudabu
   git init -q -b main && git add -A && git commit -qm "dogfooding から取り込む"
   ```

   - 取り込みのコミットを main に作ります。PaoBub は、工程ごとに `work/<工程>` のブランチを作り、受け入れた版に `pin/<工程>/<n>` のタグを付けます。
   - このリポジトリには、そのブランチとタグは入っていません。

2. PaoBub を手元で立てます（PaoBub の README を見る）。工程の定義の置き場は、[open-workflow-definitions](https://github.com/ryo0221/open-workflow-definitions) の `definitions` を指します。

   ```sh
   PAOBUB_MVP_DEFINITIONS=/path/to/open-workflow-definitions/definitions npm run dev
   ```

3. 画面（http://127.0.0.1:4840）で「Project を作る」を開き、置き場に手元のフォルダーを選びます。
   - `workflow.json` があるフォルダーは、新しく作らずにそのまま開きます。
   - 開いたら、工程（Thread）ごとに成果物を Editor Platform で開けます。
     例：「仕上げと写植」の `docs/finished-pages.json` は、漫画ページの Editor で開きます。

## 新しい Project を足すとき

- `projects/<英小文字とハイフンの名前>/` に置きます。
- Project の main の中身をそのまま入れます（`git archive main` で書き出すと、追跡していないファイルが入りません）。
- 上の一覧に 1 行足します。
- 1 ファイル 100MB を超えるものは置けません（GitHub の上限）。
