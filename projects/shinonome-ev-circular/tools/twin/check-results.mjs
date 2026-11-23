import assert from 'node:assert/strict';
import fs from 'node:fs';

const doc = JSON.parse(fs.readFileSync('docs/plant-model.json', 'utf8'));
const runs = JSON.parse(fs.readFileSync(0, 'utf8'));
assert.deepEqual(runs, doc.runs, '再実行の出力と保存済みの模型結果が一致しない');

const runsByCase = new Map(runs.map((run) => [run.case, run]));
const results = doc['twin-result'].filter(({ id }) => id === 'TR-01' || id === 'TR-02');
const annual = results.flatMap((result) => result.annual);
assert.deepEqual(
  annual.flatMap(({ marketCase, capacityCase }) => [marketCase, capacityCase]),
  runs.map(({ case: id }) => id),
  '年別の結果と再実行したケースが一致しない',
);

const packWeight = results.find(({ id }) => id === 'TR-01').calculationBasis.market.packWeightTonnes;
const batteryPacks = ({ produced }) => produced['battery-reuse'] + produced['battery-material'];
const axleUnits = ({ produced }) => produced['e-axle'];

for (const { id, annual, annualSummary } of results) {
  for (const row of annual) {
    const market = runsByCase.get(row.marketCase);
    const capacity = runsByCase.get(row.capacityCase);
    const summary = annualSummary.find(({ year }) => year === row.year);
    const label = `${id} ${row.year}年`;
    assert.equal(market.year, row.year, `${label} 市場量ケースの年`);
    assert.equal(capacity.year, row.year, `${label} 能力試験ケースの年`);
    assert.equal(row.throughput.batteryPacks.completedReuse, market.produced['battery-reuse'], `${label} 再利用向けの完了数`);
    assert.equal(row.throughput.batteryPacks.completedMaterialRecovery, market.produced['battery-material'], `${label} 材料回収向けの完了数`);

    for (const line of [
      { name: '電池', counts: batteryPacks, weight: packWeight, figures: row.throughput.batteryTonnes, reported: summary.batteryCapacityTonnes },
      { name: 'e-Axle', counts: axleUnits, weight: 1, figures: row.throughput.axleUnits, reported: summary.axleCapacityUnits },
    ]) {
      const { name, counts, weight, figures, reported } = line;
      assert.equal(figures.observedCompletions, counts(market), `${label} ${name}の市場量での完了数`);
      assert.equal(figures.capacityTestCompletions, counts(capacity), `${label} ${name}の能力試験での完了数`);
      const tested = Math.min(figures.plannedAnnual * row.bottlenecks.testedMarketMultiple, counts(capacity) * weight);
      const annualCapacity = Number(tested.toFixed(3));
      assert.equal(figures.testedAnnualCapacity, annualCapacity, `${label} ${name}の年換算能力`);
      assert.equal(reported, annualCapacity, `${label} ${name}の年別一覧の能力`);
    }

    console.log(`${label} 市場量・能力試験の完了数と年換算能力が一致（電池 ${summary.batteryCapacityTonnes}トン/年、e-Axle ${summary.axleCapacityUnits}台/年）`);
  }
}
