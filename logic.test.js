// 실행: node logic.test.js
const assert = require("assert");
const F = require("./logic.js");

const E = [
  { id: 1, date: "2026-11-13", type: "out", amount: 5000, category: "식비", need: true },
  { id: 2, date: "2026-11-13", type: "out", amount: 4500, category: "카페·간식", need: false },
  { id: 3, date: "2026-11-14", type: "in", amount: 300000, category: "아르바이트" },
  { id: 4, date: "2026-12-01", type: "out", amount: 1000, category: "교통", need: true },
];
const nov = F.inMonth(E, "2026-11");
const s = F.summary(nov);
assert.deepStrictEqual([s.out, s.inc, s.wants], [9500, 300000, 4500]);
assert.strictEqual(s.byDay["2026-11-13"], 9500);
assert.strictEqual(F.daysIn("2026-11"), 30);
assert.strictEqual(F.shiftMonth("2026-12", 1), "2027-01");
// 11/13 포함 18일 남음: (100000-9500)/18 = 5027
assert.strictEqual(F.allowance(100000, 9500, "2026-11-13", "2026-11"), 5027);
assert.strictEqual(F.allowance(100000, 0, "2026-11-13", "2026-10"), 0);
assert.strictEqual(F.allowance(31000, 0, "2026-11-13", "2026-12"), 1000);
assert.deepStrictEqual(F.ledger(nov, 100000).map((e) => e.bal), [95000, 90500, 90500]);
console.log("ok");
