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
  resetToDefaults
} from "./db.js";
import {
  assetAllocation,
  goalProgress,
  investmentValues,
  monthlyIncome,
  monthlyInvestment,
  monthlyRemaining,
  netWorth,
  profitPercentage,
  totalCurrentValue,
  totalExpenses,
  totalInvested,
  totalProfit
} from "./calculations.js";

const main = document.querySelector("#main-content");
const pageTitle = document.querySelector("#page-title");
const dialog = document.querySelector("#app-dialog");
const dialogForm = document.querySelector("#dialog-form");
const dialogTitle = document.querySelector("#dialog-title");
const dialogBody = document.querySelector("#dialog-body");
const dialogSave = document.querySelector("#dialog-save");
const toastElement = document.querySelector("#toast");
const backupInput = document.querySelector("#backup-file-input");

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

const routeTitles = {
  home: "Home",
  investments: "Investments",
  expenses: "Expenses",
  accounts: "Accounts",
  more: "More",
  transactions: "Transactions",
  goals: "Goals",
  plans: "Monthly Plan",
  cards: "Cards",
  strategy: "Investment Plan",
  networth: "Net Worth",
  settings: "Settings"
};

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

function formatMoney(value, compact = false) {
  return new Intl.NumberFormat(state.settings?.locale || "en-IN", {
    style: "currency",
    currency: state.settings?.currency || "INR",
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

function accountName(id) {
  return state.data.accounts.find((item) => item.id === id)?.name || "No account";
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
  const populated = allocation.filter((item) => item.value > 0);
  let start = 0;
  const gradient = populated.length
    ? populated.map((item) => {
      const end = start + item.actual;
      const segment = `${item.color || "#77817d"} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return segment;
    }).join(", ")
    : "var(--surface-2) 0 100%";

  return `<div class="allocation-wrap">
    <div class="donut" style="background: conic-gradient(${gradient})"></div>
    <div class="legend">${allocation.map((item) => `<div class="legend-row">
      <span class="swatch" style="background:${escapeHtml(item.color || "#77817d")}"></span>
      <span>${escapeHtml(item.name)}</span>
      <strong>${item.actual.toFixed(1)}%</strong>
    </div>`).join("")}</div>
  </div>`;
}

function goalsMarkup(limit) {
  const goals = state.data.goals.slice(0, limit);
  if (!goals.length) return emptyState("No goals yet. Add one from More → Goals.");
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
    ${cardVisible("allocation") ? `<section class="card span-8"><div class="section-header"><h2>Portfolio allocation</h2></div>${allocationMarkup()}</section>` : ""}
    ${cardVisible("recentTransactions") ? `<section class="card span-7">
      <div class="section-header"><h2>Recent transactions</h2><button class="text-button" data-route-link="transactions">View all</button></div>
      ${transactionList(state.data.transactions, 6)}
    </section>` : ""}
    ${cardVisible("goals") ? `<section class="card span-5">
      <div class="section-header"><h2>Goals</h2><button class="text-button" data-route-link="goals">Manage</button></div>
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
      <div class="section-header"><h2>Target vs actual</h2><button class="text-button" data-route-link="settings">Edit targets</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Category</th><th>Target</th><th>Actual</th><th>Difference</th></tr></thead>
        <tbody>${allocations.map((item) => `<tr>
          <td>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}</td>
          <td>${Number(item.target || 0).toFixed(1)}%</td>
          <td>${item.actual.toFixed(1)}%</td>
          <td class="${item.difference < 0 ? "negative" : "positive"}">${formatPercent(item.difference)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="section-header"><h2>Holdings</h2><button class="button primary" data-add="investment">Add investment</button></div>
      <div class="filter-row">
        <input type="search" id="investment-search" placeholder="Search investments" value="${escapeHtml(state.filters.investment)}">
        <select id="investment-category-filter" aria-label="Investment category filter">
          <option value="">All categories</option>${categoryOptions("investment", state.filters.investmentCategory)}
        </select>
      </div>
      <div class="list">${items.length ? items.map((item) => {
        const values = investmentValues(item);
        return `<div class="list-item">
          <div class="list-main">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(categoryName(item.categoryId))} · ${escapeHtml(accountName(item.accountId))} · ${formatDate(item.purchaseDate)}</small>
          </div>
          <div class="list-value">
            <strong>${formatMoney(values.currentValue)}</strong>
            <small class="${values.profit < 0 ? "negative" : "positive"}">${signedMoney(values.profit)} · ${formatPercent(values.percentage)}</small>
          </div>
          <div class="list-actions">
            <button class="mini-button" data-edit="investment" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">✎</button>
            <button class="mini-button danger" data-delete="investment" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
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
      <div class="section-header"><h2>Expenses</h2><button class="button primary" data-add="expense">Add expense</button></div>
      <div class="filter-row">
        <input type="search" id="expense-search" placeholder="Search expenses" value="${escapeHtml(state.filters.expense)}">
        <select id="expense-category-filter" aria-label="Expense category filter">
          <option value="">All categories</option>${categoryOptions("expense", state.filters.expenseCategory)}
        </select>
        <input type="month" id="expense-month" value="${escapeHtml(month)}" aria-label="Expense month">
      </div>
      <div class="list">${items.length ? items.map((item) => `<div class="list-item">
        <div class="list-main"><strong>${escapeHtml(item.description || categoryName(item.categoryId))}</strong><small>${escapeHtml(categoryName(item.categoryId))} · ${formatDate(item.date)}</small></div>
        <strong class="negative">${formatMoney(item.amount)}</strong>
        <div class="list-actions">
          <button class="mini-button" data-edit="expense" data-id="${item.id}" aria-label="Edit expense">✎</button>
          <button class="mini-button danger" data-delete="transaction" data-id="${item.id}" aria-label="Delete expense">×</button>
        </div>
      </div>`).join("") : emptyState("No expenses found.")}</div>
    </section>
  `;
}

function renderAccounts() {
  const totalBalance = state.data.accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const totalTarget = state.data.accounts.reduce((sum, item) => sum + Number(item.targetBalance || 0), 0);
  const totalMinimum = state.data.accounts.reduce((sum, item) => sum + Number(item.minimumBalance || 0), 0);
  const totalMonthly = state.data.accounts.reduce((sum, item) => sum + Number(item.monthlyAllocation || 0), 0);
  main.className = "";
  main.innerHTML = `
    <section class="metric-grid">
      ${metric("Available cash", formatMoney(totalBalance), totalBalance < 0 ? "negative" : "positive")}
      ${metric("Balance expectation", formatMoney(totalTarget))}
      ${metric("Monthly minimum", formatMoney(totalMinimum))}
      ${metric("Monthly allocation", formatMoney(totalMonthly))}
      ${metric("Accounts", String(state.data.accounts.length))}
    </section>
    <section class="card">
      <div class="section-header"><h2>Your accounts</h2><button class="button primary" data-add="account">Add account</button></div>
      <div class="list">${state.data.accounts.length ? state.data.accounts.map((item) => `<div class="list-item">
        <div class="list-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.purpose || categoryName(item.typeId))}</small><small>Minimum ${formatMoney(item.minimumBalance)} · Target ${formatMoney(item.targetBalance)}</small></div>
        <div class="list-value"><strong class="${Number(item.balance) < 0 ? "negative" : ""}">${formatMoney(item.balance)}</strong><small>${formatMoney(item.monthlyAllocation)} / month</small></div>
        <div class="list-actions">
          <button class="mini-button" data-edit="account" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">✎</button>
          <button class="mini-button danger" data-delete="account" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button>
        </div>
      </div>`).join("") : emptyState("No accounts yet.")}</div>
    </section>
  `;
}

function renderMore() {
  const links = [
    ["transactions", "↕", "Transactions", "Search and manage all money movements"],
    ["plans", "▤", "Monthly plan", "Complete monthly items and build streaks"],
    ["strategy", "◫", "Investment plan", "Manage products, charges, tickers, and exposure"],
    ["goals", "◎", "Financial goals", "Monitor progress toward your goals"],
    ["cards", "▰", "Cards", "Track current and future credit cards"],
    ["networth", "⌁", "Net worth", "Liabilities and historical snapshots"],
    ["settings", "⚙", "Settings", "Customize appearance, categories, and data"]
  ];
  main.className = "";
  main.innerHTML = `<section class="card"><div class="list">${links.map(([route, icon, title, description]) => `<button class="list-item text-button" data-route-link="${route}">
    <span style="font-size:1.4rem">${icon}</span>
    <span class="list-main" style="text-align:left"><strong>${title}</strong><small>${description}</small></span>
    <span>›</span>
  </button>`).join("")}</div></section>
  <section class="card"><p class="section-label">PRIVACY</p><h2>Your data stays here</h2><p class="muted">My Wealth has no server, analytics, tracking, or account. Everything is stored in this browser's IndexedDB. Export backups regularly, because phones remain capable of creative betrayal.</p></section>`;
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
    <div class="section-header"><h2>All transactions</h2><button class="button primary" data-add="transaction">Add transaction</button></div>
    <div class="filter-row">
      <input type="search" id="transaction-search" placeholder="Search transactions" value="${escapeHtml(state.filters.transaction)}">
      <select id="transaction-type-filter" aria-label="Transaction type filter">
        <option value="">All types</option>${selectOptions(["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"], state.filters.transactionType)}
      </select>
    </div>
    <div class="list">${items.length ? items.map((item) => `<div class="list-item">
      <div class="list-main"><strong>${escapeHtml(item.description || item.type)}</strong><small>${escapeHtml(item.type)} · ${formatDate(item.date)} · ${escapeHtml(categoryName(item.categoryId))}</small></div>
      <strong>${formatMoney(item.amount)}</strong>
      <div class="list-actions">
        <button class="mini-button" data-edit="transaction" data-id="${item.id}" aria-label="Edit transaction">✎</button>
        <button class="mini-button danger" data-delete="transaction" data-id="${item.id}" aria-label="Delete transaction">×</button>
      </div>
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
    <div class="section-header"><h2>Financial goals</h2><button class="button primary" data-add="goal">Add goal</button></div>
    <div class="list">${state.data.goals.length ? state.data.goals.map((goal) => {
      const progress = goalProgress(goal);
      return `<div class="list-item">
        <div class="list-main">
          <strong>${escapeHtml(goal.name)} <span class="status-badge">${escapeHtml(goal.status || "Planned")}</span></strong>
          <div class="progress"><span style="width:${progress.percentage}%"></span></div>
          <small>${formatMoney(goal.current)} of ${formatMoney(goal.target)} · ${progress.percentage.toFixed(1)}% · ${formatMoney(progress.remaining)} remaining${goal.targetDate ? ` · by ${escapeHtml(goal.targetDate)}` : ""}</small>
        </div>
        <div class="list-actions">
          <button class="mini-button" data-edit="goal" data-id="${goal.id}" aria-label="Edit ${escapeHtml(goal.name)}">✎</button>
          <button class="mini-button danger" data-delete="goal" data-id="${goal.id}" aria-label="Delete ${escapeHtml(goal.name)}">×</button>
        </div>
      </div>`;
    }).join("") : emptyState("No goals yet.")}</div>
  </section>`;
}

function planCompletion(planId, month) {
  return state.data.planCompletions.find((entry) => entry.planId === planId && entry.month === month);
}

function offsetMonth(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function planStreak(planId, endingMonth = currentMonth()) {
  let streak = 0;
  let month = endingMonth;
  while (planCompletion(planId, month)) {
    streak += 1;
    month = offsetMonth(month, -1);
  }
  return streak;
}

function renderPlans() {
  const month = state.filters.planMonth || currentMonth();
  const completedPlans = state.data.monthlyPlans.filter((plan) => planCompletion(plan.id, month));
  const target = state.data.monthlyPlans.reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
  const completed = completedPlans.reduce((sum, plan) => sum + Number(plan.amount || 0), 0);
  const percentage = target > 0 ? (completed / target) * 100 : 0;
  main.className = "";
  main.innerHTML = `<section class="card">
    <div class="section-header"><div><p class="section-label">MONTHLY INVESTMENT CHECKLIST</p><h2>${formatDate(`${month}-01`).replace("1 ", "")}</h2></div><input class="month-picker" type="month" id="plan-month" value="${escapeHtml(month)}" aria-label="Plan month"></div>
    <div class="progress"><span style="width:${percentage}%"></span></div>
    <div class="metric-grid">
      ${metric("Target", formatMoney(target))}
      ${metric("Completed", formatMoney(completed), "positive")}
      ${metric("Pending", formatMoney(Math.max(target - completed, 0)), completed === target ? "positive" : "")}
      ${metric("Progress", `${percentage.toFixed(1)}%`)}
    </div>
  </section>
  <section class="card">
    <div class="section-header"><h2>Plan items</h2><button class="button primary" data-add="plan">Add item</button></div>
    <div class="list">${state.data.monthlyPlans.length ? state.data.monthlyPlans.map((plan) => {
      const done = Boolean(planCompletion(plan.id, month));
      const streak = planStreak(plan.id, month);
      return `<div class="list-item ${done ? "completed-item" : ""}">
      <button class="completion-button ${done ? "complete" : ""}" data-toggle-plan="${plan.id}" data-month="${month}" aria-label="${done ? "Mark pending" : "Mark completed"}">${done ? "✓" : ""}</button>
      <div class="list-main"><strong>${escapeHtml(plan.name)}</strong><small>${escapeHtml(plan.purpose || categoryName(plan.categoryId))}</small><small>${streak ? `🔥 ${streak} month streak` : "No active streak"}</small></div>
      <div class="list-value"><strong>${formatMoney(plan.amount)}</strong><small>${done ? "Completed" : "Pending"}</small></div>
      <div class="list-actions">
        <button class="mini-button" data-edit="plan" data-id="${plan.id}" aria-label="Edit ${escapeHtml(plan.name)}">✎</button>
        <button class="mini-button danger" data-delete="plan" data-id="${plan.id}" aria-label="Delete ${escapeHtml(plan.name)}">×</button>
      </div>
    </div>`;
    }).join("") : emptyState("No monthly plan items yet.")}</div>
  </section>`;
}

function renderCards() {
  const current = state.data.cards.filter((card) => card.status === "Current").length;
  main.className = "";
  main.innerHTML = `<section class="metric-grid">
    ${metric("Current cards", String(current))}
    ${metric("Future cards", String(state.data.cards.length - current))}
  </section>
  <section class="card">
    <div class="section-header"><h2>Card plan</h2><button class="button primary" data-add="card">Add card</button></div>
    <div class="list">${state.data.cards.length ? state.data.cards.map((card) => `<div class="list-item">
      <div class="list-main"><strong>${escapeHtml(card.name)} <span class="status-badge">${escapeHtml(card.status)}</span></strong><small>${escapeHtml(card.purpose || "No purpose set")}${card.bank ? ` · ${escapeHtml(card.bank)}` : ""}</small></div>
      <div class="list-actions">
        <button class="mini-button" data-edit="card" data-id="${card.id}" aria-label="Edit ${escapeHtml(card.name)}">✎</button>
        <button class="mini-button danger" data-delete="card" data-id="${card.id}" aria-label="Delete ${escapeHtml(card.name)}">×</button>
      </div>
    </div>`).join("") : emptyState("No cards yet.")}</div>
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
    <div class="section-header"><h2>Products &amp; allocation</h2><button class="button primary" data-add="product">Add product</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Category</th><th>Monthly</th><th>Charges</th><th>Status</th><th></th></tr></thead>
      <tbody>${state.data.investmentProducts.map((item) => `<tr>
        <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.ticker || item.exposure || "")}</small></td>
        <td>${escapeHtml(categoryName(item.categoryId))}</td>
        <td>${formatMoney(item.monthlyAmount)}</td>
        <td>${Number(item.charges || 0).toFixed(2)}%</td>
        <td><span class="status-badge">${escapeHtml(item.status || "Planned")}</span></td>
        <td><div class="list-actions"><button class="mini-button" data-edit="product" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">✎</button><button class="mini-button danger" data-delete="product" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button></div></td>
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
  const liabilities = state.data.liabilities.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  main.className = "";
  main.innerHTML = `<section class="card hero-card">
    <p class="eyebrow">CURRENT NET WORTH</p><p class="hero-value">${formatMoney(worth)}</p>
    <div class="hero-stats"><div><span class="muted">Accounts</span><strong>${formatMoney(accountValue)}</strong></div><div><span class="muted">Investments</span><strong>${formatMoney(totalCurrentValue(state.data.investments))}</strong></div></div>
  </section>
  <section class="card"><div class="section-header"><h2>History</h2><button class="text-button" data-action="snapshot">Save snapshot</button></div>${historyChart()}</section>
  <section class="card">
    <div class="section-header"><div><h2>Liabilities</h2><p class="muted" style="margin:.2rem 0 0">Total ${formatMoney(liabilities)}</p></div><button class="button primary" data-add="liability">Add liability</button></div>
    <div class="list">${state.data.liabilities.length ? state.data.liabilities.map((item) => `<div class="list-item">
      <div class="list-main"><strong>${escapeHtml(item.name)}</strong><small>${item.notes ? escapeHtml(item.notes) : "Manual liability"}</small></div>
      <strong class="negative">${formatMoney(item.amount)}</strong>
      <div class="list-actions">
        <button class="mini-button" data-edit="liability" data-id="${item.id}" aria-label="Edit liability">✎</button>
        <button class="mini-button danger" data-delete="liability" data-id="${item.id}" aria-label="Delete liability">×</button>
      </div>
    </div>`).join("") : emptyState("No liabilities recorded.")}</div>
  </section>`;
}

function categorySettings(group, title) {
  const items = state.data.categories.filter((item) => item.group === group);
  return `<section class="card">
    <div class="section-header"><h2>${escapeHtml(title)}</h2><button class="text-button" data-add-category="${group}">Add</button></div>
    ${items.map((item) => `<div class="category-row">
      <span>${escapeHtml(item.icon || "")} ${escapeHtml(item.name)}${group === "investment" ? ` · ${Number(item.target || 0).toFixed(1)}%` : ""}${group === "expense" ? ` · ${formatMoney(item.budget)} plan` : ""}</span>
      <div class="list-actions">
        <button class="mini-button" data-edit-category="${item.id}">✎</button>
        <button class="mini-button danger" data-delete-category="${item.id}">×</button>
      </div>
    </div>`).join("")}
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
            <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Light</option>
            <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option>
          </select></label>
          <label><span>Accent color</span><input type="color" id="accent-setting" value="${escapeHtml(state.settings.accent)}"></label>
          <label><span>Currency</span><select id="currency-setting">
            ${["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((currency) => `<option value="${currency}" ${currency === state.settings.currency ? "selected" : ""}>${currency}</option>`).join("")}
          </select></label>
        </div>
      </section>
      ${categorySettings("investment", "Investment categories")}
      ${categorySettings("expense", "Expense categories")}
      ${categorySettings("account", "Account types")}
      <section class="card">
        <div class="section-header"><h2>Data</h2></div>
        <p class="muted">Backups contain all financial data in readable JSON. Store them somewhere safe.</p>
        <div class="button-row">
          <button class="button primary" data-action="export-backup">Export backup</button>
          <button class="button secondary" data-action="import-backup">Import backup</button>
          <button class="button secondary" data-action="export-csv">Export CSV</button>
          <button class="button danger-button" data-action="clear-data">Clear all data</button>
        </div>
      </section>
    </div>`;
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
  cards: renderCards,
  strategy: renderStrategy,
  networth: renderNetWorth,
  settings: renderSettings
};

function render() {
  pageTitle.textContent = routeTitles[state.route];
  document.querySelectorAll(".nav-item").forEach((item) => {
    const activeRoute = ["transactions", "goals", "plans", "cards", "strategy", "networth", "settings"].includes(state.route) ? "more" : state.route;
    item.classList.toggle("active", item.dataset.route === activeRoute);
    item.setAttribute("aria-current", item.dataset.route === activeRoute ? "page" : "false");
  });
  renderers[state.route]();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function routeTo(route) {
  if (!renderers[route]) return;
  state.route = route;
  history.replaceState(null, "", route === "home" ? location.pathname : `#${route}`);
  if (!state.settings) return;
  render();
}

function field(name, label, type = "text", value = "", options = {}) {
  const attributes = [
    options.required ? "required" : "",
    options.min !== undefined ? `min="${options.min}"` : "",
    options.step ? `step="${options.step}"` : "",
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ""
  ].filter(Boolean).join(" ");
  return `<label class="${options.full ? "field-full" : ""}"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attributes}></label>`;
}

function selectField(name, label, optionsMarkup, full = false) {
  return `<label class="${full ? "field-full" : ""}"><span>${escapeHtml(label)}</span><select name="${name}">${optionsMarkup}</select></label>`;
}

function textArea(name, label, value = "") {
  return `<label class="field-full"><span>${escapeHtml(label)}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
}

function openDialog(title, body, submitHandler, saveLabel = "Save") {
  dialogTitle.textContent = title;
  dialogBody.innerHTML = `<div class="form-grid">${body}</div>`;
  dialogSave.textContent = saveLabel;
  dialogSubmitHandler = submitHandler;
  dialog.showModal();
  dialogBody.querySelector("input, select, textarea")?.focus();
}

function formValue(formData, key) {
  return String(formData.get(key) || "").trim();
}

function openInvestmentForm(item = {}) {
  openDialog(item.id ? "Edit investment" : "Add investment", `
    ${field("name", "Investment name", "text", item.name, { required: true, full: true })}
    ${selectField("categoryId", "Category", categoryOptions("investment", item.categoryId))}
    ${selectField("accountId", "Account", accountOptions(item.accountId))}
    ${field("quantity", "Quantity", "number", item.quantity, { min: 0, step: "any" })}
    ${field("buyPrice", "Buy price", "number", item.buyPrice, { min: 0, step: "0.01" })}
    ${field("investedAmount", "Invested amount", "number", item.investedAmount, { min: 0, step: "0.01" })}
    ${field("currentPrice", "Current price", "number", item.currentPrice, { min: 0, step: "0.01" })}
    ${field("currentValue", "Current value", "number", item.currentValue, { min: 0, step: "0.01" })}
    ${field("purchaseDate", "Purchase date", "date", item.purchaseDate || today(), { required: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    const raw = {
      ...item,
      id: item.id || createId("investment"),
      name: formValue(formData, "name"),
      categoryId: formValue(formData, "categoryId"),
      accountId: formValue(formData, "accountId"),
      quantity: Number(formValue(formData, "quantity")),
      buyPrice: Number(formValue(formData, "buyPrice")),
      investedAmount: Number(formValue(formData, "investedAmount")),
      currentPrice: Number(formValue(formData, "currentPrice")),
      currentValue: Number(formValue(formData, "currentValue")),
      purchaseDate: formValue(formData, "purchaseDate"),
      notes: formValue(formData, "notes")
    };
    const values = investmentValues(raw);
    raw.investedAmount = values.investedAmount;
    raw.currentValue = values.currentValue;
    await putOne("investments", raw);
    await createNetWorthSnapshot();
  });
}

function openTransactionForm(item = {}, forcedType) {
  const type = forcedType || item.type || "Investment";
  const types = ["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"];
  const categoryGroup = type === "Expense" ? "expense" : "investment";
  openDialog(item.id ? `Edit ${type.toLowerCase()}` : `Add ${type.toLowerCase()}`, `
    ${selectField("type", "Type", types.map((entry) => `<option value="${entry}" ${entry === type ? "selected" : ""}>${entry}</option>`).join(""))}
    ${field("date", "Date", "date", item.date || today(), { required: true })}
    ${field("amount", "Amount", "number", item.amount, { required: true, min: 0, step: "0.01" })}
    ${selectField("categoryId", "Category", forcedType ? `<option value="">Uncategorized</option>${categoryOptions(categoryGroup, item.categoryId)}` : transactionCategoryOptions(item.categoryId))}
    ${selectField("accountId", "Account", accountOptions(item.accountId))}
    ${field("description", "Description", "text", item.description, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("transactions", {
      ...item,
      id: item.id || createId("transaction"),
      type: formValue(formData, "type"),
      date: formValue(formData, "date"),
      amount: Number(formValue(formData, "amount")),
      categoryId: formValue(formData, "categoryId"),
      accountId: formValue(formData, "accountId"),
      description: formValue(formData, "description"),
      notes: formValue(formData, "notes")
    });
  });
}

function openAccountForm(item = {}) {
  openDialog(item.id ? "Edit account" : "Add account", `
    ${field("name", "Account name", "text", item.name, { required: true, full: true })}
    ${selectField("typeId", "Account type", categoryOptions("account", item.typeId))}
    ${field("balance", "Current balance", "number", item.balance, { step: "0.01" })}
    ${field("targetBalance", "Balance expectation", "number", item.targetBalance, { min: 0, step: "0.01" })}
    ${field("minimumBalance", "Monthly minimum required", "number", item.minimumBalance, { min: 0, step: "0.01" })}
    ${field("monthlyAllocation", "Monthly allocation", "number", item.monthlyAllocation, { min: 0, step: "0.01" })}
    ${field("purpose", "Purpose", "text", item.purpose, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("accounts", {
      ...item,
      id: item.id || createId("account"),
      name: formValue(formData, "name"),
      typeId: formValue(formData, "typeId"),
      balance: Number(formValue(formData, "balance")),
      targetBalance: Number(formValue(formData, "targetBalance")),
      minimumBalance: Number(formValue(formData, "minimumBalance")),
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
  openDialog(item.id ? "Edit card" : "Add card", `
    ${field("name", "Card name", "text", item.name, { required: true, full: true })}
    ${selectField("status", "Status", selectOptions(["Current", "Future"], item.status || "Current"))}
    ${field("bank", "Linked bank", "text", item.bank)}
    ${field("purpose", "Purpose and benefits", "text", item.purpose, { full: true })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("cards", {
      ...item,
      id: item.id || createId("card"),
      name: formValue(formData, "name"),
      status: formValue(formData, "status"),
      bank: formValue(formData, "bank"),
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
  openDialog(item.id ? "Edit liability" : "Add liability", `
    ${field("name", "Liability name", "text", item.name, { required: true, full: true })}
    ${field("amount", "Outstanding amount", "number", item.amount, { required: true, min: 0, step: "0.01" })}
    ${textArea("notes", "Notes", item.notes)}
  `, async (formData) => {
    await putOne("liabilities", {
      ...item,
      id: item.id || createId("liability"),
      name: formValue(formData, "name"),
      amount: Number(formValue(formData, "amount")),
      notes: formValue(formData, "notes")
    });
    await createNetWorthSnapshot();
  });
}

function openCategoryForm(group, item = {}) {
  openDialog(item.id ? "Edit category" : "Add category", `
    ${field("name", "Name", "text", item.name, { required: true, full: true })}
    ${field("icon", "Icon or short symbol", "text", item.icon, { full: group !== "investment" })}
    ${group === "investment" ? field("target", "Target allocation %", "number", item.target, { min: 0, step: "0.1" }) : ""}
    ${group === "expense" ? field("budget", "Monthly expense plan", "number", item.budget, { min: 0, step: "0.01" }) : ""}
    ${group === "investment" || group === "expense" ? field("color", "Chart color", "color", item.color || "#176b5b") : ""}
  `, async (formData) => {
    await putOne("categories", {
      ...item,
      id: item.id || createId(`category-${group}`),
      group,
      name: formValue(formData, "name"),
      icon: formValue(formData, "icon"),
      target: group === "investment" ? Number(formValue(formData, "target")) : undefined,
      budget: group === "expense" ? Number(formValue(formData, "budget")) : undefined,
      color: formValue(formData, "color") || undefined
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

async function exportBackup() {
  const backup = await exportAllData();
  downloadFile(`my-wealth-backup-${today()}.json`, JSON.stringify(backup, null, 2), "application/json");
  showToast("Backup exported.");
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
    item.currentValue,
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

dialogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    dialog.close();
    return;
  }
  if (!dialogForm.reportValidity() || !dialogSubmitHandler) return;

  dialogSave.disabled = true;
  try {
    await dialogSubmitHandler(new FormData(dialogForm));
    dialog.close();
    await loadState();
    render();
    showToast("Saved.");
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

document.querySelector("#quick-add-button").addEventListener("click", () => {
  const type = {
    investments: "investment",
    expenses: "expense",
    accounts: "account",
    goals: "goal",
    plans: "plan",
    cards: "card",
    strategy: "product",
    networth: "liability",
    transactions: "transaction"
  }[state.route] || "transaction";
  formOpeners[type]();
});

main.addEventListener("click", async (event) => {
  const routeLink = event.target.closest("[data-route-link]");
  if (routeLink) return routeTo(routeLink.dataset.routeLink);

  const planToggle = event.target.closest("[data-toggle-plan]");
  if (planToggle) {
    const planId = planToggle.dataset.togglePlan;
    const month = planToggle.dataset.month;
    const completion = planCompletion(planId, month);
    if (completion) {
      await deleteOne("planCompletions", completion.id);
      showToast("Marked pending.");
    } else {
      await putOne("planCompletions", {
        id: `${planId}-${month}`,
        planId,
        month,
        completedAt: new Date().toISOString()
      });
      showToast("Completed. Streak updated.");
    }
    await loadState();
    renderPlans();
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
    if (action === "export-backup") await exportBackup();
    if (action === "import-backup") backupInput.click();
    if (action === "export-csv") exportCsv();
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

main.addEventListener("input", async (event) => {
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
    const backup = JSON.parse(await file.text());
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

window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1);
  if (renderers[route]) routeTo(route);
});

async function start() {
  try {
    await initializeDatabase();
    await loadState();
    const initialRoute = location.hash.slice(1);
    state.route = renderers[initialRoute] ? initialRoute : "home";
    render();

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
