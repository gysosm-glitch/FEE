import { load, save, downloadBackup, backupReminder } from "./db.js";
import { requireLogin, logout } from "./auth.js";
import { initExcel } from "./excel.js";

await requireLogin("fee", "🏦 FEE 가계부"); // 로그인하기 전에는 아래가 실행되지 않는다

const EMOJI = {
  생활: "🧴", 여가: "🎬", 구독: "📱", 쇼핑: "🛍️", 교통: "🚌", 식비: "🍚", 기타: "📦",
  아르바이트: "💼", 용돈: "🎁", "기타 수입": "💰",
};
const OUT_CATS = ["생활", "여가", "구독", "쇼핑", "교통", "식비", "기타"];
const OLD_CATS = { "카페·간식": "식비", "문화·여가": "여가", "통신·구독": "구독" }; // 예전 분류 → 새 분류
const IN_CATS = ["아르바이트", "용돈", "기타 수입"];
const em = (c) => EMOJI[c] || "📦";
const catLabel = (c) => (c === "식비" || !OUT_CATS.includes(c) ? c : `${c}비`); // 생활비·여가비·구독비…
const short = (n) => (n >= 10000 ? `${+(n / 10000).toFixed(1)}만` : n.toLocaleString("ko-KR"));
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
  $("balance").classList.toggle("unset", !budget);
  $("meter").style.width = budget ? `${Math.min(100, (s.out / budget) * 100)}%` : "0";
  $("pbSub").textContent = budget ? `예산 ${won(budget)} 중 ${won(s.out)} 사용 (${Math.round((s.out / budget) * 100)}%)` : "‘예산 설정’을 눌러 이번 달에 쓸 금액을 정하세요.";

  const allow = FEE.allowance(budget, s.out, TODAY, view);
  const spentToday = view === TODAY.slice(0, 7) ? s.byDay[TODAY] || 0 : 0;
  $("allow").textContent = budget ? won(allow) : "-";
  $("allowNote").textContent = budget ? (view === TODAY.slice(0, 7) ? `오늘 ${won(spentToday)} 썼어요` : "이 달의 하루 평균 한도") : "예산을 정하면 계산돼요";

  // 이번 달 수입·지출 크게
  const prev = FEE.summary(FEE.inMonth(entries, FEE.shiftMonth(view, -1)));

  // ✍️ 기록 화면: 이 달 분야별 지출(생활비·여가비…)
  const cntOf = (c) => list.filter((e) => e.type === "out" && e.category === c).length;
  $("catMonth").textContent = `${m}월`;
  $("catSum").textContent = `총 ${won(s.out)}`;
  $("catGrid").innerHTML = OUT_CATS.map((c) => {
    const v = s.byCat[c] || 0, pv = prev.byCat[c] || 0;
    const vs = v || pv ? ` · 지난달 ${v >= pv ? "▲" : "▼"}${won(Math.abs(v - pv))}` : "";
    return `<button type="button" class="cattile${v ? "" : " zero"}" data-cat="${c}" style="--w:${s.out ? Math.round((v / s.out) * 100) : 0}%">
      <span class="ce">${em(c)}</span><span class="cl">${catLabel(c)}</span><b>${won(v)}</b>
      <small>${cntOf(c)}건${s.out ? ` · ${Math.round((v / s.out) * 100)}%` : ""}${vs}</small></button>`;
  }).join("");

  // 🏠 홈: 인사·남은 날·거래 수
  const now = new Date(), hr = now.getHours();
  const greet = hr < 6 ? "늦은 밤이에요 🌙" : hr < 12 ? "좋은 아침이에요 ☀️" : hr < 18 ? "좋은 오후예요 🌤️" : "오늘 하루 수고했어요 🌙";
  const isCur = view === TODAY.slice(0, 7), daysLeft = isCur ? FEE.daysIn(view) - now.getDate() + 1 : 0;
  $("hello").innerHTML = `<div class="hi"><b>${greet}</b><span>${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일</span></div>
    <div class="hstat"><span>📅 이번 달 남은 날</span><b>${isCur ? `${daysLeft}일` : "-"}</b></div>
    <div class="hstat"><span>🧾 ${m}월 거래</span><b>${list.length}건</b></div>
    <div class="hstat"><span>✂️ 줄일 수 있는 돈</span><b>${won(s.wants)}</b></div>`;
  // 🏠 홈: 가장 많이 쓴 곳 + 한 줄 팁
  const top = Object.entries(s.byCat).sort((a, b) => b[1] - a[1])[0];
  const topWant = FEE.wantsByCat(list)[0];
  $("insight").innerHTML = `<h2>🏆 ${m}월 한눈에</h2>` + (top
    ? `<div class="topcat"><span class="ce">${em(top[0])}</span><div><small>가장 많이 쓴 곳</small><b>${catLabel(top[0])} ${won(top[1])}</b><small>지출의 ${Math.round((top[1] / s.out) * 100)}%</small></div></div>`
    : `<p class="muted">아직 이 달 지출이 없어요. ✍️ 기록에서 첫 거래를 적어 보세요.</p>`) +
    `<p class="tip">💡 ${topWant ? `"꼭 필요하진 않았던" ${catLabel(topWant[0])}가 ${won(topWant[1])}이에요. 이번 주엔 여기서 조금만 줄여 봐요.` : s.out ? "꼭 필요한 데만 쓰고 있어요. 이대로 가요! 👏" : "예산을 먼저 정해 두면 오늘 쓸 수 있는 돈이 계산돼요."}</p>`;
  // 🏠 홈: 최근 거래 5건
  const recent = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 5);
  $("recent").innerHTML = recent.map((e) => `<li><span class="ce">${em(e.category)}</span><div><b>${esc(e.memo || e.category)}</b><small>${md(e.date)} · ${esc(e.category)}</small></div><b class="${e.type}">${e.type === "out" ? "−" : "+"}${won(e.amount)}</b></li>`).join("")
    || `<li class="muted">아직 거래가 없어요.</li>`;
  const diff = (a, b) => (b ? `지난달보다 ${a >= b ? "▲" : "▼"} ${won(Math.abs(a - b))}` : "지난달 기록 없음");
  $("incTotal").textContent = won(s.inc);
  $("incNote").textContent = `${list.filter((e) => e.type === "in").length}건 · ${diff(s.inc, prev.inc)}`;
  $("outTotal").textContent = won(s.out);
  $("outNote").textContent = `${list.filter((e) => e.type === "out").length}건 · ${diff(s.out, prev.out)}`;
  const net = s.inc - s.out;
  $("netTotal").textContent = `${net < 0 ? "−" : ""}${won(Math.abs(net))}`;
  $("netTotal").classList.toggle("neg", net < 0);
  $("netNote").textContent = net >= 0 ? "이번 달 모은 돈 🎉" : "수입보다 더 썼어요";

  // 분야별 지출
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const cnt = (c) => list.filter((e) => e.type === "out" && e.category === c).length;
  $("catTotal").textContent = `총 ${won(s.out)}`;
  $("bars").innerHTML = cats.map(([c, v]) => `<div class="bar"><span class="cn">${em(c)} ${c}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><span class="num">${won(v)} <small>${Math.round((v / s.out) * 100)}% · ${cnt(c)}건</small></span></div>`).join("")
    || `<p class="muted">🫙 이 달의 지출 기록이 없어요.</p>`;

  // 앞으로 줄일 수 있는 돈
  const wants = FEE.wantsByCat(list);
  const proj = FEE.projection(s.out, TODAY, view);
  $("cutNote").textContent = view === TODAY.slice(0, 7) && s.out ? `이 속도면 월말 지출 약 ${won(proj)}${budget ? (proj > budget ? ` (예산보다 ${won(proj - budget)} 초과 ⚠️)` : " (예산 안 👍)") : ""}` : "";
  $("cut").innerHTML = s.wants
    ? `<div class="cut-total"><span>"꼭 필요하진 않았던" 지출</span><b>${won(s.wants)}</b><small>지출의 ${Math.round((s.wants / s.out) * 100)}% · 이만큼 아끼면 1년에 약 ${won(s.wants * 12)}</small></div>
       <ul class="cut-list">${wants.map(([c, v]) => `<li><span>${em(c)} ${c}</span><b>${won(v)}</b></li>`).join("")}</ul>`
    : `<p class="muted">👏 이 달에는 "꼭 필요하지 않았던" 지출이 없어요. 거래를 입력할 때 체크를 끄면 여기에 모여요.</p>`;

  // 꺾은선 그래프: 월별은 2027년 1월부터 그 해 1~12월(아직 안 온 달은 비움), 주별은 최근 8주
  const yms = FEE.yearMonths(view);
  $("monthTitle").textContent = `📈 ${yms[0].slice(0, 4)}년 월별 수입·지출`;
  if (TODAY < FEE.START) {
    $("monthChart").innerHTML = `<div class="placeholder">🗓️ 월별 그래프는 <b>2027년 1월</b>부터 그려져요.<br><span class="muted small">지금(~12/31)은 연습 기간이라 오른쪽 주별 그래프로 확인해 보세요.</span></div>`;
  } else {
    const shown = yms.filter((ym) => ym <= TODAY.slice(0, 7)).map((ym) => FEE.summary(FEE.inMonth(entries, ym)));
    lineChart($("monthChart"), yms.map((ym) => `${+ym.slice(5)}월`), [
      { name: "지출", cls: "out", values: shown.map((x) => x.out) },
      { name: "수입", cls: "in", values: shown.map((x) => x.inc) },
    ]);
  }
  const endDate = view === TODAY.slice(0, 7) ? TODAY : `${view}-${FEE.daysIn(view)}`;
  const weeks = FEE.weekly(entries, endDate, 8, FEE.WEEK_START);
  if (!weeks.length) {
    $("weekChart").innerHTML = `<div class="placeholder">📅 주별 그래프는 <b>12월 첫 주(11/30 월)</b>부터 그려져요.<br><span class="muted small">그 전에 쓴 돈도 기록해 두면 일별 지출과 거래내역에서 볼 수 있어요.</span></div>`;
  } else {
    lineChart($("weekChart"), weeks.map((x) => `${+x.start.slice(5, 7)}/${+x.start.slice(8)}`), [
      { name: "지출", cls: "out", values: weeks.map((x) => x.out) },
    ], budget ? (budget / FEE.daysIn(view)) * 7 : 0, weeks.map((x) => `${md(x.start)} ~ ${md(x.end)}`));
  }

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
    (rows.map((e) => `<tr><td>${md(e.date)}</td><td>${em(e.category)} ${esc(e.category)}${e.memo ? ` <span class="muted">${esc(e.memo)}</span>` : ""}${e.type === "out" && !e.need ? ' <span class="tag">불필요</span>' : ""}</td>
      <td class="num out">${e.type === "out" ? won(e.amount) : ""}</td><td class="num in">${e.type === "in" ? won(e.amount) : ""}</td>
      <td class="num">${budget ? won(e.bal) : "-"}</td><td class="acts"><button class="x ed" data-id="${e.id}" aria-label="수정">✎</button><button class="x" data-id="${e.id}" aria-label="삭제">✕</button></td></tr>`).join("")
      || `<tr><td colspan="6" class="muted">아직 거래가 없어요. 위에서 첫 거래를 기록해 보세요.</td></tr>`);
}

function setCats(type) {
  $("cats").innerHTML = (type === "in" ? IN_CATS : OUT_CATS).map((c, i) =>
    `<label><input type="radio" name="category" value="${c}"${i === 0 ? " checked" : ""} required><span>${em(c)} ${c}</span></label>`).join("");
  $("needRow").hidden = type === "in";
}

// 꺾은선 그래프(SVG). 축은 하나, 선 2px, 점 8px, 마우스를 올리면 해당 시점 값 표시.
// ref: 점선 기준선(예: 주간 예산), tips: 툴팁 제목(없으면 x 라벨)
function lineChart(el, labels, series, ref = 0, tips = labels) {
  const W = Math.max(300, Math.round(el.clientWidth) || 560), H = 220, L = 46, R = 14, T = 14, B = 28; // 화면 폭에 맞춰 글자 크기 유지
  const all = series.flatMap((s) => s.values).concat(ref);
  const step = (() => { const m = Math.max(...all, 1) / 4, p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; })();
  const top = step * 4;
  const x = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.map((s) => s.name).join("·")} 꺾은선 그래프">`;
  for (let g = 0; g <= 4; g++) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g * step)}" y2="${y(g * step)}"/><text class="ax" x="${L - 6}" y="${y(g * step) + 4}" text-anchor="end">${short(g * step)}</text>`;
  const every = Math.ceil((labels.length * 38) / (W - L - R)); // 좁은 화면에서는 라벨을 건너뛰어 겹치지 않게
  labels.forEach((l, i) => { if ((labels.length - 1 - i) % every === 0) svg += `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`; });
  if (ref) svg += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(ref)}" y2="${y(ref)}"/>`;
  svg += `<line class="cross" id="${el.id}-x" y1="${T}" y2="${H - B}" x1="-10" x2="-10"/>`;
  for (const s of series) {
    svg += `<polyline class="ln ${s.cls}" points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>`;
    svg += s.values.map((v, i) => `<circle class="pt ${s.cls}" cx="${x(i)}" cy="${y(v)}" r="4"/>`).join("");
    const li = s.values.length - 1;
    if (s.values[li]) svg += `<text class="dl" x="${li ? x(li) - 6 : x(li) + 8}" y="${Math.max(T + 10, y(s.values[li]) - 9)}" text-anchor="${li ? "end" : "start"}">${short(s.values[li])}</text>`;
  }
  const band = (W - L - R) / Math.max(1, labels.length - 1);
  labels.forEach((_, i) => (svg += `<rect class="hit" data-i="${i}" x="${x(i) - band / 2}" y="${T}" width="${band}" height="${H - T - B}"/>`));
  el.innerHTML = svg + "</svg>";

  const tip = $("tip"), cross = $(`${el.id}-x`);
  el.onmousemove = (e) => {
    const r = e.target.closest(".hit"); if (!r) return;
    const i = +r.dataset.i;
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    tip.innerHTML = `<b>${tips[i]}</b>` + series.map((s) => `<div><i class="ln-s ${s.cls}"></i>${s.name} <b>${s.values[i] == null ? "아직 기록 전" : won(s.values[i])}</b></div>`).join("") + (ref ? `<div class="muted">주간 예산 ${won(ref)}</div>` : "");
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  };
  el.onmouseleave = () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); };
}

$("catGrid").onclick = (e) => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  const f = $("form");
  if (f.type.value !== "out") { f.type.value = "out"; setCats("out"); }
  f.category.value = b.dataset.cat;
  f.amount.focus();
};
$("form").onchange = (e) => { if (e.target.name === "type") setCats(e.target.value); };
$("form").onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const amount = Number(f.get("amount"));
  if (!Number.isInteger(amount) || amount <= 0) return alert("금액은 1원 이상의 정수로 입력하세요.");
  const type = f.get("type");
  const entry = { id: editing ?? Date.now(), date: f.get("date"), type, amount, category: f.get("category"), memo: f.get("memo").trim(), need: type === "out" ? f.has("need") : true };
  if (editing === null) entries.push(entry); else entries = entries.map((x) => (x.id === editing ? entry : x));
  save("fee.entries", entries);
  view = f.get("date").slice(0, 7);
  const wasEdit = editing !== null;
  setEditing(null);
  render();
  go(wasEdit ? "list" : "home");
};

// 수정: 거래를 폼에 불러와 고친 뒤 "수정 저장"
let editing = null; // 수정 중인 거래 id
function setEditing(id) {
  editing = id;
  const f = $("form");
  f.classList.toggle("editing", id !== null);
  $("saveBtn").textContent = id === null ? "거래 기록" : "수정 저장";
  $("cancelEdit").hidden = id === null;
  if (id === null) { f.amount.value = ""; f.memo.value = ""; return; }
  const x = entries.find((e) => e.id === id);
  f.type.value = x.type; setCats(x.type);
  f.date.value = x.date; f.amount.value = x.amount; f.category.value = x.category; f.memo.value = x.memo || ""; f.need.checked = x.need;
  go("add"); f.amount.focus({ preventScroll: true });
}
$("cancelEdit").onclick = () => setEditing(null);
$("ledger").onclick = (e) => {
  const b = e.target.closest(".x"); if (!b) return;
  const id = +b.dataset.id;
  if (b.classList.contains("ed")) return setEditing(id);
  if (!confirm("이 거래를 삭제할까요?")) return;
  entries = entries.filter((x) => x.id !== id); save("fee.entries", entries);
  if (editing === id) setEditing(null);
  render();
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
const exportAll = () => downloadBackup("FEE", { entries, budgets });
$("export").onclick = exportAll;
$("import").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.entries) || !d.entries.every((x) => x.date && x.type && Number.isFinite(x.amount))) throw new Error("형식이 맞지 않아요");
    if (!confirm(`백업의 거래 ${d.entries.length}건으로 지금 기록을 바꿀까요? 현재 기록은 사라져요.`)) return;
    entries = d.entries; budgets = d.budgets || {};
    save("fee.entries", entries); save("fee.budgets", budgets); render();
  } catch (err) { alert("백업 파일을 읽지 못했어요: " + err.message); }
};

$("form").date.value = TODAY;
setCats("out");
entries = load("fee.entries", []);
budgets = load("fee.budgets", {});
if (!load("fee.decReset", false)) {
  if (entries.length || Object.keys(budgets).length) save("fee.beforeDec", { entries, budgets });
  entries = []; budgets = {};
  save("fee.entries", entries); save("fee.budgets", budgets); save("fee.decReset", true);
}
if (entries.some((e) => OLD_CATS[e.category])) {
  entries = entries.map((e) => (OLD_CATS[e.category] ? { ...e, category: OLD_CATS[e.category] } : e));
  save("fee.entries", entries);
}

// 2027년 첫 실행: 2026년 연습 기록을 화면에서 정리한다. 지우기 전에 사본을 따로 보관해 파일로 받을 수 있게 한다.
if (TODAY >= FEE.START) {
  const sp = FEE.splitPractice(entries, budgets);
  if (sp.old.length || Object.keys(sp.oldBudgets).length) {
    const prevArc = load("fee.practice", { entries: [], budgets: {} });
    save("fee.practice", { entries: [...prevArc.entries, ...sp.old], budgets: { ...prevArc.budgets, ...sp.oldBudgets } });
    entries = sp.keep; budgets = sp.keepBudgets;
    save("fee.entries", entries); save("fee.budgets", budgets);
    save("fee.practiceNotice", true);
  }
  if (load("fee.practiceNotice", false)) {
    $("newYear").hidden = false;
    $("newYearCount").textContent = load("fee.practice", { entries: [] }).entries.length;
    $("practiceDl").onclick = () => downloadBackup("FEE-2026-연습기록", load("fee.practice", {}));
    $("newYearClose").onclick = () => { $("newYear").hidden = true; save("fee.practiceNotice", false); };
  }
} else {
  $("trial").hidden = false;
}
render();

/* ---------- 화면 나누기: 홈·기록·분석·내역 (하단 탭 바, 좌우로 밀기, 주소 #home 등) ---------- */
const SCREENS = ["home", "add", "stats", "list"];
let screen = "home";
function go(s, push = true) {
  if (!SCREENS.includes(s)) s = "home";
  const dir = SCREENS.indexOf(s) - SCREENS.indexOf(screen);
  screen = s;
  document.querySelectorAll(".screen").forEach((el) => {
    const on = el.dataset.screen === s;
    el.hidden = !on;
    if (on && dir) { el.classList.remove("in-l", "in-r"); void el.offsetWidth; el.classList.add(dir > 0 ? "in-r" : "in-l"); }
  });
  document.querySelectorAll("#tabbar [data-go]").forEach((b) => b.setAttribute("aria-current", b.dataset.go === s ? "page" : "false"));
  if (location.hash !== `#${s}`) push ? (location.hash = s) : history.replaceState(null, "", `#${s}`);
  if (s === "stats") render(); // 숨겨져 있던 그래프는 보일 때 폭에 맞춰 다시 그린다
  scrollTo(0, 0);
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); }); // 탭 바·"전체 보기" 등
addEventListener("hashchange", () => { const s = location.hash.slice(1); if (s && s !== screen) go(s, false); });
// 폰에서 좌우로 밀면 옆 화면으로(입력칸·그래프 위에서는 무시)
let tx = null, ty = 0;
$("screens").addEventListener("touchstart", (e) => {
  tx = e.target.closest("input, select, textarea, .chart, .scroll") ? null : e.touches[0].clientX; ty = e.touches[0].clientY;
}, { passive: true });
$("screens").addEventListener("touchend", (e) => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(SCREENS[Math.min(SCREENS.length - 1, Math.max(0, SCREENS.indexOf(screen) + (dx < 0 ? 1 : -1)))]);
  tx = null;
}, { passive: true });
go(location.hash.slice(1) || "home", false);

let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 200); });
backupReminder("FEE", entries.length > 0 || Object.keys(budgets).length > 0, exportAll);

// 📗 엑셀 DB: 사람이 보기 좋은 시트들(복원은 _data 시트로)
initExcel({
  prefix: "fee", appName: "FEE가계부", el: $("xl"),
  sheets: () => ({
    거래내역: [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map((e) => ({ 날짜: e.date, 구분: e.type === "out" ? "지출" : "수입", 금액: e.amount, 분류: e.category, 적요: e.memo || "", 꼭필요: e.type === "out" ? (e.need ? "O" : "X") : "" })),
    예산: Object.entries(budgets).sort().map(([ym, v]) => ({ 월: ym, 예산: v })),
  }),
});
$("logout").onclick = () => logout("fee");
