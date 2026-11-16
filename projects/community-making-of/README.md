# Community制作メーキング — 進行中

工程試案 making-of-video@0.1.0。
PaoBubの親Subproject画面から独立Gitリポジトリとして作成。
ローカル正本: `/home/agent/paobub-projects/Community制作メーキング`。

本編は未完成。10〜12分・1920x1080・日本語ナレーションと字幕で、依頼の10章構成を採用する計画。
既存 manga-houkago-gudagudabu/tools/video の rec.mjs を再利用しCDP実画面録画を出力した。
初期調査の画面録画が無く、開始時点からの収録は未達。後撮りで補うなら再現と表示する。
短い字幕焼込みsmokeは本編の代用でもダイジェストでもない。

## 公開順序

Cloudflare実URL → 実URLの収録 → 本編の最終確認・YouTube公開 → サイトへリンク。
実AIと模擬を区別し、登場人物は全員Codexが操作する架空の検証用メンバー、PaoBub画面は開発中と表示する。
認証コード・session state・DB・秘密値は映像やpublic repoへ保存しない。

## 現在の残件

現状はraw初期設定・子作成映像と字幕付き12秒試験出力だけ。本編、音声、サムネイル、最終タイトル/概要/チャプター、試写、YouTubeアップロード未完了。
素材の永続保存はmanifestに保存先が付くまで未完了とする。

親子Project IDと実績は ../community-site/project-export.json と verification.md を参照。
