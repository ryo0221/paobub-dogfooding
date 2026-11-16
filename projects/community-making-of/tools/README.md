# 初期検証の再生成スクリプト

今回の検証で使ったProject固有のスクリプト。録画本体は `projects/manga-houkago-gudagudabu/tools/video/rec.mjs` を再利用する。

このまま誰でも起動できる公開デモではない。PaoBub private固定版、Node 22、依存、Chromium、ffmpeg、日本語フォント、検証用の認証済みstorageStateが必要。各スクリプトの`/workspace`、Project ID、保存先を自分の分離した検証環境へ合わせる。storageState・OTP・DBはGitに追加しない。

- `children.mjs`: 子2件を正規UIから作成してraw収録する。**新規作成操作なので同じProjectで反復すると重複する**。専用の検証Projectで実行する。
- `edit-save.mjs`: AI追記の検証用レビューをEditorで保存して再読込。正式な工程承認はしない。
- `compare.mjs`: QAの閲覧専用sessionで2版を比較する。
- `site-check.mjs`: local WorkerをPC/mobileで確認しscreenshots・pageerror・overflowを保存する。

映像出力・スクリーンショット・認証データはrepo外。作成時刻・対象版などの素材台帳はmedia-manifest.jsonの未記録欄を補う必要がある。スクリプト保存だけで本編の再生成可能性を保証しない。
