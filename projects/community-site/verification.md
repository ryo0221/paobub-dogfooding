# 2026-11-16 実行環境の検証（途中）

- PaoBub `24799d0c4f926cb99b74456b23e58d82d09f5246`、software-product@1.7.0。
- Node 24.19.0でnpm ciは成功したが、APIのSQLite cleanupで`node::RemoveEnvironmentCleanupHook` assertion、exit 134。UIの読み込み停滞はAPI停止が原因。推奨Node 22へ切り替えて再検証中。
- 正規メールコードAPIで6 Personを作成し別contextで認証。メール受信は開発用ローカルoutboxであり、メール実送信の実証ではない。
- 正規`POST /api/repo-projects`で当repoを親として登録。初回は設定のphases不足で400、修正後201。DBや承認状態の直接変更なし。
- 子Project・6役の参加権限・協働・実AI返却は未確認。
- Cloudflare Wrangler whoami: 未認証。Staging dry-run build成功。D1 local migration 6 statements成功。remote配備未実施。
- Worker unit: Node 20.20.2で3 passed/0 failed/0 skipped。Node 24の集計はファイル単位1件だったため個別試験結果と分ける。
- Local PC 1440x1000・mobile 390x844: ページエラー0、横overflowなし、空カタログ表示成功。公開版データやRemixの検証ではない。
- 工程2試案: npm run check成功（schema/semantic/21既存試験）。制作実績による検証は残る。

## 公開ゲート

実URL、remote D1/R2分離、招待認証、投稿・審査・停止・通報、Native保存/再編集/Remix、hashと依存拒否、権限、復旧、亮さん本人の判断、完成動画と永続保存、YouTube公開は未完了。

## Node 22復旧後の実績

Node 22.21.1と`npm rebuild better-sqlite3`で復旧。APIの起動・正規UI操作が成立。
親Project `rprj_f946c0ffa0814793`、子content `rprj_4c748ce63c1a4b5f`、子video `rprj_745a07ded65d4ab2`。子はSubproject実画面から新規の独立Gitリポジトリを作成。
5役のProject参加は正規APIでbootstrap（201/200）。組織と本人へのedit/view付与は共有UI。PMのみ作成者の管理権限を持ち、他5役に承認は付与していない。
マーケター・デザイナー・エンジニアがEditorで提案/レビュー/固定commit引継ぎを保存・再読込。QAと運営は閲覧可、保存ボタン0、権限外PUTは403。

### 実AI（fake未使用）

ユーザーの明示承認後、PaoBub ThreadからAnthropic Agent SDKへ小さな文書追記を依頼。
`run-83baa94edf5245bc`は確かめが通り「人の確認待ち」として返却。
作業commit `6bd55ddb68a4ba8043d09f892d5717f949d6bd63`の追記を確認し、葵のAIレビューを正規Editorで保存・再読込（`ca9ee49a543d6f0b9035ce2a64d64047e4afb479`）。
これは組込の実AI経路の検証であり、外部PC Runnerの隔離を実証しない。正式な人の工程受入・固定版tagは未作成。

### 録画

CDP raw初期設定（API停止を含む）・子作成・権限付与・保存を出力。1920x1080・12秒の字幕焼込みsmokeをffprobe確認。
10〜12分本編、ナレーション、サムネイル、最終公開パッケージは未完成。
GitHub Releaseへのraw保存案は自動承認レビューに保存方針違反として拒否された。アップロードせず、別の永続保存先を確認中。workspaceだけの保存を永続保存完了と扱わない。

Node 22でWorker 3 passed/0 failed/0 skipped、Staging dry-run再ビルド成功。
差し戻し・変更演習・古い承認の失効・親子成果物受渡し・Native Remix・dev/Staging実URL・公開B・復旧は未実施。

QA直人は版比較画面で2 commitを選び、差分表示を確認（qa-compare.txt/png）。工程の人による承認ではない。
