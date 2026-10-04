const HEADER = [
  "Include",
  "RecordType",
  "ExternalId",
  "Name",
  "Institution",
  "AccountExternalId",
  "Category",
  "TransactionType",
  "Date",
  "Amount",
  "Balance",
  "Quantity",
  "BuyPrice",
  "InvestedAmount",
  "CurrentPrice",
  "CurrentValue",
  "PrincipalAmount",
  "InterestRate",
  "DurationMonths",
  "MonthlyPayment",
  "Currency",
  "Notes"
];

export const SPREADSHEET_HEADERS = Object.freeze([...HEADER]);

const TEMPLATE_ROWS = [
  ["No", "Account", "bank-savings-1", "Main savings", "SBI", "", "Bank account", "", "", "", "125000", "", "", "", "", "", "", "", "", "", "INR", "Change Include to Yes"],
  ["No", "Investment", "holding-1", "Example equity fund", "Your broker", "bank-savings-1", "Indian Equity Funds", "", "2025-01-01", "", "", "10", "8000", "80000", "9000", "90000", "", "", "", "", "INR", "Change Include to Yes"],
  ["No", "Transaction", "txn-1", "Grocery purchase", "SBI", "bank-savings-1", "Food / Snacks", "Expense", "2026-10-01", "1250", "", "", "", "", "", "", "", "", "", "", "INR", "Change Include to Yes"],
  ["No", "PF", "pf-1", "Provident Fund", "EPFO", "", "Provident Fund", "", "2020-01-01", "", "", "1", "", "180000", "", "210000", "", "", "", "", "INR", "Change Include to Yes"],
  ["No", "Liability", "loan-1", "Home loan", "Your lender", "", "", "", "", "", "", "", "", "", "", "", "300000", "8.5", "240", "15000", "INR", "PrincipalAmount is current outstanding balance"]
];

const RECORD_STORES = {
  account: "accounts",
  investment: "investments",
  transaction: "transactions",
  pf: "investments",
  liability: "liabilities"
};

const TRANSACTION_TYPES = new Set(["Investment", "Withdrawal", "Dividend", "Interest", "Expense", "Income", "Transfer"]);

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function spreadsheetTemplate() {
  return [HEADER, ...TEMPLATE_ROWS].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function spreadsheetRowsCsv(rows) {
  return [
    SPREADSHEET_HEADERS,
    ...rows.map((row) => SPREADSHEET_HEADERS.map((header) => row[header] ?? ""))
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Spreadsheet contains an unclosed quoted value.");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim()));
}

function clean(value, maximum = 500) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maximum) throw new Error("Spreadsheet contains text that is too long.");
  return normalized;
}

function required(row, key, line) {
  const value = clean(row[key]);
  if (!value) throw new Error(`Row ${line}: ${key} is required.`);
  return value;
}

function numberValue(row, key, line, options = {}) {
  const raw = clean(row[key], 64);
  if (!raw) return options.defaultValue ?? 0;
  const normalized = raw.replaceAll(",", "").replace(/[₹$£€]/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`Row ${line}: ${key} must be a number.`);
  if (options.minimum !== undefined && number < options.minimum) throw new Error(`Row ${line}: ${key} must be at least ${options.minimum}.`);
  return number;
}

function dateValue(row, key, line, fallback = "") {
  const value = clean(row[key], 32);
  if (!value) return fallback;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Row ${line}: ${key} must use YYYY-MM-DD.`);
  }
  return value;
}

function resolveCategory(categories, group, value, fallbackId, line) {
  const requested = clean(value).toLowerCase();
  if (!requested) return fallbackId;
  const category = categories.find((item) => item.group === group && (item.id.toLowerCase() === requested || item.name.toLowerCase() === requested));
  if (!category) throw new Error(`Row ${line}: category "${clean(value)}" does not exist in My Wealth.`);
  return category.id;
}

function resolveBank(banks, institution) {
  const requested = clean(institution).toLowerCase();
  if (!requested) return "";
  return banks.find((bank) => [bank.name, bank.shortName, ...(bank.aliases || [])]
    .some((name) => String(name).trim().toLowerCase() === requested))?.id || "";
}

async function stableId(store, externalId) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${store}\u0000${externalId}`)));
  const suffix = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `import-${store}-${suffix}`;
}

export async function parseSpreadsheet(text, categories, sourceName = "spreadsheet.csv", banks = []) {
  if (typeof text !== "string" || text.length > 10 * 1024 * 1024) throw new Error("Spreadsheet must be 10 MB or smaller.");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("Spreadsheet is empty.");
  if (rows.length > 10001) throw new Error("Spreadsheet cannot contain more than 10,000 data rows.");

  const headers = rows[0].map((value) => clean(value, 64));
  const normalizedHeaders = headers.map((value) => value.toLowerCase());
  for (const requiredHeader of ["include", "recordtype", "externalid", "name"]) {
    if (!normalizedHeaders.includes(requiredHeader)) throw new Error(`Spreadsheet is missing the ${requiredHeader} column.`);
  }
  const headerMap = Object.fromEntries(normalizedHeaders.map((key, index) => [key, headers[index]]));
  const recordsByStore = { accounts: [], investments: [], transactions: [], liabilities: [] };
  const identifiers = new Set();
  const accountIds = new Map();
  const includedRows = [];

  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const row = Object.fromEntries(headers.map((header, column) => [headerMap[header.toLowerCase()], values[column] ?? ""]));
    const include = clean(row[headerMap.include]).toLowerCase();
    if (!["yes", "true", "1", "y"].includes(include)) continue;
    const line = index + 1;
    const recordType = required(row, headerMap.recordtype, line).toLowerCase();
    const store = RECORD_STORES[recordType];
    if (!store) throw new Error(`Row ${line}: RecordType must be Account, Investment, Transaction, PF, or Liability.`);
    const externalId = required(row, headerMap.externalid, line);
    const uniqueKey = `${store}\u0000${externalId}`;
    if (identifiers.has(uniqueKey)) throw new Error(`Row ${line}: duplicate ExternalId "${externalId}" for ${store}.`);
    identifiers.add(uniqueKey);
    includedRows.push({ row, line, recordType, store, externalId });
    if (recordType === "account") accountIds.set(externalId, await stableId("account", externalId));
  }

  if (!includedRows.length) throw new Error("No rows are marked Include=Yes.");
  const importedAt = new Date().toISOString();
  const today = importedAt.slice(0, 10);
  const metadata = (externalId) => ({ managed: true, externalId, sourceName: clean(sourceName, 128), importedAt });

  for (const entry of includedRows) {
    const { row, line, recordType, store, externalId } = entry;
    const name = required(row, headerMap.name, line);
    const institution = clean(row[headerMap.institution]);
    const notes = clean(row[headerMap.notes], 2000);
    const currency = clean(row[headerMap.currency], 8) || "INR";
    const accountExternalId = clean(row[headerMap.accountexternalid]);
    const accountId = accountExternalId ? accountIds.get(accountExternalId) : "";
    if (accountExternalId && !accountId) throw new Error(`Row ${line}: AccountExternalId "${accountExternalId}" is not an included Account row.`);

    if (recordType === "account") {
      const typeName = clean(row[headerMap.category]) || (institution.toLowerCase().includes("broker") ? "Brokerage account" : "Bank account");
      recordsByStore.accounts.push({
        id: accountIds.get(externalId),
        name,
        bankId: resolveBank(banks, institution),
        typeId: resolveCategory(categories, "account", typeName, "account-5", line),
        balance: numberValue(row, headerMap.balance, line),
        targetBalance: 0,
        minimumBalance: 0,
        monthlyAllocation: 0,
        purpose: institution || "Spreadsheet import",
        notes,
        currency,
        import: metadata(externalId)
      });
    } else if (recordType === "investment" || recordType === "pf") {
      const currentValue = numberValue(row, headerMap.currentvalue, line, { minimum: 0 });
      const investedAmount = numberValue(row, headerMap.investedamount, line, { minimum: 0, defaultValue: currentValue });
      recordsByStore.investments.push({
        id: await stableId("investment", externalId),
        name,
        categoryId: recordType === "pf" ? "inv-pf" : resolveCategory(categories, "investment", row[headerMap.category], "inv-other", line),
        accountId,
        quantity: numberValue(row, headerMap.quantity, line, { minimum: 0, defaultValue: recordType === "pf" ? 1 : 0 }),
        buyPrice: numberValue(row, headerMap.buyprice, line, { minimum: 0 }),
        investedAmount,
        currentPrice: numberValue(row, headerMap.currentprice, line, { minimum: 0, defaultValue: recordType === "pf" ? currentValue : 0 }),
        currentValue,
        purchaseDate: dateValue(row, headerMap.date, line, today),
        notes: notes || institution,
        currency,
        import: metadata(externalId)
      });
    } else if (recordType === "transaction") {
      const transactionType = clean(row[headerMap.transactiontype]);
      if (!TRANSACTION_TYPES.has(transactionType)) throw new Error(`Row ${line}: TransactionType is invalid.`);
      const categoryGroup = transactionType === "Expense" ? "expense" : "investment";
      recordsByStore.transactions.push({
        id: await stableId("transaction", externalId),
        type: transactionType,
        date: dateValue(row, headerMap.date, line),
        amount: Math.abs(numberValue(row, headerMap.amount, line)),
        categoryId: resolveCategory(categories, categoryGroup, row[headerMap.category], "", line),
        accountId,
        description: name,
        notes: notes || institution,
        currency,
        import: metadata(externalId)
      });
    } else if (recordType === "liability") {
      const outstanding = numberValue(row, headerMap.principalamount, line, { minimum: 0.01 });
      recordsByStore.liabilities.push({
        id: await stableId("liability", externalId),
        name,
        type: clean(row[headerMap.category]) || "Other",
        lender: institution,
        principalAmount: outstanding,
        paidAmount: 0,
        interestMethod: "Reducing",
        interestRate: numberValue(row, headerMap.interestrate, line, { minimum: 0 }),
        durationMonths: Math.max(Math.trunc(numberValue(row, headerMap.durationmonths, line, { minimum: 1, defaultValue: 1 })), 1),
        monthlyPayment: numberValue(row, headerMap.monthlypayment, line, { minimum: 0 }),
        totalAmount: outstanding,
        amount: outstanding,
        startDate: dateValue(row, headerMap.date, line),
        endDate: "",
        notes,
        currency,
        import: metadata(externalId)
      });
    }
  }

  return {
    recordsByStore,
    summary: {
      accounts: recordsByStore.accounts.length,
      investments: recordsByStore.investments.length,
      transactions: recordsByStore.transactions.length,
      liabilities: recordsByStore.liabilities.length,
      total: includedRows.length
    }
  };
}
