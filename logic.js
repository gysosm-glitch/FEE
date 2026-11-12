// 가계부 계산. 브라우저(window.FEE)와 node 테스트 양쪽에서 쓴다.
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return fmt(d).slice(0, 7); };
  const won = (n) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

  const inMonth = (entries, ym) => entries.filter((e) => e.date.startsWith(ym));

  function summary(list) {
    const s = { out: 0, inc: 0, wants: 0, byCat: {}, byDay: {} };
    for (const e of list) {
      if (e.type === "in") { s.inc += e.amount; continue; }
      s.out += e.amount;
      if (!e.need) s.wants += e.amount;
      s.byCat[e.category] = (s.byCat[e.category] || 0) + e.amount;
      s.byDay[e.date] = (s.byDay[e.date] || 0) + e.amount;
    }
    return s;
  }

  // 남은 예산을 오늘 포함 남은 날수로 나눈 하루 사용 가능액
  function allowance(budget, spent, today, ym) {
    const cur = today.slice(0, 7);
    if (ym < cur) return 0;
    const left = ym > cur ? daysIn(ym) : daysIn(ym) - parse(today).getDate() + 1;
    return Math.max(0, Math.floor((budget - spent) / left));
  }

  // 통장식 내역: 오래된 순으로 남은 예산을 누적 계산(수입은 예산을 늘리지 않음 = 저축)
  function ledger(list, budget) {
    let bal = budget;
    return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map((e) => ({ ...e, bal: e.type === "out" ? (bal -= e.amount) : bal }));
  }

  const api = { pad, parse, fmt, daysIn, shiftMonth, won, inMonth, summary, allowance, ledger };
  if (typeof module !== "undefined") module.exports = api; else root.FEE = api;
})(this);
