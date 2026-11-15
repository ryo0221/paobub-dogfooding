# paobub-dogfooding

[PaoBub](https://github.com/ryo0221/paobub) を実際の制作で使ってみた Project を置くリポジトリです。
1 つの Project を、`projects/<名前>/` に 1 フォルダーで置きます。
各フォルダーは、PaoBub の Project の主のリポジトリの中身です。中身は `workflow.json`・`definition.json`・成果物・記録で、PaoBub でそのまま開けます。

## Project の一覧

| フォルダー | 工程の定義 | 中身 |
| --- | --- | --- |
| [projects/manga-houkago-gudagudabu](projects/manga-houkago-gudagudabu/) | 漫画の制作（fiction-manga 1.5.0） | 学園ギャグ漫画「放課後ぐだぐだ部」の第1話（8 ページ・36 コマ）。全 13 工程。3D の舞台・設定画・ラフ・線画・白黒の仕上げまで |

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
