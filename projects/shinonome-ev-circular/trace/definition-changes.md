# 定義の変更の記録

## 3.6.1（2026-11-23）

- 模型の検算は検査で確かめる（確かめ役はコマンドを流せないため）
- 達成条件が変わった：plant-twin.content

## 3.6.0（2026-11-23）

- 拠点の模型は、本投資が見送られた後の見直しとして置く。最初の収支と判断はそのまま。見直しは収支計画を開き直して行う（Ryo 2026-11-23）
- 工程が変わった：拠点の模型、収支計画
- 達成条件が変わった：financial-plan.content
- 受け入れ済みの「収支計画」は再確認が要る（financial-plan.content）

## 3.5.0（2026-11-23）

- 拠点の模型（デジタルツイン）の工程を足し、収支の前提はその結果を引用する（Ryo 2026-11-23）
- 工程を足した：拠点の模型
- 工程が変わった：収支計画
- 成果物を足した：拠点の模型（デジタルツイン）
- 達成条件を足した：plant-twin.review1、plant-twin.content
- 達成条件が変わった：financial-plan.content
- 受け入れ済みの「収支計画」は再確認が要る（financial-plan.content）

## 3.4.0（2026-11-23）

- 経営会議を役割にし、経営の判断はその役割の人が承認する（findings 84）
- 達成条件が変わった：management-decision.review1
- 受け入れ済みの「経営の判断」は再確認が要る（management-decision.review1）

## 3.3.1（2026-11-23）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.2.0、NPV・IRR・回収年とキャッシュフロー図を引用元として出す版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.3.0（2026-11-22）

- 承認する人を役割で決める（企画の責任者・経理・財務・法務）。投資委員会は財務と法務の 2 つの条件に分ける
- 工程が変わった：投資の判断
- 達成条件を足した：investment.review2
- 達成条件が変わった：financial-plan.review1、risk.review1、investment.review1、business-plan.review1、presentation.review1、learning.review1
- 受け入れ済みの「収支計画」は再確認が要る（financial-plan.review1）
- 受け入れ済みの「リスクと対策」は再確認が要る（risk.review1）

## 3.2.8（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.5、負の IRR を出す版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.2.7（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.4、IRR が無くても NPV を出す版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.2.6（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.3、出所に Project の項目 ID を許す版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.2.5（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.2、AI が年次・出所・シナリオの上書きを提案できる版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.2.4（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.1、新しく作るがある版）に上げる
- Editor の結び付けを変えた：financial-model

## 3.2.3（2026-11-22）

- 収支のモデルを、収支の道具（shinonome.business-case-editor 0.1.0）で開く
- Editor の結び付けを足した：financial-model
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.2.2（2026-11-22）

- マインドマップの Editor を 0.1.4 に上げる（受け入れ前の形の確かめが通る）
- Editor の結び付けを変えた：business-map、opportunity-map、business-model-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.2.1（2026-11-22）

- マインドマップの Editor を 0.1.3 に上げ（空から「新しく作る」）、事業モデルの地図にも当てる
- Editor の結び付けを足した：business-model-map
- Editor の結び付けを変えた：business-map、opportunity-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.2.0（2026-11-22）

- 仮説の引用の規則を、市場の大きさを作る工程3で確かめるように移す（工程2では引ける項目がまだ無い）
- 工程が変わった：市場と顧客
- 達成条件を足した：market.hypothesis
- 達成条件が変わった：hypothesis.content
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.1.3（2026-11-21）

- 事業の地図と機会の地図の Editor を 0.1.2 に上げる（印のチェックボックス、AI の提案で ID を省いた枝を受け付ける）
- Editor の結び付けを変えた：business-map、opportunity-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.1.2（2026-11-21）

- 機会の地図の Editor も、事業の地図と同じ 0.1.1 の build にそろえる
- Editor の結び付けを変えた：opportunity-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.1.1（2026-11-21）

- 事業の地図の Editor を 0.1.1 を前に取り込んだ build に戻す（同じ版の別の build は保持できないため）
- Editor の結び付けを変えた：business-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.1.0（2026-11-21）

- 機会の地図をマインドマップで描けるようにし、捨てた案と理由を項目に足す（工程0で作った定義では「図」になっていた）
- 成果物が変わった：機会の地図
- 達成条件が変わった：opportunity.content
- 成果物の置き場を新しい版に合わせた：opportunity-map
- Editor の結び付けを足した：opportunity-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.0.2（2026-11-21）

- 事業の地図の Editor を 0.1.1 の公開版（印をチェックボックスで選ぶ・枝に印を出す）に合わせる
- Editor の結び付けを変えた：business-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.0.1（2026-11-21）

- 事業の地図の Editor を 0.1.1（色を色見本から選ぶ）に上げる
- Editor の結び付けを変えた：business-map
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

## 3.0.0（2026-11-21）

- 工程0「進め方」で事業の地図から作り、早川が承認した工程定義（pin/process/1、組織の定義 3.0.0 と同じ中身）に上げる
- 工程を足した：機会の探索、事業の仮説、市場と顧客、事業モデル、実行の計画、収支計画、リスクと対策、投資の判断、事業計画書、説明の資料、経営の判断、学び
- 成果物を足した：機会の地図、事業の仮説、市場と顧客の調べ、事業モデルの地図、実行の計画、収支のモデル（NPV・IRR、3つのシナリオ、10年・年次）、リスクの表、投資の判断の記録、事業計画書、アニメーション付きのスライド、経営の判断の記録、学びの記録
- 成果物が変わった：事業の地図、工程定義の下書き
- 達成条件を足した：opportunity.review1、hypothesis.review1、market.review1、market.review2、business-model.review1、execution.review1、financial-plan.review1、risk.review1、investment.review1、business-plan.review1、presentation.review1、management-decision.review1、learning.review1、opportunity.content、hypothesis.content、market.content、business-model.content、execution.content、financial-plan.content、risk.content、investment.content、business-plan.content、presentation.content、management-decision.content、learning.content
- 達成条件が変わった：process.approved
- 成果物の置き場は人が直した所を残した（新しい版も変えている）：business-map、definition-draft
- 受け入れ済みの「進め方」は再確認が要る（process.approved）

