import {
  STORES,
  createId,
  deleteOne,
  exportAllData,
  getAll,
  getOne,
  importAllData,
  initializeDatabase,
  putOne,
  recordExpense,
  replaceImportedData,
  replaceWorkbookData,
  resetToDefaults,
  saveMonthlyPlanResponses
} from "./db.js";
import {
  assetAllocation,
  goalProgress,
  investmentValues,
  liabilityValues,
  monthlyIncome,
  monthlyInvestment,
  monthlyInvestmentPlanStatus,
  monthlyRemaining,
  netWorth,
  profitPercentage,
  totalCurrentValue,
  totalExpenses,
  totalInvested,
  totalProfit
} from "./calculations.js";
import { fetchLatestPrices, fetchMutualFundNavs, fetchUsdInrRate, isMutualFundSchemeCode, normalizeMarketSymbol } from "./market-data.js";
import { parseSpreadsheet, spreadsheetTemplate } from "./spreadsheet.js";
import { createExcelWorkbook, parseExcelWorkbook } from "./workbook-file.js";

const main = document.querySelector("#main-content");
const pageTitle = document.querySelector("#page-title");
const dialog = document.querySelector("#app-dialog");
const dialogForm = document.querySelector("#dialog-form");
const dialogTitle = document.querySelector("#dialog-title");
const dialogBody = document.querySelector("#dialog-body");
const dialogSave = document.querySelector("#dialog-save");
const toastElement = document.querySelector("#toast");
const backupInput = document.querySelector("#backup-file-input");
const spreadsheetInput = document.querySelector("#spreadsheet-file-input");
const fullWorkbookInput = document.querySelector("#full-workbook-file-input");
const themeToggleButton = document.querySelector("#theme-toggle-button");
const streakButton = document.querySelector("#monthly-streak-button");
const streakCount = document.querySelector("#monthly-streak-count");

const storeNames = STORES.filter((name) => name !== "settings");
const state = {
  route: "home",
  settings: null,
  filters: {
    investment: "",
    investmentCategory: "",
    expense: "",
    expenseCategory: "",
    expenseMonth: currentMonth(),
    transaction: "",
    transactionType: "",
    planMonth: currentMonth()
  },
  data: Object.fromEntries(storeNames.map((name) => [name, []]))
};

let dialogSubmitHandler = null;
let toastTimer;
let workbookDraft = null;
let activeWorkbookSheet = "accounts";
let activeWorkbookCell = null;
let workbookDirty = false;
let priceRefreshPromise = null;

const PRICE_CACHE_DURATION = 15 * 60 * 1000;
const TWELVE_DATA_REQUEST_INTERVAL = 8000;

const routeTitles = {
  home: "Home",
  investments: "Investments",
  expenses: "Expenses",
  accounts: "Accounts",
  more: "More",
  transactions: "Transactions",
  goals: "Goals",
  plans: "Monthly Plan",
  strategy: "Investment Plan",
  networth: "Net Worth & Liabilities",
  spreadsheet: "Workbook Editor",
  settings: "Settings"
};

const workbookSelects = {
  bank: () => [{ value: "", label: "None" }, ...(workbookDraft?.banks || state.data.banks).map((item) => ({ value: item.id, label: `${item.shortName} · ${item.name}` }))],
  account: () => [{ value: "", label: "None" }, ...(workbookDraft?.accounts || state.data.accounts).map((item) => ({ value: item.id, label: item.name }))],
  accountCategory: () => (workbookDraft?.categories || state.data.categories).filter((item) => item.group === "account").map((item) => ({ value: item.id, label: item.name })),
  investmentCategory: () => (workbookDraft?.categories || state.data.categories).filter((item) => item.group === "investment").map((item) => ({ value: item.id, label: item.name })),
  investmentProduct: () => [{ value: "", label: "Select product" }, ...(workbookDraft?.investmentProducts || state.data.investmentProducts)
    .slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ value: item.name, label: item.ticker ? `${item.name} · ${item.ticker}` : item.name }))],
  investment: () => [{ value: "", label: "None" }, ...(workbookDraft?.investments || state.data.investments)
    .slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ value: item.id, label: item.symbol ? `${item.name} · ${item.symbol}` : item.name }))],
  anyCategory: () => [{ value: "", label: "None" }, ...(workbookDraft?.categories || state.data.categories).map((item) => ({ value: item.id, label: `${item.group} · ${item.name}` }))],
  plan: () => [{ value: "", label: "None" }, ...(workbookDraft?.monthlyPlans || state.data.monthlyPlans).map((item) => ({ value: item.id, label: item.name }))]
};

const WORKBOOK_SHEETS = [
  { id: "accounts", label: "Accounts", icon: "🏦", prefix: "account", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Name", required: true }, { key: "bankId", label: "Bank", options: workbookSelects.bank }, { key: "typeId", label: "Account type", options: workbookSelects.accountCategory, required: true },
    { key: "balance", label: "Balance", type: "number" }, { key: "monthlyAllocation", label: "Monthly allocation", type: "number" },
    { key: "purpose", label: "Purpose" }, { key: "notes", label: "Notes" }, { key: "currency", label: "Currency", values: ["INR", "USD", "EUR", "GBP", "AED", "SGD"], default: "INR" }
  ] },
  { id: "investments", label: "Investments", icon: "📈", prefix: "investment", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Investment name", options: workbookSelects.investmentProduct, required: true }, { key: "categoryId", label: "Category", options: workbookSelects.investmentCategory, required: true }, { key: "accountId", label: "Account", options: workbookSelects.account },
    { key: "symbol", label: "Ticker / AMFI code" }, { key: "quantity", label: "Quantity", type: "number" }, { key: "investedAmount", label: "Invested (native currency)", type: "number" },
    { key: "purchaseDate", label: "Purchase date", type: "date" }, { key: "notes", label: "Notes" }, { key: "currency", label: "Currency", values: ["INR", "USD", "EUR", "GBP", "AED", "SGD"], default: "INR" }
  ] },
  { id: "transactions", label: "Transactions", icon: "↕", prefix: "transaction", columns: [
    { key: "id", label: "ID", required: true }, { key: "type", label: "Type", values: ["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"], required: true }, { key: "date", label: "Date", type: "date", required: true }, { key: "amount", label: "Amount", type: "number", required: true },
    { key: "categoryId", label: "Category", options: workbookSelects.anyCategory }, { key: "investmentId", label: "Portfolio holding", options: workbookSelects.investment }, { key: "accountId", label: "Account", options: workbookSelects.account }, { key: "description", label: "Description" }, { key: "notes", label: "Notes" }, { key: "currency", label: "Currency", values: ["INR", "USD", "EUR", "GBP", "AED", "SGD"], default: "INR" }
  ] },
  { id: "liabilities", label: "Liabilities", icon: "⚖", prefix: "liability", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Name", required: true }, { key: "type", label: "Type", values: ["Personal loan", "Home loan", "Education loan", "Vehicle loan", "Credit card", "Buy now, pay later", "Other"] }, { key: "lender", label: "Lender" },
    { key: "principalAmount", label: "Principal", type: "number", required: true }, { key: "paidAmount", label: "Paid", type: "number" }, { key: "interestMethod", label: "Interest method", values: ["Reducing", "Fixed"], default: "Reducing" }, { key: "interestRate", label: "Rate %", type: "number" }, { key: "durationMonths", label: "Months", type: "number" },
    { key: "monthlyPayment", label: "Monthly payment", type: "number" }, { key: "totalAmount", label: "Total", type: "number" }, { key: "amount", label: "Remaining", type: "number" }, { key: "startDate", label: "Start", type: "date" }, { key: "endDate", label: "End", type: "date" }, { key: "notes", label: "Notes" }, { key: "currency", label: "Currency", values: ["INR", "USD", "EUR", "GBP", "AED", "SGD"], default: "INR" }
  ] },
  { id: "goals", label: "Goals", icon: "◎", prefix: "goal", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Goal", required: true }, { key: "target", label: "Target", type: "number" }, { key: "current", label: "Current", type: "number" }, { key: "status", label: "Status", values: ["Planned", "Ongoing", "Paused", "Completed"], default: "Planned" }, { key: "targetDate", label: "Target date" }
  ] },
  { id: "monthlyPlans", label: "Plans", icon: "☑", prefix: "plan", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Plan item", required: true }, { key: "categoryId", label: "Category", options: workbookSelects.investmentCategory }, { key: "amount", label: "Monthly amount", type: "number" }, { key: "purpose", label: "Purpose" }
  ] },
  { id: "planCompletions", label: "Plan Checks", icon: "✓", prefix: "completion", columns: [
    { key: "id", label: "ID", required: true }, { key: "planId", label: "Plan", options: workbookSelects.plan, required: true }, { key: "month", label: "Month", type: "month", required: true }, { key: "status", label: "Status", values: ["Added", "Completed", "Partial", "Skipped"], default: "Completed" }, { key: "amount", label: "Partial amount", type: "number" }, { key: "investmentId", label: "Portfolio holding", options: workbookSelects.investment }, { key: "completedAt", label: "Completed at", type: "datetime-local" }
  ] },
  { id: "cards", label: "Cards", icon: "▣", prefix: "card", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Card", required: true }, { key: "icon", label: "Icon" }, { key: "status", label: "Status", values: ["Current", "Future"], default: "Current" }, { key: "bankId", label: "Bank", options: workbookSelects.bank }, { key: "creditLimit", label: "Credit limit", type: "number" }, { key: "purpose", label: "Purpose" }, { key: "notes", label: "Notes" }
  ] },
  { id: "investmentProducts", label: "Products", icon: "◇", prefix: "product", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Product", required: true }, { key: "ticker", label: "Ticker / AMFI code" }, { key: "categoryId", label: "Category", options: workbookSelects.investmentCategory }, { key: "currency", label: "Currency", values: ["INR", "USD"], default: "INR" }, { key: "monthlyAmount", label: "Monthly amount", type: "number" }, { key: "charges", label: "Charges %", type: "number" }, { key: "status", label: "Status", values: ["Planned", "Active", "Paused", "Completed"], default: "Planned" }, { key: "exposure", label: "Exposure" }, { key: "notes", label: "Notes" }
  ] },
  { id: "categories", label: "Categories", icon: "▤", prefix: "category", columns: [
    { key: "id", label: "ID", required: true }, { key: "group", label: "Group", values: ["investment", "expense", "account"], required: true }, { key: "name", label: "Name", required: true }, { key: "icon", label: "Icon" }, { key: "budget", label: "Monthly budget", type: "number" }
  ] },
  { id: "banks", label: "Banks", icon: "🏛", prefix: "bank", columns: [
    { key: "id", label: "ID", required: true }, { key: "name", label: "Bank name", required: true }, { key: "shortName", label: "Logo text", required: true }, { key: "color", label: "Logo color", type: "color", default: "#176b5b" }, { key: "aliases", label: "Aliases", array: true }
  ] },
  { id: "netWorthHistory", label: "Net Worth", icon: "⌁", prefix: "snapshot", columns: [
    { key: "id", label: "ID", required: true }, { key: "date", label: "Date", type: "date", required: true }, { key: "value", label: "Value", type: "number", required: true }
  ] }
];

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  return localDateKey().slice(0, 7);
}

function today() {
  return localDateKey();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value, compact = false, currency = state.settings?.currency || "INR") {
  return new Intl.NumberFormat(state.settings?.locale || "en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(Number(value)) >= 1000000 ? "compact" : "standard"
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function signedMoney(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : "−"}${formatMoney(Math.abs(number))}`;
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(state.settings?.locale || "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function selectOptions(values, selected = "") {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function categoryName(id) {
  return state.data.categories.find((item) => item.id === id)?.name || "Uncategorized";
}

function categoryIcon(id, fallback = "🗂️") {
  const category = state.data.categories.find((item) => item.id === id);
  if (category?.icon) return category.icon;
  const name = category?.name?.toLowerCase() || "";
  if (name.includes("credit") || name.includes("card")) return "💳";
  if (name.includes("broker") || name.includes("stock")) return "📈";
  if (name.includes("bank") || name.includes("saving")) return "🏦";
  if (name.includes("wallet")) return "👛";
  if (name.includes("cash")) return "💵";
  return fallback;
}

function accountName(id) {
  return state.data.accounts.find((item) => item.id === id)?.name || "No account";
}

function bankById(id) {
  return state.data.banks.find((item) => item.id === id);
}

function bankName(id) {
  return bankById(id)?.name || "";
}

function bankMark(bank, className = "") {
  if (!bank) return `<span class="bank-mark ${className}" aria-hidden="true">BANK</span>`;
  const color = /^#[0-9a-f]{6}$/i.test(bank.color || "") ? bank.color : "#176b5b";
  return `<span class="bank-mark ${className}" style="--bank-color:${color}" aria-hidden="true">${escapeHtml(bank.shortName || bank.name.slice(0, 4).toUpperCase())}</span>`;
}

function bankOptions(selected = "") {
  return `<option value="">Other / not selected</option>${state.data.banks
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((bank) => `<option value="${escapeHtml(bank.id)}" ${bank.id === selected ? "selected" : ""}>${escapeHtml(bank.shortName)} · ${escapeHtml(bank.name)}</option>`)
    .join("")}`;
}

function categoryOptions(group, selected = "") {
  return state.data.categories
    .filter((item) => item.group === group)
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}</option>`)
    .join("");
}

function accountOptions(selected = "") {
  return `<option value="">No account</option>${state.data.accounts
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("")}`;
}

function transactionCategoryOptions(selected = "") {
  return `<option value="">Uncategorized</option>
    <optgroup label="Investment">${categoryOptions("investment", selected)}</optgroup>
    <optgroup label="Expense">${categoryOptions("expense", selected)}</optgroup>`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("show");
  toastTimer = setTimeout(() => toastElement.classList.remove("show"), 2800);
}

function restoreTextInputFocus(id) {
  requestAnimationFrame(() => {
    const input = document.getElementById(id);
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  const hex = state.settings.accent.replace("#", "");
  const rgb = hex.length === 6
    ? [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(", ")
    : "23, 107, 91";
  document.documentElement.style.setProperty("--accent-rgb", rgb);
  document.querySelector('meta[name="theme-color"]').content = state.settings.accent;
  const darkTheme = state.settings.theme === "dark" ||
    (state.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  themeToggleButton.textContent = darkTheme ? "☀️" : "🌙";
  themeToggleButton.setAttribute("aria-label", darkTheme ? "Switch to white theme" : "Switch to dark theme");
}

async function loadState() {
  const [settings, ...collections] = await Promise.all([
    getOne("settings", "app"),
    ...storeNames.map((store) => getAll(store))
  ]);
  state.settings = settings;
  storeNames.forEach((store, index) => {
    state.data[store] = collections[index];
  });
  applyAppearance();
}

function cardVisible(key) {
  return state.settings.dashboardCards[key] !== false;
}

function metric(label, value, className = "") {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong class="${className}">${value}</strong></div>`;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function transactionList(items, limit) {
  const transactions = [...items]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, limit);
  if (!transactions.length) return emptyState("No transactions yet.");

  return `<div class="list">${transactions.map((item) => {
    const outgoing = ["Expense", "Investment", "Withdrawal"].includes(item.type);
    return `<div class="list-item">
      <div class="list-main">
        <strong>${escapeHtml(item.description || item.type)}</strong>
        <small>${escapeHtml(item.type)} · ${formatDate(item.date)} · ${escapeHtml(accountName(item.accountId))}</small>
      </div>
      <strong class="list-value ${outgoing ? "negative" : "positive"}">${outgoing ? "−" : "+"}${formatMoney(item.amount)}</strong>
    </div>`;
  }).join("")}</div>`;
}

function allocationMarkup() {
  const allocation = assetAllocation(state.data.investments, state.data.categories);
  const populated = allocation.filter((item) => item.actual > 0);
  const totalAmount = populated.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const chartDescription = populated.length
    ? `Current allocation: ${populated.map((item) => `${item.name} ${item.actual.toFixed(1)} percent`).join(", ")}`
    : "Current allocation: no holdings entered";
  let start = 0;
  const gradient = populated.length
    ? populated.map((item) => {
      const end = start + item.actual;
      const segment = `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return segment;
    }).join(", ")
    : "var(--border) 0 100%";

  return `<div class="allocation-comparison allocation-current-only"><div class="allocation-panel">
    <h3>Current allocation</h3>
    <p class="allocation-total">Total ${formatMoney(totalAmount)}</p>
    <div class="donut" role="img" aria-label="${escapeHtml(chartDescription)}" data-label="Current" style="background: conic-gradient(${gradient})"></div>
    <div class="allocation-bars">${populated.length ? populated.map((item) => `<div class="allocation-bar-row">
      <div class="allocation-bar-label">
        <span class="swatch" style="background:${escapeHtml(item.color)}"></span>
        <span aria-hidden="true">${escapeHtml(item.icon || "📌")}</span>
        <span>${escapeHtml(item.name)}</span>
        <strong>${formatMoney(item.value)} · ${item.actual.toFixed(1)}%</strong>
      </div>
      <div class="progress allocation-progress" role="progressbar" aria-label="${escapeHtml(`${item.name} current allocation`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.actual.toFixed(1)}">
        <span style="width:${item.actual.toFixed(2)}%;background:${escapeHtml(item.color)}"></span>
      </div>
    </div>`).join("") : emptyState("No current holdings entered.")}</div>
  </div></div>`;
}

function goalsMarkup(limit) {
  const goals = state.data.goals.slice(0, limit);
  if (!goals.length) return emptyState("No goals yet. Add one in the workbook Goals sheet.");
  return `<div class="list">${goals.map((goal) => {
    const progress = goalProgress(goal);
    return `<div class="list-item">
      <div class="list-main">
        <strong>${escapeHtml(goal.name)}</strong>
        <div class="progress"><span style="width:${progress.percentage}%"></span></div>
        <small>${formatMoney(goal.current)} of ${formatMoney(goal.target)} · ${progress.percentage.toFixed(1)}%</small>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderHome() {
  const month = currentMonth();
  const worth = netWorth(state.data.accounts, state.data.investments, state.data.liabilities);
  const invested = totalInvested(state.data.investments);
  const profit = totalProfit(state.data.investments);
  const income = monthlyIncome(state.data.transactions, month);
  const investedThisMonth = monthlyInvestment(state.data.transactions, month);
  const expenses = totalExpenses(state.data.transactions, month);
  const remaining = monthlyRemaining(state.data.transactions, month);
  const liabilitySummaries = state.data.liabilities.map((liability) => liabilityValues(liability));
  const remainingDebt = liabilitySummaries.reduce((sum, liability) => sum + liability.remainingAmount, 0);
  const monthlyDebtPayments = liabilitySummaries.reduce((sum, liability) => sum + liability.monthlyPayment, 0);

  main.className = "dashboard";
  main.innerHTML = `
    ${cardVisible("netWorth") ? `<section class="card hero-card span-5">
      <p class="eyebrow">TOTAL NET WORTH</p>
      <p class="hero-value">${formatMoney(worth, true)}</p>
      <div class="hero-stats">
        <div><span class="muted">Invested</span><strong>${formatMoney(invested, true)}</strong></div>
        <div><span class="muted">Profit / loss</span><strong>${signedMoney(profit)} · ${formatPercent(profitPercentage(state.data.investments))}</strong></div>
      </div>
    </section>` : ""}
    <section class="card span-7">
      <div class="section-header"><div><p class="section-label">THIS MONTH</p><h2>${formatDate(`${month}-01`).replace("1 ", "")}</h2></div></div>
      <div class="metric-grid">
        ${metric("Income", formatMoney(income), "positive")}
        ${metric("Investments", formatMoney(investedThisMonth))}
        ${cardVisible("expenses") ? metric("Expenses", formatMoney(expenses), "negative") : ""}
        ${cardVisible("cash") ? metric("Remaining", formatMoney(remaining), remaining < 0 ? "negative" : "positive") : ""}
      </div>
    </section>
    ${cardVisible("investments") ? `<section class="card span-4">
      <div class="section-header"><h2>Portfolio</h2><button class="text-button" data-route-link="investments">View all</button></div>
      ${metric("Current value", formatMoney(totalCurrentValue(state.data.investments)))}
      <div style="height:.65rem"></div>
      ${metric("Total return", `${signedMoney(profit)} (${formatPercent(profitPercentage(state.data.investments))})`, profit < 0 ? "negative" : "positive")}
    </section>` : ""}
    ${cardVisible("liabilities") ? `<section class="card span-4">
      <div class="section-header"><h2>Liabilities</h2><button class="text-button" data-route-link="networth">View all</button></div>
      ${metric("Remaining debt", formatMoney(remainingDebt), remainingDebt > 0 ? "negative" : "positive")}
      <div style="height:.65rem"></div>
      ${metric("Monthly payments", formatMoney(monthlyDebtPayments))}
    </section>` : ""}
    ${cardVisible("allocation") ? `<section class="card span-8"><div class="section-header"><h2>Portfolio allocation</h2></div>${allocationMarkup()}</section>` : ""}
    ${cardVisible("recentTransactions") ? `<section class="card span-7">
      <div class="section-header"><h2>Recent transactions</h2><button class="text-button" data-route-link="transactions">View all</button></div>
      ${transactionList(state.data.transactions, 6)}
    </section>` : ""}
    ${cardVisible("goals") ? `<section class="card span-5">
      <div class="section-header"><h2>Goals</h2><button class="text-button" data-route-link="goals">View all</button></div>
      ${goalsMarkup(3)}
    </section>` : ""}
  `;
}

function renderInvestments() {
  const query = state.filters.investment.toLowerCase();
  const items = state.data.investments
    .filter((item) => item.name.toLowerCase().includes(query) || categoryName(item.categoryId).toLowerCase().includes(query))
    .filter((item) => !state.filters.investmentCategory || item.categoryId === state.filters.investmentCategory)
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const allocations = assetAllocation(state.data.investments, state.data.categories);

  main.className = "";
  main.innerHTML = `
    <section class="metric-grid">
      ${metric("Invested", formatMoney(totalInvested(state.data.investments)))}
      ${metric("Current value", formatMoney(totalCurrentValue(state.data.investments)))}
      ${metric("Profit / loss", signedMoney(totalProfit(state.data.investments)), totalProfit(state.data.investments) < 0 ? "negative" : "positive")}
      ${metric("Return", formatPercent(profitPercentage(state.data.investments)), totalProfit(state.data.investments) < 0 ? "negative" : "positive")}
    </section>
    <section class="card">
      <div class="section-header"><h2>Current allocation</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Category</th><th>Current amount</th><th>Current allocation</th></tr></thead>
        <tbody>${allocations.map((item) => `<tr>
          <td>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}</td>
          <td>${formatMoney(item.value)}</td>
          <td>${item.actual.toFixed(1)}%</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="section-header"><div><h2>Holdings</h2><p class="muted">Prices update online and remain cached for offline use.</p></div><button class="button secondary" data-action="refresh-prices">Refresh prices</button></div>
      <div class="filter-row">
        <input type="search" id="investment-search" placeholder="Search investments" value="${escapeHtml(state.filters.investment)}">
        <select id="investment-category-filter" aria-label="Investment category filter">
          <option value="">All categories</option>${categoryOptions("investment", state.filters.investmentCategory)}
        </select>
      </div>
      <div class="list">${items.length ? items.map((item) => {
        const values = investmentValues(item);
        const isMutualFund = isMutualFundSchemeCode(item.symbol);
        const priceLabel = item.currentPrice
          ? `${isMutualFund ? "NAV " : ""}${formatMoney(item.currentPrice, false, item.currency || "INR")}${isMutualFund ? "" : " per unit"}`
          : "Price pending";
        return `<div class="list-item">
          <div class="list-main">
            <strong>${escapeHtml(item.name)}${item.import?.managed ? ` <span class="status-badge">Imported</span>` : ""}</strong>
            <small>${escapeHtml(categoryName(item.categoryId))} · ${escapeHtml(accountName(item.accountId))} · ${formatDate(item.purchaseDate)}</small>
            <small>${item.symbol ? `${escapeHtml(normalizeMarketSymbol(item.symbol))} · Invested ${formatMoney(item.investedAmount, false, item.currency || "INR")} · ${priceLabel}${String(item.currency || "INR").toUpperCase() === "USD" && item.exchangeRate ? ` · USD/INR ${Number(item.exchangeRate).toFixed(4)}` : ""}${item.priceAsOf ? ` · NAV date ${escapeHtml(item.priceAsOf)}` : item.priceUpdatedAt ? ` · Updated ${escapeHtml(new Date(item.priceUpdatedAt).toLocaleString(state.settings.locale))}` : ""}` : "No ticker or AMFI code"}</small>
          </div>
          <div class="list-value">
            <strong>${formatMoney(values.currentValue)}</strong>
            <small class="${values.profit < 0 ? "negative" : "positive"}">${signedMoney(values.profit)} · ${formatPercent(values.percentage)}</small>
          </div>
        </div>`;
      }).join("") : emptyState("No investments found.")}</div>
    </section>
  `;
}

function monthlyExpenseBars() {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const month = localDateKey(date).slice(0, 7);
    return { month, value: totalExpenses(state.data.transactions, month) };
  });
  const maximum = Math.max(...months.map((item) => item.value), 1);
  return `<div class="bar-chart">${months.map((item) => `<div class="bar-column">
    <div class="bar" title="${formatMoney(item.value)}" style="height:${Math.max((item.value / maximum) * 130, item.value ? 4 : 0)}px"></div>
    <span>${new Date(`${item.month}-01T00:00:00`).toLocaleString(state.settings.locale, { month: "short" })}</span>
  </div>`).join("")}</div>`;
}

function renderExpenses() {
  const month = state.filters.expenseMonth;
  const query = state.filters.expense.toLowerCase();
  const items = state.data.transactions
    .filter((item) => item.type === "Expense" && item.date.startsWith(month))
    .filter((item) => (item.description || "").toLowerCase().includes(query) || categoryName(item.categoryId).toLowerCase().includes(query))
    .filter((item) => !state.filters.expenseCategory || item.categoryId === state.filters.expenseCategory)
    .sort((a, b) => b.date.localeCompare(a.date));
  const categoryTotals = state.data.categories
    .filter((item) => item.group === "expense")
    .map((category) => ({
      ...category,
      total: items.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + Number(item.amount), 0)
    }))
    .filter((item) => item.total > 0 || Number(item.budget) > 0);
  const monthlyBudget = state.data.categories
    .filter((item) => item.group === "expense")
    .reduce((sum, item) => sum + Number(item.budget || 0), 0);
  const monthlySpent = totalExpenses(state.data.transactions, month);

  main.className = "";
  main.innerHTML = `
    <section class="metric-grid">
      ${metric("Monthly expenses", formatMoney(monthlySpent), "negative")}
      ${metric("Expense plan", formatMoney(monthlyBudget))}
      ${metric("Budget remaining", formatMoney(monthlyBudget - monthlySpent), monthlySpent > monthlyBudget ? "negative" : "positive")}
      ${metric("Transactions", String(items.length))}
    </section>
    <div class="grid two-column">
      <section class="card">
        <div class="section-header"><h2>Expense breakdown</h2></div>
        ${categoryTotals.length ? `<div class="list">${categoryTotals.map((item) => `<div class="list-item">
          <div class="list-main"><strong>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}</strong><small>Plan ${formatMoney(item.budget)}</small></div>
          <strong>${formatMoney(item.total)}</strong>
        </div>`).join("")}<div class="list-item"><strong>Total</strong><div class="list-value"><strong>${formatMoney(monthlySpent)}</strong><small>of ${formatMoney(monthlyBudget)}</small></div></div></div>` : emptyState("No expense plan or expenses in this month.")}
      </section>
      <section class="card">
        <div class="section-header"><h2>Last 6 months</h2></div>
        ${monthlyExpenseBars()}
      </section>
    </div>
    <section class="card">
      <div class="section-header"><h2>Expenses</h2><button class="button primary" data-action="add-expense">＋ Add expense</button></div>
      <div class="filter-row">
        <input type="search" id="expense-search" placeholder="Search expenses" value="${escapeHtml(state.filters.expense)}">
        <select id="expense-category-filter" aria-label="Expense category filter">
          <option value="">All categories</option>${categoryOptions("expense", state.filters.expenseCategory)}
        </select>
        <input type="month" id="expense-month" value="${escapeHtml(month)}" aria-label="Expense month">
      </div>
      <div class="list">${items.length ? items.map((item) => `<div class="list-item">
        <div class="list-main"><strong>${escapeHtml(item.description || categoryName(item.categoryId))}${item.import?.managed ? ` <span class="status-badge">Imported</span>` : ""}</strong><small>${escapeHtml(categoryName(item.categoryId))} · ${escapeHtml(accountName(item.accountId))} · ${formatDate(item.date)}</small></div>
        <strong class="negative">${formatMoney(item.amount)}</strong>
      </div>`).join("") : emptyState("No expenses found.")}</div>
    </section>
  `;
}

function renderAccounts() {
  const totalBalance = state.data.accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const totalMonthly = state.data.accounts.reduce((sum, item) => sum + Number(item.monthlyAllocation || 0), 0);
  const currentCards = state.data.cards.filter((card) => (card.status || "Current") === "Current");
  const totalCreditLimit = currentCards.reduce((sum, card) => sum + Number(card.creditLimit || 0), 0);
  main.className = "";
  main.innerHTML = `
    <section class="metric-grid">
      ${metric("Available cash", formatMoney(totalBalance), totalBalance < 0 ? "negative" : "positive")}
      ${metric("Monthly allocation", formatMoney(totalMonthly))}
      ${metric("Bank accounts", String(state.data.accounts.length))}
      ${metric("Total credit limit", formatMoney(totalCreditLimit))}
    </section>
    <section class="card">
      <div class="section-header"><h2>Bank accounts</h2></div>
      <div class="list">${state.data.accounts.length ? state.data.accounts.map((item) => `<div class="list-item">
        ${item.bankId ? bankMark(bankById(item.bankId)) : `<span class="entity-icon" aria-hidden="true">${escapeHtml(categoryIcon(item.typeId))}</span>`}
        <div class="list-main"><strong>${escapeHtml(item.name)}${item.import?.managed ? ` <span class="status-badge">Imported</span>` : ""}</strong><small>${escapeHtml(bankName(item.bankId) || item.purpose || categoryName(item.typeId))}</small></div>
        <div class="list-value"><strong class="${Number(item.balance) < 0 ? "negative" : ""}">${formatMoney(item.balance)}</strong><small>${formatMoney(item.monthlyAllocation)} / month</small></div>
      </div>`).join("") : emptyState("No bank accounts yet.")}</div>
    </section>
    <section class="card">
      <div class="section-header"><h2>Credit cards</h2></div>
      <div class="list">${currentCards.length ? currentCards.map((card) => `<div class="list-item">
        <span class="entity-icon" aria-hidden="true">${escapeHtml(card.icon || "💳")}</span>
        ${card.bankId ? bankMark(bankById(card.bankId), "bank-mark-small") : ""}
        <div class="list-main"><strong>${escapeHtml(card.name)} <span class="status-badge">${escapeHtml(card.status || "Current")}</span></strong><small>${escapeHtml(bankName(card.bankId) || card.bank || "Bank not selected")}</small></div>
        <div class="list-value"><strong>${formatMoney(card.creditLimit)}</strong><small>Credit limit</small></div>
      </div>`).join("") : emptyState("No current credit cards.")}</div>
    </section>
  `;
}

function renderMore() {
  const links = [
    ["transactions", "💸", "Transactions", "Search all money movements"],
    ["plans", "📅", "Monthly plan", "View monthly items and completion streaks"],
    ["strategy", "📈", "Investment plan", "View products, charges, tickers, and exposure"],
    ["goals", "🎯", "Financial goals", "Monitor progress toward your goals"],
    ["networth", "⚖️", "Net worth & liabilities", "Track debt, interest, payments, and history"],
    ["spreadsheet", "▦", "Workbook editor", "Edit all app data across workbook sheets"],
    ["settings", "⚙", "Settings", "Customize appearance, categories, and data"]
  ];
  main.className = "";
  main.innerHTML = `<section class="card"><div class="list">${links.map(([route, icon, title, description]) => `<button class="list-item text-button" data-route-link="${route}">
    <span class="entity-icon more-menu-icon" aria-hidden="true">${icon}</span>
    <span class="list-main" style="text-align:left"><strong>${title}</strong><small>${description}</small></span>
    <span>›</span>
  </button>`).join("")}</div></section>
  <section class="card"><p class="section-label">PRIVACY</p><h2>Local financial records</h2><p class="muted">Financial records and spreadsheet imports stay in this browser. Nothing is uploaded to a server.</p></section>`;
}

function renderTransactions() {
  const query = state.filters.transaction.toLowerCase();
  const items = state.data.transactions.filter((item) =>
    (item.description || "").toLowerCase().includes(query) ||
    item.type.toLowerCase().includes(query) ||
    categoryName(item.categoryId).toLowerCase().includes(query)
  )
    .filter((item) => !state.filters.transactionType || item.type === state.filters.transactionType)
    .sort((a, b) => b.date.localeCompare(a.date));
  main.className = "";
  main.innerHTML = `<section class="card">
    <div class="section-header"><h2>All transactions</h2></div>
    <div class="filter-row">
      <input type="search" id="transaction-search" placeholder="Search transactions" value="${escapeHtml(state.filters.transaction)}">
      <select id="transaction-type-filter" aria-label="Transaction type filter">
        <option value="">All types</option>${selectOptions(["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"], state.filters.transactionType)}
      </select>
    </div>
    <div class="list">${items.length ? items.map((item) => `<div class="list-item">
      <div class="list-main"><strong>${escapeHtml(item.description || item.type)}${item.import?.managed ? ` <span class="status-badge">Imported</span>` : ""}</strong><small>${escapeHtml(item.type)} · ${formatDate(item.date)} · ${escapeHtml(categoryName(item.categoryId))}</small></div>
      <strong>${formatMoney(item.amount)}</strong>
    </div>`).join("") : emptyState("No transactions found.")}</div>
  </section>`;
}

function renderGoals() {
  const totalTarget = state.data.goals.reduce((sum, goal) => sum + Number(goal.target || 0), 0);
  const totalCurrent = state.data.goals.reduce((sum, goal) => sum + Number(goal.current || 0), 0);
  main.className = "";
  main.innerHTML = `<section class="metric-grid">
    ${metric("Total expectation", formatMoney(totalTarget))}
    ${metric("Present balance", formatMoney(totalCurrent), "positive")}
    ${metric("Remaining", formatMoney(Math.max(totalTarget - totalCurrent, 0)))}
    ${metric("Goals", String(state.data.goals.length))}
  </section>
  <section class="card">
    <div class="section-header"><h2>Financial goals</h2></div>
    <div class="list">${state.data.goals.length ? state.data.goals.map((goal) => {
      const progress = goalProgress(goal);
      return `<div class="list-item">
        <div class="list-main">
          <strong>${escapeHtml(goal.name)} <span class="status-badge">${escapeHtml(goal.status || "Planned")}</span></strong>
          <div class="progress"><span style="width:${progress.percentage}%"></span></div>
          <small>${formatMoney(goal.current)} of ${formatMoney(goal.target)} · ${progress.percentage.toFixed(1)}% · ${formatMoney(progress.remaining)} remaining${goal.targetDate ? ` · by ${escapeHtml(goal.targetDate)}` : ""}</small>
        </div>
      </div>`;
    }).join("") : emptyState("No goals yet.")}</div>
  </section>`;
}

function planResponse(planId, month) {
  return state.data.planCompletions.find((entry) => entry.planId === planId && entry.month === month);
}

function monthlyCategoryStatus(categoryId, month) {
  return monthlyInvestmentPlanStatus(state.data.monthlyPlans, state.data.transactions, state.data.categories, month)
    .items.find((item) => String(item.categoryId || "") === String(categoryId || ""));
}

function categoryMonthlyCompleted(categoryId, month) {
  const status = monthlyCategoryStatus(categoryId, month);
  if (status?.planned > 0 && status.pending <= 0) return true;
  return ["Added", "Completed"].includes(monthlyCategoryResponse(categoryId, month));
}

function allCategoriesResolved(month) {
  const categoryIds = [...new Set(state.data.monthlyPlans.filter((plan) => Number(plan.amount || 0) > 0).map((plan) => String(plan.categoryId || "")))];
  return categoryIds.length > 0 && categoryIds.every((categoryId) => categoryMonthlyCompleted(categoryId, month) || monthlyCategoryResponse(categoryId, month) === "Skipped");
}

function monthlyCategoryResponse(categoryId, month) {
  const plans = state.data.monthlyPlans.filter((plan) => String(plan.categoryId || "") === String(categoryId || "") && Number(plan.amount || 0) > 0);
  if (!plans.length) return "";
  const responses = plans.map((plan) => planResponse(plan.id, month));
  if (responses.some((response) => !response)) return "";
  if (responses.every((response) => response.status === "Added")) return "Added";
  if (responses.every((response) => !response.status || response.status === "Completed")) return "Completed";
  if (responses.every((response) => response.status === "Skipped")) return "Skipped";
  if (responses.every((response) => response.status === "Partial")) return "Partial";
  return "";
}

function monthlyCategoryResponseAmount(categoryId, month) {
  return state.data.monthlyPlans
    .filter((item) => String(item.categoryId || "") === String(categoryId || "") && Number(item.amount || 0) > 0)
    .reduce((amount, plan) => Math.max(amount, Number(planResponse(plan.id, month)?.amount || 0)), 0);
}

function monthlyCategoryResponseInvestment(categoryId, month) {
  const investmentId = state.data.monthlyPlans
    .filter((item) => String(item.categoryId || "") === String(categoryId || "") && Number(item.amount || 0) > 0)
    .map((plan) => planResponse(plan.id, month)?.investmentId)
    .find(Boolean);
  return state.data.investments.find((investment) => investment.id === investmentId);
}

function monthlyPendingItems(month) {
  return monthlyInvestmentPlanStatus(state.data.monthlyPlans, state.data.transactions, state.data.categories, month)
    .items.filter((item) => item.planned > 0 && item.pending > 0 && !["Added", "Completed", "Skipped"].includes(monthlyCategoryResponse(item.categoryId, month)));
}

function offsetMonth(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function categoryCompletionStreak(categoryId, endingMonth = currentMonth()) {
  const plans = state.data.monthlyPlans.filter((plan) => String(plan.categoryId || "") === String(categoryId || "") && Number(plan.amount || 0) > 0);
  let streak = 0;
  let month = endingMonth;
  while (plans.length && categoryMonthlyCompleted(categoryId, month)) {
    streak += 1;
    month = offsetMonth(month, -1);
  }
  return streak;
}

function monthlyCompletionStreak(endingMonth = currentMonth()) {
  const categoryIds = [...new Set(state.data.monthlyPlans.filter((plan) => Number(plan.amount || 0) > 0).map((plan) => String(plan.categoryId || "")))];
  let streak = 0;
  let month = endingMonth;
  while (categoryIds.length && categoryIds.every((categoryId) => categoryMonthlyCompleted(categoryId, month))) {
    streak += 1;
    month = offsetMonth(month, -1);
  }
  return streak;
}

function renderPlans() {
  const month = state.filters.planMonth || currentMonth();
  const status = monthlyInvestmentPlanStatus(state.data.monthlyPlans, state.data.transactions, state.data.categories, month);
  const items = status.items.filter((item) => item.planned > 0);
  const pendingItems = items.filter((item) => item.pending > 0 && !["Added", "Completed", "Skipped"].includes(monthlyCategoryResponse(item.categoryId, month)));
  const answered = allCategoriesResolved(month);
  const streak = answered ? monthlyCompletionStreak(month) : 0;
  main.className = "";
  main.innerHTML = `<section class="card">
    <div class="section-header"><div><p class="section-label">MONTHLY INVESTMENT CHECKLIST</p><h2>${formatDate(`${month}-01`).replace("1 ", "")}</h2></div><input class="month-picker" type="month" id="plan-month" value="${escapeHtml(month)}" aria-label="Plan month"></div>
    <div class="progress"><span style="width:${status.percentage}%"></span></div>
    <div class="metric-grid">
      ${metric("Planned", formatMoney(status.target))}
      ${metric("Actual", formatMoney(status.actual), "positive")}
      ${metric("Pending", formatMoney(pendingItems.reduce((sum, item) => sum + item.pending, 0)), pendingItems.length ? "negative" : "positive")}
      ${metric("Progress", `${status.percentage.toFixed(1)}%`)}
    </div>
    <div class="monthly-plan-notice ${pendingItems.length ? "pending" : "complete"}">${pendingItems.length
      ? `<strong>${pendingItems.length} ${pendingItems.length === 1 ? "category needs" : "categories need"} your response.</strong><span>Add investment records the missing amount. The other responses update this checklist only.</span>`
      : `<strong>${streak ? `${streak} month completion streak.` : "No pending responses for this month."}</strong>`}</div>
  </section>
  <section class="card">
    <div class="section-header"><h2>Categories</h2></div>
    <div class="monthly-plan-list">${items.length ? items.map((item) => {
      const response = monthlyCategoryResponse(item.categoryId, month);
      const automaticallyDone = item.pending <= 0 && !response;
      const categoryStreak = answered && item.pending <= 0 ? categoryCompletionStreak(item.categoryId, month) : 0;
      const responseInvestment = monthlyCategoryResponseInvestment(item.categoryId, month);
      const statusText = automaticallyDone ? "Already recorded" : response === "Added" ? `Added to ${responseInvestment?.name || "portfolio"}` : response === "Completed" ? "Already done" : response === "Partial" ? `${formatMoney(monthlyCategoryResponseAmount(item.categoryId, month))} reported · ${formatMoney(item.pending)} pending` : response === "Skipped" ? "Not needed this month" : `${formatMoney(item.pending)} pending`;
      return `<div class="monthly-plan-item ${item.pending <= 0 ? "completed-item" : ""}">
        <div class="list-main"><strong>${escapeHtml(item.icon)} ${escapeHtml(item.name)}</strong><small>Planned ${formatMoney(item.planned)} · Actual ${formatMoney(item.actual)}</small><small>${statusText}${categoryStreak ? ` · ${categoryStreak} month streak` : ""}</small></div>
        ${automaticallyDone ? `<div class="list-value"><strong class="positive">Complete</strong></div>` : `<div class="monthly-choice-controls" role="group" aria-label="${escapeHtml(`${item.name} monthly status`)}">
          <button class="monthly-choice-button ${response === "Added" ? "selected added" : ""}" data-monthly-response="Added" data-category-id="${escapeHtml(item.categoryId)}" data-month="${escapeHtml(month)}">Add investment</button>
          <button class="monthly-choice-button ${response === "Completed" ? "selected complete" : ""}" data-monthly-response="Completed" data-category-id="${escapeHtml(item.categoryId)}" data-month="${escapeHtml(month)}">Already done</button>
          <button class="monthly-choice-button ${response === "Partial" ? "selected partial" : ""}" data-monthly-response="Partial" data-category-id="${escapeHtml(item.categoryId)}" data-month="${escapeHtml(month)}">Partial amount</button>
          <button class="monthly-choice-button ${response === "Skipped" ? "selected skipped" : ""}" data-monthly-response="Skipped" data-category-id="${escapeHtml(item.categoryId)}" data-month="${escapeHtml(month)}">Not needed this month</button>
        </div>`}
      </div>`;
    }).join("") : emptyState("No monthly plan categories yet.")}</div>
  </section>`;
}

function renderStrategy() {
  const monthlyTotal = state.data.investmentProducts.reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  const activeTotal = state.data.investmentProducts.filter((item) => item.status === "Active").reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  main.className = "";
  main.innerHTML = `<section class="metric-grid">
    ${metric("Planned monthly", formatMoney(monthlyTotal))}
    ${metric("Active monthly", formatMoney(activeTotal), "positive")}
    ${metric("Products", String(state.data.investmentProducts.length))}
  </section>
  <section class="card">
    <div class="section-header"><h2>Products &amp; allocation</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Category</th><th>Monthly</th><th>Charges</th><th>Status</th></tr></thead>
      <tbody>${state.data.investmentProducts.map((item) => `<tr>
        <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.ticker || item.exposure || "")}</small></td>
        <td>${escapeHtml(categoryName(item.categoryId))}</td>
        <td>${formatMoney(item.monthlyAmount)}</td>
        <td>${Number(item.charges || 0).toFixed(2)}%</td>
        <td><span class="status-badge">${escapeHtml(item.status || "Planned")}</span></td>
      </tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

function historyChart() {
  const points = [...state.data.netWorthHistory].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  if (points.length < 2) return emptyState("Snapshots appear here as your net worth changes.");
  const values = points.map((item) => Number(item.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = points.map((item, index) => ({
    x: 20 + (index / (points.length - 1)) * 560,
    y: 140 - ((Number(item.value) - min) / range) * 110
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `20,150 ${line} 580,150`;
  return `<svg class="chart" viewBox="0 0 600 170" role="img" aria-label="Net worth history chart">
    <polygon class="chart-area" points="${area}"></polygon>
    <polyline class="chart-line" points="${line}"></polyline>
    <text x="20" y="165">${escapeHtml(formatDate(points[0].date))}</text>
    <text x="580" y="165" text-anchor="end">${escapeHtml(formatDate(points.at(-1).date))}</text>
  </svg>`;
}

function renderNetWorth() {
  const worth = netWorth(state.data.accounts, state.data.investments, state.data.liabilities);
  const accountValue = state.data.accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const liabilitySummaries = state.data.liabilities.map((item) => ({ item, values: liabilityValues(item) }));
  const totalPayable = liabilitySummaries.reduce((sum, entry) => sum + entry.values.totalAmount, 0);
  const totalPaid = liabilitySummaries.reduce((sum, entry) => sum + entry.values.paidAmount, 0);
  const totalRemaining = liabilitySummaries.reduce((sum, entry) => sum + entry.values.remainingAmount, 0);
  const totalMonthlyPayment = liabilitySummaries.reduce((sum, entry) => sum + entry.values.monthlyPayment, 0);
  const totalInterest = liabilitySummaries.reduce((sum, entry) => sum + entry.values.totalInterest, 0);
  main.className = "";
  main.innerHTML = `<section class="card hero-card">
    <p class="eyebrow">CURRENT NET WORTH</p><p class="hero-value">${formatMoney(worth)}</p>
    <div class="hero-stats"><div><span class="muted">Accounts</span><strong>${formatMoney(accountValue)}</strong></div><div><span class="muted">Investments</span><strong>${formatMoney(totalCurrentValue(state.data.investments))}</strong></div></div>
  </section>
  <section class="card"><div class="section-header"><h2>History</h2></div>${historyChart()}</section>
  <section class="card">
    <div class="section-header"><div><p class="section-label">DEBT TRACKER</p><h2>Liabilities</h2></div></div>
    <div class="metric-grid liability-summary">
      ${metric("Total payable", formatMoney(totalPayable))}
      ${metric("Amount paid", formatMoney(totalPaid), "positive")}
      ${metric("Still to pay", formatMoney(totalRemaining), totalRemaining > 0 ? "negative" : "positive")}
      ${metric("Monthly payments", formatMoney(totalMonthlyPayment))}
      ${metric("Total interest", formatMoney(totalInterest), totalInterest > 0 ? "negative" : "")}
    </div>
    <div class="liability-grid">${liabilitySummaries.length ? liabilitySummaries.map(({ item, values }) => `<article class="liability-card">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(item.name)}${item.import?.managed ? ` <span class="status-badge">Imported</span>` : ""}</h3>
          <p class="muted liability-subtitle">${escapeHtml(item.type || "Other")}${item.lender ? ` · ${escapeHtml(item.lender)}` : ""}</p>
        </div>
      </div>
      <div class="split-row liability-balance"><span>Remaining</span><strong class="${values.remainingAmount > 0 ? "negative" : "positive"}">${formatMoney(values.remainingAmount)}</strong></div>
      <div class="progress" aria-label="${values.percentage.toFixed(1)}% paid"><span style="width:${values.percentage.toFixed(2)}%"></span></div>
      <div class="split-row liability-progress-label"><small>${formatMoney(values.paidAmount)} paid</small><small>${values.percentage.toFixed(1)}%</small><small>${formatMoney(values.totalAmount)} total</small></div>
      <div class="liability-details">
        <div><span>Principal</span><strong>${formatMoney(values.principalAmount)}</strong></div>
        <div><span>Interest method</span><strong>${values.interestMethod === "Fixed" ? "Fixed / flat" : "Reducing balance"}</strong></div>
        <div><span>Annual interest</span><strong>${Number(item.interestRate || 0).toFixed(2)}%</strong></div>
        <div><span>Total interest</span><strong>${formatMoney(values.totalInterest)}</strong></div>
        <div><span>Calculated EMI</span><strong>${formatMoney(values.monthlyPayment)}</strong></div>
        <div><span>Duration</span><strong>${Number(item.durationMonths || 0) ? `${Number(item.durationMonths)} months` : "Not set"}</strong></div>
        <div><span>Payments left</span><strong>${values.paymentsRemaining || "Not set"}</strong></div>
      </div>
      ${item.startDate ? `<p class="muted liability-dates">Started ${formatDate(item.startDate)}${item.endDate ? ` · Due ${formatDate(item.endDate)}` : ""}</p>` : ""}
      ${item.notes ? `<p class="liability-notes">${escapeHtml(item.notes)}</p>` : ""}
    </article>`).join("") : emptyState("No liabilities recorded. Add one in the workbook Liabilities sheet.")}</div>
  </section>`;
}

function categorySettings(group, title) {
  const items = state.data.categories.filter((item) => item.group === group);
  return `<section class="card">
    <div class="section-header"><h2>${escapeHtml(title)}</h2></div>
    ${items.map((item) => `<div class="category-row">
      <span>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}${group === "expense" ? ` · ${formatMoney(item.budget)} plan` : ""}</span>
    </div>`).join("")}
  </section>`;
}

function bankSettings() {
  return `<section class="card">
    <div class="section-header"><div><p class="section-label">BANK DIRECTORY</p><h2>Bank accounts</h2></div></div>
    <p class="muted">These banks appear in account and card dropdowns. Logo marks are stored locally and work offline.</p>
    <div class="bank-directory">${state.data.banks.slice().sort((a, b) => a.name.localeCompare(b.name)).map((bank) => `<div class="bank-directory-item">
      ${bankMark(bank)}
      <span><strong>${escapeHtml(bank.name)}</strong><small>${escapeHtml(bank.shortName)}</small></span>
    </div>`).join("")}</div>
  </section>`;
}

function renderSettings() {
  const dashboardLabels = {
    netWorth: "Net worth",
    investments: "Investments",
    expenses: "Expenses",
    cash: "Cash",
    goals: "Goals",
    allocation: "Allocation",
    liabilities: "Liabilities",
    recentTransactions: "Recent transactions"
  };
  main.className = "";
  main.innerHTML = `
    <div class="settings-grid">
      <section class="card">
        <div class="section-header"><h2>Dashboard cards</h2></div>
        ${Object.entries(dashboardLabels).map(([key, label]) => `<label class="toggle-row"><span>${label}</span><input type="checkbox" data-dashboard-toggle="${key}" ${state.settings.dashboardCards[key] ? "checked" : ""}></label>`).join("")}
      </section>
      <section class="card">
        <div class="section-header"><h2>Appearance &amp; currency</h2></div>
        <div class="form-grid">
          <label class="field-full"><span>Theme</span><select id="theme-setting">
            <option value="system" ${state.settings.theme === "system" ? "selected" : ""}>System</option>
            <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>White</option>
            <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option>
          </select></label>
          <label><span>Accent color</span><input type="color" id="accent-setting" value="${escapeHtml(state.settings.accent)}"></label>
          <label><span>Currency</span><select id="currency-setting">
            ${["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((currency) => `<option value="${currency}" ${currency === state.settings.currency ? "selected" : ""}>${currency}</option>`).join("")}
          </select></label>
        </div>
      </section>
      <section class="card">
        <div class="section-header"><h2>Live investment prices</h2></div>
        <div class="form-grid">
          <label class="field-full"><span>Twelve Data API key</span><input id="market-data-api-key" type="password" value="${escapeHtml(state.settings.marketDataApiKey || "")}" autocomplete="off" placeholder="Enter API key"></label>
          <div class="button-row field-full"><button class="button primary" data-action="save-market-data-key">Save API key</button></div>
        </div>
      </section>
      ${categorySettings("investment", "Investment categories")}
      ${categorySettings("expense", "Expense categories")}
      ${categorySettings("account", "Account types")}
      ${bankSettings()}
      <section class="card">
        <div class="section-header"><h2>Full Excel workbook</h2></div>
        <p class="muted">Export every workbook sheet, edit it in Excel or LibreOffice, keep the Excel XML format when saving, then upload it here to replace the workbook data.</p>
        <div class="button-row">
          <button class="button secondary" data-action="export-full-workbook">Export full workbook</button>
          <button class="button primary" data-action="import-full-workbook">Upload edited workbook</button>
        </div>
      </section>
      <section class="card">
        <div class="section-header"><h2>Spreadsheet update</h2></div>
        <p class="muted">Download the Excel-compatible CSV, fill rows marked Include=Yes, then preview and apply it. Each upload replaces earlier imported rows while keeping entries added in the app.</p>
        <div class="button-row">
          <button class="button secondary" data-action="download-spreadsheet-template">Download template</button>
          <button class="button primary" data-action="import-spreadsheet">Choose CSV</button>
          <button class="button secondary" data-route-link="spreadsheet">Open workbook editor</button>
        </div>
      </section>
      <section class="card">
        <div class="section-header"><h2>Data</h2></div>
        <p class="muted">Encrypted backups protect your financial data with a password that never leaves this device.</p>
        <div class="button-row">
          <button class="button primary" data-action="export-backup">Export encrypted backup</button>
          <button class="button secondary" data-action="import-backup">Import backup</button>
          <button class="button secondary" data-action="export-csv">Export CSV</button>
          <button class="text-button" data-action="export-readable-backup">Export readable JSON</button>
          <button class="button danger-button" data-action="clear-data">Clear all data</button>
        </div>
      </section>
    </div>`;
}

function initializeWorkbookDraft() {
  if (workbookDraft) return;
  workbookDraft = Object.fromEntries(WORKBOOK_SHEETS.map((sheet) => [sheet.id, structuredClone(state.data[sheet.id] || [])]));
  activeWorkbookSheet = WORKBOOK_SHEETS.some((sheet) => sheet.id === activeWorkbookSheet) ? activeWorkbookSheet : "accounts";
  workbookDirty = false;
  activeWorkbookCell = null;
}

function workbookSheet() {
  return WORKBOOK_SHEETS.find((sheet) => sheet.id === activeWorkbookSheet) || WORKBOOK_SHEETS[0];
}

function workbookCellValue(record, column) {
  const value = record[column.key];
  if (column.array) return Array.isArray(value) ? value.join(", ") : value || "";
  if (column.type === "datetime-local" && value) return String(value).slice(0, 16);
  return value ?? column.default ?? "";
}

function workbookColumnOptions(column) {
  if (column.options) return column.options();
  if (column.values) return column.values.map((value) => ({ value, label: value }));
  return null;
}

function workbookCell(record, column, rowIndex, columnIndex) {
  const value = workbookCellValue(record, column);
  const options = workbookColumnOptions(column);
  const common = `data-workbook-cell data-key="${escapeHtml(column.key)}" data-column="${columnIndex}" aria-label="${escapeHtml(column.label)} row ${rowIndex + 1}"`;
  if (options) {
    const hasValue = options.some((option) => option.value === value);
    return `<select ${common}>${!hasValue && value ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(value)} (missing)</option>` : ""}${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  }
  const type = column.type || "text";
  return `<input ${common} type="${type}" value="${escapeHtml(value)}" ${type === "number" ? 'step="any"' : ""} ${column.required ? "required" : ""}>`;
}

function workbookRow(record, rowIndex) {
  const sheet = workbookSheet();
  return `<tr data-workbook-row data-index="${rowIndex}">
    <th class="sheet-row-number" scope="row">${rowIndex + 1}</th>
    ${sheet.columns.map((column, columnIndex) => `<td>${workbookCell(record, column, rowIndex, columnIndex)}</td>`).join("")}
    <td><button class="mini-button danger" data-workbook-delete-row type="button" aria-label="Delete row ${rowIndex + 1}">×</button></td>
  </tr>`;
}

function captureWorkbookSheet() {
  const grid = main.querySelector("#workbook-grid-body");
  if (!grid || !workbookDraft) return;
  const sheet = workbookSheet();
  const previous = workbookDraft[sheet.id];
  workbookDraft[sheet.id] = Array.from(grid.querySelectorAll("[data-workbook-row]")).map((row, rowIndex) => {
    const record = { ...(previous[Number(row.dataset.index)] || {}) };
    for (const column of sheet.columns) {
      const input = row.querySelector(`[data-key="${column.key}"]`);
      let value = input?.value ?? "";
      if (column.type === "number") value = value === "" ? 0 : Number(value);
      if (column.array) value = value.split(",").map((item) => item.trim()).filter(Boolean);
      if (column.type === "datetime-local" && value) value = new Date(value).toISOString();
      record[column.key] = value;
    }
    row.dataset.index = String(rowIndex);
    return record;
  });
}

function blankWorkbookRecord(sheet) {
  return Object.fromEntries(sheet.columns.map((column) => {
    if (column.key === "id") return [column.key, createId(sheet.prefix)];
    if (column.default !== undefined) return [column.key, column.default];
    if (column.type === "number") return [column.key, 0];
    if (column.array) return [column.key, []];
    return [column.key, ""];
  }));
}

function validateWorkbook(recordsByStore = workbookDraft) {
  for (const sheet of WORKBOOK_SHEETS) {
    const ids = new Set();
    for (const [index, record] of recordsByStore[sheet.id].entries()) {
      for (const column of sheet.columns) {
        const value = record[column.key];
        if (column.required && String(value ?? "").trim() === "") throw new Error(`${sheet.label} row ${index + 1}: ${column.label} is required.`);
        if (column.type === "number" && value !== undefined && value !== null && value !== "" && !Number.isFinite(value)) {
          throw new Error(`${sheet.label} row ${index + 1}: ${column.label} must be a number.`);
        }
      }
      if (ids.has(record.id)) throw new Error(`${sheet.label} row ${index + 1}: duplicate ID "${record.id}".`);
      ids.add(record.id);
    }
  }
}

function prepareWorkbookData(recordsByStore) {
  const prepared = Object.fromEntries(WORKBOOK_SHEETS.map((sheet) => [sheet.id, structuredClone(recordsByStore[sheet.id] || [])]));
  const savedInvestments = new Map(state.data.investments.map((item) => [item.id, item]));
  prepared.investments = prepared.investments.map((item) => {
    const normalized = { ...item, symbol: normalizeMarketSymbol(item.symbol) };
    const previous = savedInvestments.get(item.id);
    delete normalized.buyPrice;
    delete normalized.currentValue;
    if (normalizeMarketSymbol(previous?.symbol) !== normalized.symbol) {
      delete normalized.currentPrice;
      delete normalized.priceUpdatedAt;
      delete normalized.priceAsOf;
      delete normalized.priceSource;
    }
    if (String(normalized.currency || "INR").toUpperCase() !== "USD") {
      delete normalized.exchangeRate;
      delete normalized.exchangeRateUpdatedAt;
    }
    return normalized;
  });
  validateWorkbook(prepared);
  return prepared;
}

async function persistWorkbookData(recordsByStore) {
  await replaceWorkbookData(prepareWorkbookData(recordsByStore));
  await loadState();
}

async function saveWorkbook(exitAfterSave = false) {
  captureWorkbookSheet();
  await persistWorkbookData(workbookDraft);
  workbookDirty = false;
  workbookDraft = null;
  if (exitAfterSave) routeTo("home");
  else {
    initializeWorkbookDraft();
    renderSpreadsheet();
    showToast("Workbook saved.");
  }
}

function renderSpreadsheet() {
  initializeWorkbookDraft();
  const sheet = workbookSheet();
  const rows = workbookDraft[sheet.id];
  main.className = "workbook-main";
  main.innerHTML = `<section class="workbook-shell">
    <header class="workbook-header">
      <div><p class="section-label">MY WEALTH WORKBOOK</p><h2>${escapeHtml(sheet.label)}</h2></div>
      <div class="workbook-actions"><span class="status-badge">${workbookDirty ? "Unsaved changes" : "Saved"}</span><button class="button secondary" data-workbook-exit type="button">Exit</button><button class="button secondary" data-workbook-save type="button">Save</button><button class="button primary" data-workbook-save-exit type="button">Save &amp; exit</button></div>
    </header>
    <div class="workbook-toolbar">
      <button class="button secondary" data-workbook-add-row type="button">＋ Add row</button>
      <button class="button secondary" data-workbook-duplicate-row type="button">⧉ Duplicate</button>
      <span class="status-badge" id="workbook-row-count">${rows.length} rows</span>
      <span class="workbook-help">Select a cell to edit, or paste a value directly.</span>
    </div>
    <div class="sheet-formula-bar workbook-formula"><strong id="workbook-cell-address">--</strong><input id="workbook-formula-input" type="text" aria-label="Selected workbook cell value" placeholder="Select a cell"></div>
    <div class="workbook-grid-wrap"><table class="sheet-grid workbook-grid"><thead><tr><th class="sheet-corner">#</th>${sheet.columns.map((column, index) => `<th><span>${excelColumnName(index)}</span>${escapeHtml(column.label)}</th>`).join("")}<th>Delete</th></tr></thead><tbody id="workbook-grid-body">${rows.map(workbookRow).join("")}</tbody></table></div>
    <nav class="workbook-tabs" aria-label="Workbook sheets">${WORKBOOK_SHEETS.map((entry) => `<button type="button" data-workbook-sheet="${entry.id}" class="${entry.id === sheet.id ? "active" : ""}"><span aria-hidden="true">${entry.icon}</span>${escapeHtml(entry.label)}<small>${workbookDraft[entry.id].length}</small></button>`).join("")}</nav>
  </section>`;
}

const renderers = {
  home: renderHome,
  investments: renderInvestments,
  expenses: renderExpenses,
  accounts: renderAccounts,
  more: renderMore,
  transactions: renderTransactions,
  goals: renderGoals,
  plans: renderPlans,
  strategy: renderStrategy,
  networth: renderNetWorth,
  spreadsheet: renderSpreadsheet,
  settings: renderSettings
};

function render() {
  document.body.classList.toggle("workbook-mode", state.route === "spreadsheet");
  pageTitle.textContent = routeTitles[state.route];
  const pendingCount = monthlyPendingItems(currentMonth()).length;
  document.querySelector("#monthly-streak-symbol").textContent = pendingCount ? "◷" : "✓";
  streakCount.textContent = String(pendingCount);
  streakCount.hidden = pendingCount === 0;
  streakButton.classList.toggle("pending", pendingCount > 0);
  streakButton.title = pendingCount ? `${pendingCount} monthly ${pendingCount === 1 ? "category" : "categories"} pending` : "Monthly investments complete";
  streakButton.setAttribute("aria-label", streakButton.title);
  document.querySelectorAll(".nav-item").forEach((item) => {
    const activeRoute = ["transactions", "goals", "plans", "strategy", "networth", "spreadsheet", "settings"].includes(state.route) ? "more" : state.route;
    item.classList.toggle("active", item.dataset.route === activeRoute);
    item.setAttribute("aria-current", item.dataset.route === activeRoute ? "page" : "false");
  });
  renderers[state.route]();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function routeTo(route) {
  if (!renderers[route]) return;
  const homeUrl = `${location.pathname}${location.search}`;
  if (route === "home") {
    const canReturnToHome = state.route !== "home" && history.state?.appRoute === state.route;
    if (canReturnToHome) history.back();
    else history.replaceState({ appRoute: "home" }, "", homeUrl);
    workbookDraft = null;
    workbookDirty = false;
    activeWorkbookCell = null;
    state.route = "home";
    if (state.settings) render();
    return;
  }

  const routeUrl = `${homeUrl}#${route}`;
  if (state.route === "home") history.pushState({ appRoute: route }, "", routeUrl);
  else history.replaceState({ appRoute: route }, "", routeUrl);
  state.route = route;
  if (!state.settings) return;
  render();
  if (route === "investments") refreshInvestmentPrices({ silent: true }).catch(console.error);
}

function handleHistoryNavigation() {
  const requestedRoute = location.hash.slice(1);
  const route = renderers[requestedRoute] ? requestedRoute : "home";
  if (state.route === "spreadsheet" && route !== "spreadsheet" && workbookDirty && !confirm("Exit workbook without saving your changes?")) {
    history.forward();
    return;
  }
  if (route !== "spreadsheet") {
    workbookDraft = null;
    workbookDirty = false;
    activeWorkbookCell = null;
  }
  state.route = route;
  if (state.settings) render();
}

function field(name, label, type = "text", value = "", options = {}) {
  const attributes = [
    options.required ? "required" : "",
    options.min !== undefined ? `min="${options.min}"` : "",
    options.max !== undefined ? `max="${options.max}"` : "",
    options.minlength !== undefined ? `minlength="${options.minlength}"` : "",
    options.maxlength !== undefined ? `maxlength="${options.maxlength}"` : "",
    options.step ? `step="${options.step}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : "",
    options.autocomplete ? `autocomplete="${escapeHtml(options.autocomplete)}"` : ""
  ].filter(Boolean).join(" ");
  return `<label class="${options.full ? "field-full" : ""}"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attributes}></label>`;
}

function selectField(name, label, optionsMarkup, full = false) {
  return `<label class="${full ? "field-full" : ""}"><span>${escapeHtml(label)}</span><select name="${name}">${optionsMarkup}</select></label>`;
}

function categoryChoiceField(name, label, group, selected = "") {
  const categories = state.data.categories.filter((item) => item.group === group);
  const selectedId = selected || categories[0]?.id || "";
  return `<fieldset class="choice-field field-full">
    <legend>${escapeHtml(label)}</legend>
    <div class="choice-list">
      ${categories.map((item) => `<label class="choice-option">
        <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(item.id)}" ${item.id === selectedId ? "checked" : ""} required>
        <span class="choice-icon" aria-hidden="true">${escapeHtml(categoryIcon(item.id))}</span>
        <span class="choice-label">${escapeHtml(item.name)}</span>
        <span class="choice-check" aria-hidden="true">✓</span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function textArea(name, label, value = "") {
  return `<label class="field-full"><span>${escapeHtml(label)}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
}

function openDialog(title, body, submitHandler, saveLabel = "Save") {
  dialog.classList.remove("spreadsheet-dialog");
  dialogTitle.textContent = title;
  dialogBody.innerHTML = `<div class="form-grid">${body}</div>`;
  dialogSave.textContent = saveLabel;
  dialogSubmitHandler = submitHandler;
  dialog.showModal();
  dialogBody.querySelector("input, select, textarea")?.focus();
}

function excelColumnName(index) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function formValue(formData, key) {
  return String(formData.get(key) || "").trim();
}

function openInvestmentForm(item = {}) {
  openDialog(item.id ? "Edit investment" : "Add investment", `
    ${field("name", "Investment name", "text", item.name, { required: true, full: true })}
    ${selectField("categoryId", "Category", categoryOptions("investment", item.categoryId))}
    ${selectField("accountId", "Account", accountOptions(item.accountId))}
    ${field("symbol", "Ticker or AMFI scheme code", "text", item.symbol, { full: true, placeholder: "RELIANCE:NSE or 122639" })}
    ${field("quantity", "Quantity", "number", item.quantity, { min: 0, step: "any" })}
    ${field("investedAmount", "Invested amount in selected currency", "number", item.investedAmount, { min: 0, step: "0.01" })}
    ${field("purchaseDate", "Purchase date", "date", item.purchaseDate || today(), { required: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    const symbol = normalizeMarketSymbol(formValue(formData, "symbol"));
    const raw = {
      ...item,
      id: item.id || createId("investment"),
      name: formValue(formData, "name"),
      categoryId: formValue(formData, "categoryId"),
      accountId: formValue(formData, "accountId"),
      symbol,
      quantity: Number(formValue(formData, "quantity")),
      investedAmount: Number(formValue(formData, "investedAmount")),
      purchaseDate: formValue(formData, "purchaseDate"),
      notes: formValue(formData, "notes")
    };
    delete raw.buyPrice;
    delete raw.currentValue;
    if (normalizeMarketSymbol(item.symbol) !== symbol) {
      delete raw.currentPrice;
      delete raw.priceUpdatedAt;
      delete raw.priceAsOf;
      delete raw.priceSource;
    }
    await putOne("investments", raw);
    await createNetWorthSnapshot();
  });
}

function openTransactionForm(item = {}, forcedType) {
  const type = forcedType || item.type || "Investment";
  const types = ["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"];
  const categoryGroup = type === "Expense" ? "expense" : "investment";
  openDialog(item.id ? `Edit ${type.toLowerCase()}` : `Add ${type.toLowerCase()}`, `
    ${forcedType ? `<input type="hidden" name="type" value="${escapeHtml(forcedType)}">` : selectField("type", "Type", types.map((entry) => `<option value="${entry}" ${entry === type ? "selected" : ""}>${entry}</option>`).join(""))}
    ${field("date", "Date", "date", item.date || today(), { required: true })}
    ${field("amount", "Amount", "number", item.amount, { required: true, min: 0, step: "0.01" })}
    ${selectField("categoryId", "Category", forcedType ? `<option value="">Uncategorized</option>${categoryOptions(categoryGroup, item.categoryId)}` : transactionCategoryOptions(item.categoryId))}
    ${forcedType === "Expense" ? `<label><span>Bank account</span><select name="accountId" required>${accountOptions(item.accountId)}</select></label>` : selectField("accountId", "Account", accountOptions(item.accountId))}
    ${field("description", "Description", "text", item.description, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    const transaction = {
      ...item,
      id: item.id || createId("transaction"),
      type: forcedType || formValue(formData, "type"),
      date: formValue(formData, "date"),
      amount: Number(formValue(formData, "amount")),
      categoryId: formValue(formData, "categoryId"),
      accountId: formValue(formData, "accountId"),
      description: formValue(formData, "description"),
      notes: formValue(formData, "notes")
    };
    if (forcedType === "Expense" && !item.id) {
      await recordExpense(transaction);
      await createNetWorthSnapshot();
      return "Expense added and bank balance updated.";
    }
    await putOne("transactions", transaction);
  });
}

function openAccountForm(item = {}) {
  openDialog(item.id ? "Edit account" : "Add account", `
    ${field("name", "Account name", "text", item.name, { required: true, full: true })}
    ${selectField("bankId", "Bank", bankOptions(item.bankId), true)}
    ${categoryChoiceField("typeId", "Account type", "account", item.typeId)}
    ${field("balance", "Current balance", "number", item.balance, { step: "0.01" })}
    ${field("monthlyAllocation", "Monthly allocation", "number", item.monthlyAllocation, { min: 0, step: "0.01" })}
    ${field("purpose", "Purpose", "text", item.purpose, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("accounts", {
      ...item,
      id: item.id || createId("account"),
      name: formValue(formData, "name"),
      bankId: formValue(formData, "bankId"),
      typeId: formValue(formData, "typeId"),
      balance: Number(formValue(formData, "balance")),
      monthlyAllocation: Number(formValue(formData, "monthlyAllocation")),
      purpose: formValue(formData, "purpose"),
      notes: formValue(formData, "notes")
    });
    await createNetWorthSnapshot();
  });
}

function openGoalForm(item = {}) {
  openDialog(item.id ? "Edit goal" : "Add goal", `
    ${field("name", "Goal", "text", item.name, { required: true, full: true })}
    ${field("target", "Target amount", "number", item.target, { required: true, min: 0, step: "0.01" })}
    ${field("current", "Current amount", "number", item.current, { min: 0, step: "0.01" })}
    ${selectField("status", "Status", selectOptions(["Planned", "Ongoing", "Paused", "Completed"], item.status || "Planned"))}
    ${field("targetDate", "Target date or year", "text", item.targetDate, { full: true, placeholder: "2031 or 2031-12-31" })}
  `, async (formData) => {
    await putOne("goals", {
      ...item,
      id: item.id || createId("goal"),
      name: formValue(formData, "name"),
      target: Number(formValue(formData, "target")),
      current: Number(formValue(formData, "current")),
      status: formValue(formData, "status"),
      targetDate: formValue(formData, "targetDate")
    });
  });
}

function openPlanForm(item = {}) {
  openDialog(item.id ? "Edit plan item" : "Add plan item", `
    ${field("name", "Plan item", "text", item.name, { required: true, full: true })}
    ${selectField("categoryId", "Investment category", categoryOptions("investment", item.categoryId))}
    ${field("amount", "Monthly amount", "number", item.amount, { required: true, min: 0, step: "0.01" })}
    ${field("purpose", "Purpose", "text", item.purpose, { full: true })}
  `, async (formData) => {
    await putOne("monthlyPlans", {
      ...item,
      id: item.id || createId("plan"),
      name: formValue(formData, "name"),
      categoryId: formValue(formData, "categoryId"),
      amount: Number(formValue(formData, "amount")),
      purpose: formValue(formData, "purpose")
    });
  });
}

function openCardForm(item = {}) {
  const icons = [
    ["💳", "General card"],
    ["🛍️", "Shopping"],
    ["💰", "Cashback"],
    ["✈️", "Travel / forex"],
    ["📱", "UPI / mobile"],
    ["⛽", "Fuel"],
    ["🍽️", "Dining"],
    ["🎁", "Rewards"],
    ["🏦", "Bank"]
  ];
  const iconOptions = icons.map(([icon, label]) =>
    `<option value="${icon}" ${item.icon === icon ? "selected" : ""}>${icon} ${label}</option>`
  ).join("");
  openDialog(item.id ? "Edit card" : "Add card", `
    ${field("name", "Card name", "text", item.name, { required: true, full: true })}
    ${selectField("icon", "Card icon", iconOptions)}
    ${selectField("status", "Status", selectOptions(["Current", "Future"], item.status || "Current"))}
    ${selectField("bankId", "Linked bank", bankOptions(item.bankId), true)}
    ${field("creditLimit", "Credit limit", "number", item.creditLimit, { min: 0, step: "0.01" })}
    ${field("purpose", "Purpose and benefits", "text", item.purpose, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("cards", {
      ...item,
      id: item.id || createId("card"),
      name: formValue(formData, "name"),
      icon: formValue(formData, "icon"),
      status: formValue(formData, "status"),
      bankId: formValue(formData, "bankId"),
      creditLimit: Number(formValue(formData, "creditLimit")),
      bank: "",
      purpose: formValue(formData, "purpose"),
      notes: formValue(formData, "notes")
    });
  });
}

function openProductForm(item = {}) {
  openDialog(item.id ? "Edit investment product" : "Add investment product", `
    ${field("name", "Product name", "text", item.name, { required: true, full: true })}
    ${field("ticker", "Ticker", "text", item.ticker)}
    ${selectField("categoryId", "Category", categoryOptions("investment", item.categoryId))}
    ${field("monthlyAmount", "Monthly amount", "number", item.monthlyAmount, { required: true, min: 0, step: "0.01" })}
    ${field("charges", "Charges / expense ratio %", "number", item.charges, { min: 0, step: "0.01" })}
    ${selectField("status", "Status", selectOptions(["Planned", "Active", "Paused", "Completed"], item.status || "Planned"))}
    ${field("exposure", "Exposure", "text", item.exposure, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("investmentProducts", {
      ...item,
      id: item.id || createId("product"),
      name: formValue(formData, "name"),
      ticker: formValue(formData, "ticker"),
      categoryId: formValue(formData, "categoryId"),
      monthlyAmount: Number(formValue(formData, "monthlyAmount")),
      charges: Number(formValue(formData, "charges")),
      status: formValue(formData, "status"),
      exposure: formValue(formData, "exposure"),
      notes: formValue(formData, "notes")
    });
  });
}

function openLiabilityForm(item = {}) {
  const existingValues = liabilityValues(item);
  const types = ["Personal loan", "Home loan", "Education loan", "Vehicle loan", "Credit card", "Buy now, pay later", "Other"];
  openDialog(item.id ? "Edit liability" : "Add liability", `
    ${field("name", "Liability name", "text", item.name, { required: true, full: true })}
    ${selectField("type", "Liability type", selectOptions(types, item.type || "Personal loan"))}
    ${field("lender", "Lender", "text", item.lender)}
    ${field("principalAmount", "Principal / amount borrowed", "number", existingValues.principalAmount || "", { required: true, min: 0.01, step: "0.01" })}
    ${selectField("interestMethod", "Interest calculation method", `
      <option value="Reducing" ${(item.interestMethod || "Reducing") === "Reducing" ? "selected" : ""}>Reducing balance</option>
      <option value="Fixed" ${item.interestMethod === "Fixed" ? "selected" : ""}>Fixed / flat rate</option>
    `)}
    ${field("interestRate", "Annual interest rate %", "number", item.interestRate, { min: 0, max: 100, step: "0.01" })}
    ${field("durationMonths", "Duration in months", "number", item.durationMonths, { required: true, min: 1, step: "1" })}
    ${field("paidAmount", "Total amount paid so far", "number", existingValues.paidAmount || "", { min: 0, step: "0.01" })}
    ${field("startDate", "Start date", "date", item.startDate)}
    ${field("endDate", "Expected end date", "date", item.endDate)}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    const principalAmount = Number(formValue(formData, "principalAmount"));
    const paidAmount = Number(formValue(formData, "paidAmount"));
    const liability = {
      ...item,
      id: item.id || createId("liability"),
      name: formValue(formData, "name"),
      type: formValue(formData, "type"),
      lender: formValue(formData, "lender"),
      principalAmount,
      paidAmount,
      interestMethod: formValue(formData, "interestMethod"),
      interestRate: Number(formValue(formData, "interestRate")),
      startDate: formValue(formData, "startDate"),
      durationMonths: Number(formValue(formData, "durationMonths")),
      endDate: formValue(formData, "endDate"),
      notes: formValue(formData, "notes")
    };
    const values = liabilityValues(liability);
    if (paidAmount > values.totalPayable) throw new Error("Amount paid cannot be greater than the calculated total payable.");

    liability.monthlyPayment = values.monthlyPayment;
    liability.totalAmount = values.totalPayable;
    liability.amount = values.remainingAmount;
    await putOne("liabilities", liability);
    await createNetWorthSnapshot();
  });
}

function openCategoryForm(group, item = {}) {
  const iconExamples = {
    investment: "Examples: ₿  📈  🪙  🏦  💰",
    expense: "Examples: 🏠  🍽️  ✈️  🏍️  🧾",
    account: "Examples: 🏦  📈  👛  💵  🗂️"
  };
  openDialog(item.id ? "Edit category" : "Add category", `
    ${field("name", "Name", "text", item.name, { required: true, full: true })}
    ${field("icon", "Icon or emoji", "text", item.icon, { full: group !== "investment", placeholder: iconExamples[group] })}
    ${group === "expense" ? field("budget", "Monthly expense plan", "number", item.budget, { min: 0, step: "0.01" }) : ""}
  `, async (formData) => {
    const category = {
      ...item,
      id: item.id || createId(`category-${group}`),
      group,
      name: formValue(formData, "name"),
      icon: formValue(formData, "icon"),
      budget: group === "expense" ? Number(formValue(formData, "budget")) : undefined
    };
    delete category.target;
    delete category.color;
    await putOne("categories", category);
  });
}

function openBankForm(item = {}) {
  openDialog(item.id ? "Edit bank" : "Add bank", `
    ${field("name", "Bank name", "text", item.name, { required: true, full: true })}
    ${field("shortName", "Logo text", "text", item.shortName, { required: true, maxlength: 8, placeholder: "SBI" })}
    ${field("color", "Logo color", "color", item.color || "#176b5b")}
  `, async (formData) => {
    const name = formValue(formData, "name");
    const duplicate = state.data.banks.some((bank) => bank.id !== item.id && bank.name.toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("A bank with this name already exists.");
    await putOne("banks", {
      ...item,
      id: item.id || createId("bank"),
      name,
      shortName: formValue(formData, "shortName").toUpperCase(),
      color: formValue(formData, "color"),
      aliases: item.aliases || []
    });
  });
}

const formOpeners = {
  investment: openInvestmentForm,
  expense: (item) => openTransactionForm(item, "Expense"),
  transaction: openTransactionForm,
  account: openAccountForm,
  goal: openGoalForm,
  plan: openPlanForm,
  card: openCardForm,
  product: openProductForm,
  liability: openLiabilityForm
};

const entityStores = {
  investment: "investments",
  expense: "transactions",
  transaction: "transactions",
  account: "accounts",
  goal: "goals",
  plan: "monthlyPlans",
  card: "cards",
  product: "investmentProducts",
  liability: "liabilities"
};

async function createNetWorthSnapshot() {
  await loadState();
  const value = netWorth(state.data.accounts, state.data.investments, state.data.liabilities);
  await putOne("netWorthHistory", { id: today(), date: today(), value });
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveBackupKey(password, salt, iterations, usage) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

async function encryptBackup(backup, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310000;
  const key = await deriveBackupKey(password, salt, iterations, "encrypt");
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    app: "My Wealth",
    format: "encrypted-backup",
    version: 1,
    exportedAt: backup.exportedAt,
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv)
    },
    data: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptBackup(envelope, password) {
  if (envelope?.app !== "My Wealth" || envelope.format !== "encrypted-backup" || envelope.version !== 1) {
    throw new Error("This is not a supported encrypted My Wealth backup.");
  }
  const { encryption } = envelope;
  if (encryption?.algorithm !== "AES-GCM" || encryption.kdf !== "PBKDF2-SHA-256" || encryption.iterations !== 310000) {
    throw new Error("This backup uses unsupported encryption settings.");
  }
  try {
    const salt = base64ToBytes(encryption.salt);
    const iv = base64ToBytes(encryption.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid encryption parameters.");
    const key = await deriveBackupKey(password, salt, encryption.iterations, "decrypt");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.data));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (error) {
    console.error("Backup decryption failed:", error);
    throw new Error("Could not unlock this backup. Check the password and file.");
  }
}

function openBackupExportDialog() {
  openDialog("Export encrypted backup", `
    <p class="field-full muted">Use a unique password with at least 12 characters. It cannot be recovered if forgotten.</p>
    ${field("backupPassword", "Backup password", "password", "", { required: true, full: true, minlength: 12, autocomplete: "new-password" })}
    ${field("backupPasswordConfirm", "Confirm password", "password", "", { required: true, full: true, minlength: 12, autocomplete: "new-password" })}
  `, async (formData) => {
    const password = formValue(formData, "backupPassword");
    if (password.length < 12) {
      throw new Error("Backup password must contain at least 12 non-space characters.");
    }
    if (password !== formValue(formData, "backupPasswordConfirm")) {
      throw new Error("Backup passwords do not match.");
    }
    const backup = await exportAllData();
    const encrypted = await encryptBackup(backup, password);
    downloadFile(`my-wealth-backup-${today()}.wealth`, JSON.stringify(encrypted), "application/json");
    return "Encrypted backup exported.";
  }, "Encrypt & export");
}

function openBackupImportDialog(envelope) {
  openDialog("Unlock encrypted backup", `
    <p class="field-full muted">Enter the password used when this backup was exported.</p>
    ${field("backupPassword", "Backup password", "password", "", { required: true, full: true, autocomplete: "current-password" })}
  `, async (formData) => {
    const backup = await decryptBackup(envelope, formValue(formData, "backupPassword"));
    await importAllData(backup);
    await initializeDatabase();
    return "Encrypted backup restored.";
  }, "Unlock & restore");
}

async function exportLegacyBackup() {
  const backup = await exportAllData();
  downloadFile(`my-wealth-backup-${today()}.json`, JSON.stringify(backup, null, 2), "application/json");
  showToast("Readable backup exported.");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const rows = [["Type", "Date", "Name/Description", "Category", "Account", "Amount", "Notes"]];
  state.data.transactions.forEach((item) => rows.push([
    item.type,
    item.date,
    item.description,
    categoryName(item.categoryId),
    accountName(item.accountId),
    item.amount,
    item.notes
  ]));
  state.data.investments.forEach((item) => rows.push([
    "Holding",
    item.purchaseDate,
    item.name,
    categoryName(item.categoryId),
    accountName(item.accountId),
    investmentValues(item).currentValue,
    item.notes
  ]));
  downloadFile(`my-wealth-export-${today()}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  showToast("CSV exported.");
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await putOne("settings", state.settings);
  applyAppearance();
}

async function refreshInvestmentPrices({ force = false, silent = false } = {}) {
  if (priceRefreshPromise) return priceRefreshPromise;
  const apiKey = state.settings.marketDataApiKey;

  const now = Date.now();
  const candidates = state.data.investments.filter((item) => {
    if (!normalizeMarketSymbol(item.symbol)) return false;
    const priceUpdatedAt = Date.parse(item.priceUpdatedAt || "");
    const exchangeRateUpdatedAt = Date.parse(item.exchangeRateUpdatedAt || "");
    const priceStale = !Number.isFinite(priceUpdatedAt) || now - priceUpdatedAt >= PRICE_CACHE_DURATION;
    const exchangeRateStale = String(item.currency || "INR").toUpperCase() === "USD" &&
      (!Number.isFinite(exchangeRateUpdatedAt) || now - exchangeRateUpdatedAt >= PRICE_CACHE_DURATION);
    return force || priceStale || exchangeRateStale;
  });
  if (!candidates.length) {
    if (!silent) showToast("Investment prices are already current.");
    return;
  }

  const symbols = [...new Set(candidates.map((item) => normalizeMarketSymbol(item.symbol)))];
  const mutualFundCodes = symbols.filter(isMutualFundSchemeCode);
  const marketSymbols = symbols.filter((symbol) => !isMutualFundSchemeCode(symbol));
  const needsUsdInr = candidates.some((item) => !isMutualFundSchemeCode(item.symbol) && String(item.currency || "INR").toUpperCase() === "USD");
  if (!apiKey && marketSymbols.length && !mutualFundCodes.length) {
    if (!silent) throw new Error("Add your Twelve Data API key in Settings first.");
    return;
  }

  priceRefreshPromise = (async () => {
    let updated = 0;
    let failed = 0;
    let usdInrRate = 0;

    const persistSymbol = async (symbol, currentPrice, metadata = {}) => {
      const priceUpdatedAt = new Date().toISOString();
      const matching = state.data.investments.filter((item) => normalizeMarketSymbol(item.symbol) === symbol);
      for (const item of matching) {
        const next = {
          ...item,
          symbol,
          currentPrice,
          priceUpdatedAt,
          priceAsOf: metadata.date || "",
          priceSource: metadata.source || "Twelve Data"
        };
        if (String(item.currency || "INR").toUpperCase() === "USD" && usdInrRate) {
          Object.assign(next, { exchangeRate: usdInrRate, exchangeRateUpdatedAt: priceUpdatedAt });
        }
        delete next.currentValue;
        delete next.buyPrice;
        await putOne("investments", next);
        updated += 1;
      }
      await loadState();
      if (["home", "investments", "networth"].includes(state.route)) render();
    };

    for (const schemeCode of mutualFundCodes) {
      try {
        const nav = (await fetchMutualFundNavs([schemeCode])).get(schemeCode);
        if (!nav) throw new Error(`No NAV returned for ${schemeCode}.`);
        await persistSymbol(schemeCode, nav.price, { date: nav.date, source: "MFAPI / AMFI" });
      } catch (error) {
        console.error(`Could not update mutual fund ${schemeCode}:`, error);
        failed += 1;
      }
    }

    if (needsUsdInr && apiKey) {
      try {
        usdInrRate = await fetchUsdInrRate(apiKey);
        const exchangeRateUpdatedAt = new Date().toISOString();
        for (const item of state.data.investments.filter((entry) => String(entry.currency || "INR").toUpperCase() === "USD")) {
          await putOne("investments", { ...item, exchangeRate: usdInrRate, exchangeRateUpdatedAt });
        }
        await loadState();
        if (["home", "investments", "networth"].includes(state.route)) render();
      } catch (error) {
        console.error("Could not update USD/INR:", error);
        failed += 1;
      }
      if (marketSymbols.length) await new Promise((resolve) => setTimeout(resolve, TWELVE_DATA_REQUEST_INTERVAL));
    }

    for (const [index, symbol] of marketSymbols.entries()) {
      if (!apiKey) break;
      try {
        const currentPrice = (await fetchLatestPrices([symbol], apiKey)).get(symbol);
        if (!currentPrice) throw new Error(`No price returned for ${symbol}.`);
        await persistSymbol(symbol, currentPrice);
      } catch (error) {
        console.error(`Could not update market symbol ${symbol}:`, error);
        failed += 1;
      }
      if (index < marketSymbols.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, TWELVE_DATA_REQUEST_INTERVAL));
      }
    }

    if (!silent) {
      const skipped = marketSymbols.length && !apiKey ? " Add an API key to update stocks and ETFs." : "";
      const failures = failed ? ` ${failed} update${failed === 1 ? "" : "s"} failed.` : "";
      showToast(`${updated} investment market value${updated === 1 ? "" : "s"} updated.${failures}${skipped}`);
    }
  })();

  try {
    await priceRefreshPromise;
  } finally {
    priceRefreshPromise = null;
  }
}

dialogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    dialog.close();
    return;
  }
  if (!dialogForm.reportValidity() || !dialogSubmitHandler) return;

  dialogSave.disabled = true;
  try {
    const successMessage = await dialogSubmitHandler(new FormData(dialogForm));
    dialog.close();
    await loadState();
    render();
    showToast(successMessage || "Saved.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save.");
  } finally {
    dialogSave.disabled = false;
  }
});

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-route]");
  if (button) routeTo(button.dataset.route);
});

document.querySelector("#quick-add-button").addEventListener("click", () => routeTo("spreadsheet"));
streakButton.addEventListener("click", () => {
  state.filters.planMonth = currentMonth();
  routeTo("plans");
});

themeToggleButton.addEventListener("click", async () => {
  const darkTheme = state.settings.theme === "dark" ||
    (state.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  await saveSettings({ theme: darkTheme ? "light" : "dark" });
  if (state.route === "settings") renderSettings();
  showToast(`${darkTheme ? "White" : "Dark"} theme enabled.`);
});

main.addEventListener("click", async (event) => {
  const monthlyResponseButton = event.target.closest("[data-monthly-response]");
  if (monthlyResponseButton) {
    const month = monthlyResponseButton.dataset.month || currentMonth();
    const categoryId = monthlyResponseButton.dataset.categoryId;
    const status = monthlyResponseButton.dataset.monthlyResponse;
    if (status === "Added") {
      const investments = state.data.investments.filter((investment) => String(investment.categoryId || "") === String(categoryId || ""));
      if (!investments.length) {
        showToast("Add a portfolio holding in this category first.");
        return;
      }
      const generatedId = `monthly-plan-${month}-${categoryId || "uncategorized"}`;
      const planned = state.data.monthlyPlans
        .filter((plan) => String(plan.categoryId || "") === String(categoryId || ""))
        .reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
      const actual = state.data.transactions
        .filter((transaction) => transaction.id !== generatedId && transaction.type === "Investment" && String(transaction.date || "").startsWith(month) && String(transaction.categoryId || "") === String(categoryId || ""))
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      const amount = Math.max(planned - actual, 0);
      const previousInvestmentId = monthlyCategoryResponseInvestment(categoryId, month)?.id;
      const options = investments
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((investment, index) => `<option value="${escapeHtml(investment.id)}" ${(previousInvestmentId ? investment.id === previousInvestmentId : index === 0) ? "selected" : ""}>${escapeHtml(investment.symbol ? `${investment.name} · ${investment.symbol}` : investment.name)}</option>`)
        .join("");
      openDialog("Add investment to portfolio", `
        <p class="field-full muted">${formatMoney(amount)} will be added to the selected holding. Quantity is calculated from its current price when available.</p>
        ${selectField("investmentId", "Portfolio holding", options, true)}
      `, async (formData) => {
        const investmentId = formValue(formData, "investmentId");
        const investment = investments.find((item) => item.id === investmentId);
        await saveMonthlyPlanResponses(month, [{ categoryId, status, investmentId }], state.data.monthlyPlans, state.data.transactions, state.settings.currency);
        await createNetWorthSnapshot();
        return `${formatMoney(amount)} added to ${investment?.name || "portfolio"}.`;
      }, "Add to portfolio");
      return;
    }
    if (status === "Partial") {
      const item = monthlyCategoryStatus(categoryId, month);
      const recordedAmount = monthlyCategoryResponseAmount(categoryId, month);
      const maximum = recordedAmount + Number(item?.pending || 0);
      openDialog("Record partial investment", `
        <p class="field-full muted">Enter the amount already invested for ${escapeHtml(item?.name || categoryName(categoryId))}. This records checklist progress only.</p>
        ${field("amount", "Amount already invested", "number", recordedAmount || "", { required: true, min: 0.01, max: maximum, step: "0.01", full: true })}
      `, async (formData) => {
        const amount = Number(formValue(formData, "amount"));
        await saveMonthlyPlanResponses(month, [{ categoryId, status, amount }], state.data.monthlyPlans, state.data.transactions, state.settings.currency);
        await createNetWorthSnapshot();
        return `${formatMoney(amount)} recorded. The remaining amount is still pending.`;
      }, "Record partial amount");
      return;
    }
    try {
      await saveMonthlyPlanResponses(month, [{ categoryId, status }], state.data.monthlyPlans, state.data.transactions, state.settings.currency);
      await createNetWorthSnapshot();
      render();
      showToast(status === "Added" ? "Missing planned amount added to investments." : status === "Completed" ? "Marked done. No investment transaction was added." : "Category marked not needed this month.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Monthly response could not be saved.");
    }
    return;
  }

  const routeLink = event.target.closest("[data-route-link]");
  if (routeLink) return routeTo(routeLink.dataset.routeLink);

  const workbookTab = event.target.closest("[data-workbook-sheet]");
  if (workbookTab) {
    captureWorkbookSheet();
    activeWorkbookSheet = workbookTab.dataset.workbookSheet;
    activeWorkbookCell = null;
    renderSpreadsheet();
    return;
  }

  if (event.target.closest("[data-workbook-add-row]")) {
    captureWorkbookSheet();
    const sheet = workbookSheet();
    workbookDraft[sheet.id].push(blankWorkbookRecord(sheet));
    workbookDirty = true;
    renderSpreadsheet();
    main.querySelector("[data-workbook-row]:last-child [data-workbook-cell]")?.focus();
    return;
  }

  if (event.target.closest("[data-workbook-duplicate-row]")) {
    captureWorkbookSheet();
    const sheet = workbookSheet();
    const selectedRow = activeWorkbookCell?.closest("[data-workbook-row]");
    const source = workbookDraft[sheet.id][Number(selectedRow?.dataset.index ?? 0)];
    if (!source) return showToast("Select a row to duplicate.");
    const duplicate = structuredClone(source);
    duplicate.id = createId(sheet.prefix);
    if (duplicate.name) duplicate.name = `${duplicate.name} copy`;
    workbookDraft[sheet.id].push(duplicate);
    workbookDirty = true;
    renderSpreadsheet();
    return;
  }

  const workbookDelete = event.target.closest("[data-workbook-delete-row]");
  if (workbookDelete) {
    const index = Number(workbookDelete.closest("[data-workbook-row]").dataset.index);
    captureWorkbookSheet();
    workbookDraft[activeWorkbookSheet].splice(index, 1);
    workbookDirty = true;
    activeWorkbookCell = null;
    renderSpreadsheet();
    return;
  }

  if (event.target.closest("[data-workbook-save], [data-workbook-save-exit]")) {
    try {
      await saveWorkbook(Boolean(event.target.closest("[data-workbook-save-exit]")));
      if (state.route === "home") showToast("Workbook saved. View mode restored.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Workbook could not be saved.");
    }
    return;
  }

  if (event.target.closest("[data-workbook-exit]")) {
    if (workbookDirty && !confirm("Exit workbook without saving your changes?")) return;
    workbookDraft = null;
    workbookDirty = false;
    activeWorkbookCell = null;
    routeTo("home");
    return;
  }

  const addButton = event.target.closest("[data-add]");
  if (addButton) return formOpeners[addButton.dataset.add]();

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const type = editButton.dataset.edit;
    const item = state.data[entityStores[type]].find((entry) => entry.id === editButton.dataset.id);
    if (item) formOpeners[type](item);
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    const type = deleteButton.dataset.delete;
    const item = state.data[entityStores[type]].find((entry) => entry.id === deleteButton.dataset.id);
    if (!item || !confirm(`Delete ${item.name || item.description || type}? This cannot be undone.`)) return;
    try {
      if (type === "plan") {
        await Promise.all(
          state.data.planCompletions
            .filter((entry) => entry.planId === item.id)
            .map((entry) => deleteOne("planCompletions", entry.id))
        );
      }
      await deleteOne(entityStores[type], item.id);
      if (["investment", "account", "liability"].includes(type)) await createNetWorthSnapshot();
      await loadState();
      render();
      showToast("Deleted.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not delete.");
    }
    return;
  }

  const addCategory = event.target.closest("[data-add-category]");
  if (addCategory) return openCategoryForm(addCategory.dataset.addCategory);

  if (event.target.closest("[data-add-bank]")) return openBankForm();

  const editBank = event.target.closest("[data-edit-bank]");
  if (editBank) {
    const bank = bankById(editBank.dataset.editBank);
    if (bank) openBankForm(bank);
    return;
  }

  const deleteBank = event.target.closest("[data-delete-bank]");
  if (deleteBank) {
    const bank = bankById(deleteBank.dataset.deleteBank);
    const inUse = state.data.accounts.some((item) => item.bankId === bank?.id) || state.data.cards.some((item) => item.bankId === bank?.id);
    if (inUse) return showToast("This bank is linked to an account or card.");
    if (bank && confirm(`Delete ${bank.name} from the bank list?`)) {
      await deleteOne("banks", bank.id);
      await loadState();
      renderSettings();
      showToast("Bank removed.");
    }
    return;
  }

  const editCategory = event.target.closest("[data-edit-category]");
  if (editCategory) {
    const item = state.data.categories.find((entry) => entry.id === editCategory.dataset.editCategory);
    if (item) openCategoryForm(item.group, item);
    return;
  }

  const deleteCategory = event.target.closest("[data-delete-category]");
  if (deleteCategory) {
    const item = state.data.categories.find((entry) => entry.id === deleteCategory.dataset.deleteCategory);
    const inUse = [
      ...state.data.investments.map((entry) => entry.categoryId),
      ...state.data.transactions.map((entry) => entry.categoryId),
      ...state.data.accounts.map((entry) => entry.typeId),
      ...state.data.monthlyPlans.map((entry) => entry.categoryId),
      ...state.data.investmentProducts.map((entry) => entry.categoryId)
    ].includes(item?.id);
    if (inUse) return showToast("This category is in use. Reassign its items first.");
    if (item && confirm(`Delete the “${item.name}” category?`)) {
      await deleteOne("categories", item.id);
      await loadState();
      render();
      showToast("Category deleted.");
    }
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  try {
    if (action === "add-expense") openTransactionForm({}, "Expense");
    if (action === "download-spreadsheet-template") downloadFile("my-wealth-import-template.csv", `\uFEFF${spreadsheetTemplate()}`, "text/csv;charset=utf-8");
    if (action === "import-spreadsheet") spreadsheetInput.click();
    if (action === "export-full-workbook" && confirm("Export an unencrypted Excel workbook? Anyone with the file can read its financial data.")) {
      downloadFile(`my-wealth-full-workbook-${today()}.xml`, createExcelWorkbook(state.data, WORKBOOK_SHEETS), "application/vnd.ms-excel;charset=utf-8");
    }
    if (action === "import-full-workbook") fullWorkbookInput.click();
    if (action === "export-backup") openBackupExportDialog();
    if (action === "export-readable-backup" && confirm("Export an unencrypted JSON backup? Anyone with the file can read all financial data.")) await exportLegacyBackup();
    if (action === "import-backup") backupInput.click();
    if (action === "export-csv" && confirm("Export an unencrypted CSV? Anyone with the file can read its financial data.")) exportCsv();
    if (action === "save-market-data-key") {
      const apiKey = main.querySelector("#market-data-api-key")?.value.trim() || "";
      await saveSettings({ marketDataApiKey: apiKey });
      showToast(apiKey ? "Market data API key saved on this device." : "Market data API key removed.");
    }
    if (action === "refresh-prices") await refreshInvestmentPrices({ force: true });
    if (action === "snapshot") {
      await createNetWorthSnapshot();
      await loadState();
      render();
      showToast("Net worth snapshot saved.");
    }
    if (action === "clear-data" && confirm("Clear all My Wealth data on this device? Export a backup first. This cannot be undone.")) {
      if (!confirm("Final confirmation: permanently clear all data?")) return;
      await resetToDefaults();
      await loadState();
      render();
      showToast("All data cleared.");
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Action failed.");
  }
});

main.addEventListener("focusin", (event) => {
  const cell = event.target.closest("[data-workbook-cell]");
  if (!cell) return;
  activeWorkbookCell?.classList.remove("sheet-cell-active");
  activeWorkbookCell = cell;
  cell.classList.add("sheet-cell-active");
  const rowIndex = Number(cell.closest("[data-workbook-row]").dataset.index);
  const address = main.querySelector("#workbook-cell-address");
  const formula = main.querySelector("#workbook-formula-input");
  if (address) address.textContent = `${excelColumnName(Number(cell.dataset.column))}${rowIndex + 1}`;
  if (formula) formula.value = cell.value;
});

main.addEventListener("input", async (event) => {
  if (event.target.matches("[data-workbook-cell]")) {
    workbookDirty = true;
    main.querySelector(".workbook-actions .status-badge").textContent = "Unsaved changes";
    if (event.target === activeWorkbookCell) main.querySelector("#workbook-formula-input").value = event.target.value;
    return;
  }
  if (event.target.id === "workbook-formula-input" && activeWorkbookCell) {
    activeWorkbookCell.value = event.target.value;
    activeWorkbookCell.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (event.target.id === "investment-search") {
    state.filters.investment = event.target.value;
    renderInvestments();
    restoreTextInputFocus("investment-search");
  }
  if (event.target.id === "expense-search") {
    state.filters.expense = event.target.value;
    renderExpenses();
    restoreTextInputFocus("expense-search");
  }
  if (event.target.id === "expense-month") {
    state.filters.expenseMonth = event.target.value;
    renderExpenses();
  }
  if (event.target.id === "transaction-search") {
    state.filters.transaction = event.target.value;
    renderTransactions();
    restoreTextInputFocus("transaction-search");
  }
  if (event.target.id === "plan-month") {
    state.filters.planMonth = event.target.value;
    renderPlans();
  }
  if (event.target.matches("[data-dashboard-toggle]")) {
    state.settings.dashboardCards[event.target.dataset.dashboardToggle] = event.target.checked;
    await saveSettings({ dashboardCards: state.settings.dashboardCards });
  }
  if (event.target.id === "accent-setting") {
    await saveSettings({ accent: event.target.value });
  }
});

main.addEventListener("change", async (event) => {
  if (activeWorkbookSheet === "investments" && event.target.matches('[data-workbook-cell][data-key="name"]')) {
    const product = workbookDraft.investmentProducts.find((item) => item.name === event.target.value);
    const row = event.target.closest("[data-workbook-row]");
    if (product && row) {
      const values = {
        categoryId: product.categoryId || "inv-other",
        symbol: normalizeMarketSymbol(product.ticker),
        currency: product.currency || (product.categoryId === "inv-foreign" ? "USD" : "INR")
      };
      for (const [key, value] of Object.entries(values)) {
        const cell = row.querySelector(`[data-workbook-cell][data-key="${key}"]`);
        if (cell) cell.value = value;
      }
      workbookDirty = true;
      main.querySelector(".workbook-actions .status-badge").textContent = "Unsaved changes";
    }
  }
  if (event.target.id === "investment-category-filter") {
    state.filters.investmentCategory = event.target.value;
    renderInvestments();
  }
  if (event.target.id === "expense-category-filter") {
    state.filters.expenseCategory = event.target.value;
    renderExpenses();
  }
  if (event.target.id === "transaction-type-filter") {
    state.filters.transactionType = event.target.value;
    renderTransactions();
  }
  if (event.target.id === "theme-setting") {
    await saveSettings({ theme: event.target.value });
  }
  if (event.target.id === "currency-setting") {
    await saveSettings({ currency: event.target.value });
    render();
  }
});

backupInput.addEventListener("change", async () => {
  const [file] = backupInput.files;
  backupInput.value = "";
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Backup files must be 20 MB or smaller.");
    const backup = JSON.parse(await file.text());
    if (backup?.format === "encrypted-backup") {
      if (!confirm("Unlock and restore this encrypted backup? Current data will be replaced.")) return;
      openBackupImportDialog(backup);
      return;
    }
    if (!confirm(`Restore backup from ${backup.exportedAt ? formatDate(backup.exportedAt.slice(0, 10)) : "this file"}? Current data will be replaced.`)) return;
    await importAllData(backup);
    await initializeDatabase();
    await loadState();
    render();
    showToast("Backup restored.");
  } catch (error) {
    console.error(error);
    showToast(error instanceof SyntaxError ? "Backup is not valid JSON." : error.message);
  }
});

spreadsheetInput.addEventListener("change", async () => {
  const [file] = spreadsheetInput.files;
  spreadsheetInput.value = "";
  if (!file) return;
  try {
    const parsed = await parseSpreadsheet(await file.text(), state.data.categories, file.name, state.data.banks);
    const summary = parsed.summary;
    openDialog("Apply spreadsheet update", `
      <p class="field-full muted">${escapeHtml(file.name)} is valid. Applying it will replace all earlier imported rows and preserve manual entries.</p>
      <div class="metric-grid field-full">
        ${metric("Accounts", String(summary.accounts))}
        ${metric("Investments & PF", String(summary.investments))}
        ${metric("Transactions", String(summary.transactions))}
        ${metric("Liabilities", String(summary.liabilities))}
      </div>
    `, async () => {
      await replaceImportedData(parsed.recordsByStore);
      await createNetWorthSnapshot();
      return `${summary.total} spreadsheet rows imported.`;
    }, "Replace imported data");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not read the spreadsheet.");
  }
});

fullWorkbookInput.addEventListener("change", async () => {
  const [file] = fullWorkbookInput.files;
  fullWorkbookInput.value = "";
  if (!file) return;
  try {
    const recordsByStore = parseExcelWorkbook(await file.text(), WORKBOOK_SHEETS);
    validateWorkbook(recordsByStore);
    const total = WORKBOOK_SHEETS.reduce((sum, sheet) => sum + recordsByStore[sheet.id].length, 0);
    openDialog("Upload full workbook", `
      <p class="field-full muted">${escapeHtml(file.name)} contains ${total} records across ${WORKBOOK_SHEETS.length} sheets. Uploading replaces all workbook data on this device. Settings and the market-data API key remain local.</p>
    `, async () => {
      await persistWorkbookData(recordsByStore);
      return `${total} workbook records uploaded.`;
    }, "Replace workbook data");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not read the Excel workbook.");
  }
});

window.addEventListener("popstate", handleHistoryNavigation);

window.addEventListener("online", () => {
  if (!state.settings) return;
  showToast("Back online. Updating investment values one by one.");
  refreshInvestmentPrices({ force: true }).catch((error) => {
    console.error(error);
    showToast(error.message || "Investment updates could not finish.");
  });
});

window.addEventListener("offline", () => showToast("Offline. Cached investment values remain available."));

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("app-private", document.hidden);
});

async function start() {
  try {
    await initializeDatabase();
    await loadState();
    const initialRoute = location.hash.slice(1);
    state.route = renderers[initialRoute] ? initialRoute : "home";
    const homeUrl = `${location.pathname}${location.search}`;
    if (state.route === "home") {
      history.replaceState({ appRoute: "home" }, "", homeUrl);
    } else if (history.state?.appRoute !== state.route) {
      history.replaceState({ appRoute: "home" }, "", homeUrl);
      history.pushState({ appRoute: state.route }, "", `${homeUrl}#${state.route}`);
    }
    render();
    if (state.route === "investments") refreshInvestmentPrices({ silent: true }).catch(console.error);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("Service worker registration failed:", error);
        showToast("Offline setup failed. Reload while connected.");
      });
    }
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="card"><h2>My Wealth could not start</h2><p class="negative">${escapeHtml(error.message)}</p><p class="muted">Check that IndexedDB is enabled and reload the app.</p></section>`;
  }
}

start();
