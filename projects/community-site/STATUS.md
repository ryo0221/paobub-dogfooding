# 実行状況 — 全体未完了（2026-11-16）

## URL・PR

Cloudflare本番/確認URL: 未発行（Wrangler未認証）。localはhttp://127.0.0.1:8787。PaoBubはhttp://127.0.0.1:4840。
YouTube URL: なし。本編パッケージ未完成。現状は12秒の字幕出力試験であり、完成本編やダイジェストではない。

- Community draft: https://github.com/ryo0221/open-editor-community/pull/1
- Workflow draft: https://github.com/ryo0221/open-workflow-definitions/pull/9
- Dogfooding draft: https://github.com/ryo0221/paobub-dogfooding/pull/5

## Project・役割

親 `rprj_f946c0ffa0814793`、content子 `rprj_4c748ce63c1a4b5f`、video子 `rprj_745a07ded65d4ab2`。
子はそれぞれ独立Gitリポジトリ。初期exportとsource commitは各入口のinitial-exportにある。初回親登録とProject参加招待は正規APIの管理操作、それ以外に子作成・共有付与・成果物編集・保存・版比較は実画面を使用。DBや承認状態は直接変更していない。

| 架空メンバー | 実施したこと | 未完了 |
| --- | --- | --- |
| 葵/PM | 親登録、子2件のUI作成、権限設定、実AI依頼、AI提案のレビュー保存・再読込 | 人の工程承認は代行しない |
| 美咲/マーケター | 対象層・作成導線の提案を別セッションで編集・保存・再読込 | 動画企画の制作実績 |
| 凛/UX/UI | local画面レビューを別セッションで保存・再読込 | 正式な画面成果物・変更後再レビュー |
| 拓也/エンジニア | 実装参照commitと残件の引継ぎを別セッションで保存・再読込 | 投稿・Native/Remix・remote配備 |
| 直人/QA | 閲覧、版比較、権限外保存403と保存ボタン非表示 | 全受入・差し戻し・remote試験 |
| 千尋/運営 | 閲覧、権限外保存403と保存ボタン非表示 | 投稿審査・停止・通報・復旧 |

6 Person IDと実際のedit/view権限はroles.json参照。PM以外は承認権限なし。本人の個人組織の管理者であることと、親Project管理者であることは別。
亮さんが今回明示承認したのは実AIへ検証用データを送信すること。工程受入・本番公開・YouTube公開の承認は得ていない。

## 実AI・版

PaoBub Thread → Anthropic Agent SDK → 文書追記 → 確かめ通過 → 画面返却 → EditorでAIレビューを保存・再読込、まで成立。
実行 `run-83baa94edf5245bc`、作業 `6bd55ddb68a4ba8043d09f892d5717f949d6bd63`、レビュー保存 `ca9ee49a543d6f0b9035ce2a64d64047e4afb479`。
その後3役のUI保存は `d4cfcca1d0ea29db62b6ce9977a5e52e444d7921`、`415107f43d6861e6b1ea53f9b9f47ce17510da20`、`575252e102a392550ff397589556e3e69629c0b7`。
private repoの`codex/community-ai-process-evidence`に保持。正式な人の受入前で固定版tagなし。fake provider未使用。組込実AIの実績であり、外部PC Runnerの隔離・全機能の実証ではない。

開始commitはsource-pins.json。工程software-product@1.7.0、子2種@0.1.0試案（定義commit `996e56c0778184deeced9fd72bccb59cfa8e83c7`）。公開Editor snapshot `0ee0c711027b73e0112a544783793a3563808dd7`は取得のみ、Native一周は未実施。
Community現候補 `e311000`、実装試験は`4492487`と同一のWeb/APIコード（その後は検証文書とCI追加）。Worker hashはprivate repo docs/deployment.md。

## テスト

成功: Workflow schema/semantic/既存21試験、Worker unit 3試験、dry-run build、local D1 migration、PC/mobileのpageerror 0・横overflowなし、UI保存・再読込、QA版比較、QA/運営PUT 403。
失敗と対処: sandbox proxy不通→許可済み環境側通信、Node24 SQLite assertion→Node22再構築、workflow phases不足→設定修正、Playwright専用ffmpeg不足→既存CDP録画方式。
誤った末尾slash URL・見出しlocator・個人組織招待も失敗し、現行仕様の正規経路へ修正した。
未実施: 差し戻しと修正、仕様変更演習、旧承認失効、親子成果物受渡し、作者A/Bと閲覧者、Native形式確定・Remix、dev/Staging/本番、復旧、公開A/B全受入。
GitHub Actionsも exact head `e31100010266531811ed075e4c26c5bc0a46cbad` で成功（3試験とbuild）。実行: https://github.com/ryo0221/open-editor-community/actions/runs/43945569904 。remote配備や公開受入の成功ではない。

## 映像・保存・残る操作

rawはCloudの`/workspace/community-evidence/raw/`、12秒smokeは`/workspace/community-evidence/output/smoke-subtitled.mp4`、字幕smoke.srt。
public repoにはメタデータ・hash・字幕・再生成スクリプトだけ。media-manifest.json参照。rawはまだ永続保存されていない。
GitHub Releaseへのraw保存案は自動承認レビューに保存方針違反として拒否されたため、実行していない。R2/Driveの保存先を確認中。
初期調査からの録画と、サイト制作開始時点での動画Project作成は未達。後撮りを行う場合は再現と明示する。
本編・ナレーション・サムネイル・最終タイトル/概要/チャプター・試写・YouTube公開は未完了。既存ツールにアップロード経路は見つからず、利用可能なチャンネル認証も未確認。

CloudflareはアカウントとWorkers/D1/R2権限の認証、各環境のD1 ID/R2設定が必要。private repo docs/deployment.mdに具体コマンドを置いた。サイトの不足実装とStaging受入を完了してから亮さんに対象版の公開判断を提示する必要がある。認証さえ揃えば公開可能な状態という意味ではない。

#3の達成対応はREADMEの表を参照。今回の初期実績で#3全体やPaoBub全機能を完了扱いにしない。
