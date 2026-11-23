# 拠点の模型を流す道具

- `factory-core.mjs`：工場の模型の計算（離散事象シミュレーション）。工場のデジタルツインの計算部分を 1 つにまとめたもの。手で直さない。
- `run.mjs`：`docs/plant-model.json` の `model` を `cases` ごとに流し、時間あたりの量・稼働率・人の忙しさ・ボトルネックをまとめる。`--write` で結果を `runs` に書き戻す。
- `example.factory.json`：模型の書き方の例（別の工場の組立ライン）。products / objects（source・station・parallel・buffer・conveyor・assembly・drain）/ links / calendars / workerPools / fleets / run の形はこれを見る。

```sh
node tools/twin/run.mjs docs/plant-model.json          # 流して見る
node tools/twin/run.mjs docs/plant-model.json --write  # 結果を runs に残す
```

時間はミリ秒、位置と大きさはミリメートル。年の量は「時間あたりの量 × 年の稼働時間」で出す（稼働時間は模型の暦と年の稼働日から計算し、結果に書く）。
