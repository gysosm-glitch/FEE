import { start, load, save } from "./db.js";

const OUT_CATS = ["식비", "카페·간식", "교통", "쇼핑", "문화·여가", "통신·구독", "생활", "기타"];
const IN_CATS = ["아르바이트", "용돈", "기타 수입"];
const TODAY = FEE.fmt(new Date());
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

let entries = [];
let budgets = {};
let view = TODAY.slice(0, 7);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const won = FEE.won;
const md = (d) => { const x = FEE.parse(d); return `${x.getMonth() + 1}.${FEE.pad(x.getDate())}(${DOW[x.getDay()]})`; };

function render() {
  const [y, m] = view.split("-").map(Number);
  $("month").textContent = `${y}년 ${m}월`;
  const list = FEE.inMonth(entries, view);
  const s = FEE.summary(list);
  const budget = budgets[view] || 0;
  const left = budget - s.out;

  $("acct").textContent = `생활비 계좌 ${y}-${FEE.pad(m)}`;
  $("balance").textContent = budget ? won(left) : "예산 미설정";
  $("balance").classList.toggle("neg", left < 0);
  $("meter").style.width = budget ? `${Math.min(100, (s.out / budget) * 100)}%` : "0";
  $("pbSub").textContent = budget ? `예산 ${won(budget)} 중 ${won(s.out)} 사용 (${Math.round((s.out / budget) * 100)}%)` : "‘예산 설정’을 눌러 이번 달에 쓸 금액을 정하세요.";

  const allow = FEE.allowance(budget, s.out, TODAY, view);
  const spentToday = view === TODAY.slice(0, 7) ? s.byDay[TODAY] || 0 : 0;
  $("allow").textContent = budget ? won(allow) : "-";
  $("allowNote").textContent = budget ? (view === TODAY.slice(0, 7) ? `오늘 ${won(spentToday)} 썼어요` : "이 달의 하루 평균 한도") : "예산을 정하면 계산돼요";

  const wantsPct = s.out ? Math.round((s.wants / s.out) * 100) : 0;
  $("stats").innerHTML = [
    ["이번 달 지출", won(s.out), `${list.filter((e) => e.type === "out").length}건`],
    ["안 써도 됐던 지출", won(s.wants), `지출의 ${wantsPct}%`],
    ["이번 달 수입", won(s.inc), s.inc - s.out >= 0 ? `수입 − 지출 ${won(s.inc - s.out)}` : `수입보다 ${won(s.out - s.inc)} 더 씀`],
  ].map(([l, v, n]) => `<div class="stat"><span class="muted small">${l}</span><b>${v}</b><span class="muted small">${n}</span></div>`).join("");

  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  $("catTotal").textContent = won(s.out);
  $("bars").innerHTML = cats.map(([c, v]) => `<div class="bar"><span>${c}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><span class="num">${won(v)}</span></div>`).join("")
    || `<p class="muted">이 달의 지출 기록이 없어요.</p>`;

  const n = FEE.daysIn(view);
  const perDay = budget / n;
  const peak = Math.max(perDay, ...Object.values(s.byDay), 1);
  let bars = "", days = "";
  for (let d = 1; d <= n; d++) {
    const date = `${view}-${FEE.pad(d)}`, v = s.byDay[date] || 0;
    bars += `<div class="c ${budget && v > perDay ? "over" : ""}" style="height:${(v / peak) * 100}%" title="${md(date)} ${won(v)}"></div>`;
    days += `<span>${d % 5 === 1 || d === n ? d : ""}</span>`;
  }
  $("daily").innerHTML = bars + (budget ? `<div class="limit" style="bottom:${(perDay / peak) * 100}%"></div>` : "");
  $("days").innerHTML = days;

  const rows = FEE.ledger(list, budget).reverse();
  $("ledger").innerHTML = `<tr><th>거래일</th><th>적요</th><th class="num">출금</th><th class="num">입금</th><th class="num">남은 예산</th><th></th></tr>` +
    (rows.map((e) => `<tr><td>${md(e.date)}</td><td>${esc(e.category)}${e.memo ? ` <span class="muted">${esc(e.memo)}</span>` : ""}${e.type === "out" && !e.need ? ' <span class="tag">불필요</span>' : ""}</td>
      <td class="num out">${e.type === "out" ? won(e.amount) : ""}</td><td class="num in">${e.type === "in" ? won(e.amount) : ""}</td>
      <td class="num">${budget ? won(e.bal) : "-"}</td><td><button class="x" data-id="${e.id}" aria-label="삭제">✕</button></td></tr>`).join("")
      || `<tr><td colspan="6" class="muted">아직 거래가 없어요. 위에서 첫 거래를 기록해 보세요.</td></tr>`);
}

function setCats(type) {
  $("cat").innerHTML = (type === "in" ? IN_CATS : OUT_CATS).map((c) => `<option>${c}</option>`).join("");
  $("needRow").hidden = type === "in";
}

$("form").onchange = (e) => { if (e.target.name === "type") setCats(e.target.value); };
$("form").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const amount = Number(f.get("amount"));
  if (!Number.isInteger(amount) || amount <= 0) return alert("금액은 1원 이상의 정수로 입력하세요.");
  const type = f.get("type");
  entries.push({ id: Date.now(), date: f.get("date"), type, amount, category: f.get("category"), memo: f.get("memo").trim(), need: type === "out" ? f.has("need") : true });
  save("fee.entries", entries);
  view = f.get("date").slice(0, 7);
  e.target.amount.value = ""; e.target.memo.value = "";
  render();
};
$("ledger").onclick = (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  if (!confirm("이 거래를 삭제할까요?")) return;
  entries = entries.filter((x) => x.id !== +b.dataset.id); save("fee.entries", entries); render();
};
$("editBudget").onclick = () => {
  const v = prompt(`${view.replace("-", "년 ")}월 예산(원)을 입력하세요`, budgets[view] || "");
  if (v === null) return;
  const n = Number(v.replace(/[,\s원]/g, ""));
  if (!Number.isFinite(n) || n < 0) return alert("숫자로 입력하세요.");
  budgets[view] = Math.round(n); save("fee.budgets", budgets); render();
};
$("prev").onclick = () => { view = FEE.shiftMonth(view, -1); render(); };
$("next").onclick = () => { view = FEE.shiftMonth(view, 1); render(); };
$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ entries, budgets }, null, 2)], { type: "application/json" }));
  a.download = `FEE-backup-${TODAY}.json`; a.click(); URL.revokeObjectURL(a.href);
};
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.entries) || !d.entries.every((x) => x.date && x.type && Number.isFinite(x.amount))) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업의 거래 ${d.entries.length}건으로 지금 기록을 바꿀까요? 현재 기록은 사라져요.`)) return;
    entries = d.entries; budgets = d.budgets || {};
    await Promise.all([save("fee.entries", entries), save("fee.budgets", budgets)]); render();
  } catch (err) { alert("백업 파일을 읽지 못했어요: " + err.message); }
};

$("form").date.value = TODAY;
setCats("out");
start(async (user) => {
  document.body.classList.toggle("locked", !user);
  if (!user) return;
  [entries, budgets] = await Promise.all([load("fee.entries", []), load("fee.budgets", {})]);
  render();
}, $("auth"));
