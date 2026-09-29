const DB_NAME = "my-wealth";
const DB_VERSION = 2;
const CATEGORY_ICON_VERSION = 1;
const CATEGORY_STRUCTURE_VERSION = 2;

export const STORES = [
  "settings",
  "accounts",
  "investments",
  "transactions",
  "categories",
  "goals",
  "monthlyPlans",
  "planCompletions",
  "cards",
  "investmentProducts",
  "netWorthHistory",
  "liabilities"
];

const defaultCategories = [
  { id: "inv-foreign", group: "investment", name: "Foreign Stocks", icon: "🌎", target: 36.6972477064, color: "#176b5b" },
  { id: "inv-etfs", group: "investment", name: "ETFs", icon: "🧺", targetAmount: 0, actualAmount: 0 },
  { id: "inv-funds", group: "investment", name: "Indian Equity Funds", icon: "📊", target: 18.3486238532, color: "#2f80ed" },
  { id: "inv-stocks", group: "investment", name: "Indian Stocks", icon: "🇮🇳", target: 13.7614678899, color: "#7b61ff" },
  { id: "inv-gold", group: "investment", name: "Gold / Metals", icon: "🪙", target: 9.1743119266, color: "#e0a100" },
  { id: "inv-debt", group: "investment", name: "Bonds", icon: "🏦", target: 5.504587156, color: "#b56b00" },
  { id: "inv-cash", group: "investment", name: "Cash", icon: "💰", target: 9.1743119266, color: "#00a884" },
  { id: "inv-crypto", group: "investment", name: "Crypto", icon: "₿", target: 3.6697247706, color: "#e76f51" },
  { id: "inv-trading", group: "investment", name: "Intraday / Trading", icon: "⚡", target: 3.6697247706, color: "#d14d72" },
  { id: "inv-other", group: "investment", name: "Other", icon: "🧩", target: 0, color: "#77817d" },
  { id: "exp-1", group: "expense", name: "Rent / Regular", icon: "🏠", color: "#176b5b", budget: 13500 },
  { id: "exp-2", group: "expense", name: "Food / Snacks", icon: "🍽️", color: "#2f80ed", budget: 4000 },
  { id: "exp-3", group: "expense", name: "Travel", icon: "✈️", color: "#7b61ff", budget: 4000 },
  { id: "exp-4", group: "expense", name: "Bike", icon: "🏍️", color: "#e0a100", budget: 5000 },
  { id: "exp-5", group: "expense", name: "Shopping", icon: "🛍️", color: "#e76f51", budget: 0 },
  { id: "exp-6", group: "expense", name: "Bills", icon: "🧾", color: "#00a884", budget: 0 },
  { id: "exp-7", group: "expense", name: "Entertainment", icon: "🎬", color: "#d14d72", budget: 0 },
  { id: "exp-8", group: "expense", name: "Other", icon: "📦", color: "#77817d", budget: 4000 },
  { id: "account-1", group: "account", name: "Bank account", icon: "🏦" },
  { id: "account-2", group: "account", name: "Brokerage account", icon: "📈" },
  { id: "account-3", group: "account", name: "Wallet", icon: "👛" },
  { id: "account-4", group: "account", name: "Cash", icon: "💵" },
  { id: "account-5", group: "account", name: "Other", icon: "🗂️" }
];

const defaultSettings = {
  id: "app",
  currency: "INR",
  locale: "en-IN",
  theme: "system",
  accent: "#176b5b",
  dashboardCards: {
    netWorth: true,
    investments: true,
    expenses: true,
    cash: true,
    goals: true,
    allocation: true,
    recentTransactions: true
  },
  categoriesInitialized: true,
  categoryIconVersion: CATEGORY_ICON_VERSION,
  categoryStructureVersion: CATEGORY_STRUCTURE_VERSION
};

let databasePromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Database transaction aborted."));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onblocked = () => reject(new Error("Database upgrade is blocked by another My Wealth tab. Close other tabs and reload."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

export async function getAll(storeName) {
  const database = await openDatabase();
  return requestToPromise(database.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function getOne(storeName, id) {
  const database = await openDatabase();
  return requestToPromise(database.transaction(storeName, "readonly").objectStore(storeName).get(id));
}

export async function putOne(storeName, value) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

export async function deleteOne(storeName, id) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

export async function replaceStore(storeName, values) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  store.clear();
  for (const value of values) store.put(value);
  await transactionDone(transaction);
}

export async function clearAllData() {
  const database = await openDatabase();
  const transaction = database.transaction(STORES, "readwrite");
  for (const storeName of STORES) transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

export async function exportAllData() {
  const entries = await Promise.all(STORES.map(async (store) => [store, await getAll(store)]));
  return {
    app: "My Wealth",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(entries)
  };
}

export function validateBackup(backup) {
  if (!backup || backup.app !== "My Wealth" || ![1, 2].includes(backup.version) || typeof backup.data !== "object") {
    throw new Error("This is not a valid My Wealth backup.");
  }

  for (const store of STORES.filter((name) => !["planCompletions", "cards", "investmentProducts"].includes(name))) {
    if (!Array.isArray(backup.data[store])) {
      throw new Error(`Backup is missing the ${store} collection.`);
    }
  }
}

export async function importAllData(backup) {
  validateBackup(backup);
  const database = await openDatabase();
  const transaction = database.transaction(STORES, "readwrite");

  for (const storeName of STORES) {
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const value of backup.data[storeName] || []) store.put(value);
  }

  await transactionDone(transaction);
}

export async function initializeDatabase() {
  const existingSettings = await getOne("settings", "app");
  if (!existingSettings?.categoriesInitialized && (await getAll("categories")).length === 0) {
    await replaceStore("categories", defaultCategories);
  }
  if (Number(existingSettings?.categoryIconVersion || 0) < CATEGORY_ICON_VERSION) {
    const categories = await getAll("categories");
    const defaultIcons = new Map(defaultCategories.map((category) => [category.id, category.icon]));
    for (const category of categories) {
      const icon = defaultIcons.get(category.id);
      if (icon) await putOne("categories", { ...category, icon });
    }
  }
  if (Number(existingSettings?.categoryStructureVersion || 0) < CATEGORY_STRUCTURE_VERSION) {
    const categories = await getAll("categories");
    const nameUpdates = new Map([
      ["inv-foreign", ["Foreign Stocks / ETFs", "Foreign Stocks"]],
      ["inv-debt", ["Bonds / Debt", "Bonds"]],
      ["inv-cash", ["Cash / Opportunity", "Cash"]]
    ]);
    for (const category of categories) {
      const [previousName, nextName] = nameUpdates.get(category.id) || [];
      if (category.name === previousName) await putOne("categories", { ...category, name: nextName });
    }
    const hasEtfCategory = categories.some((category) =>
      category.group === "investment" && (category.id === "inv-etfs" || category.name.trim().toLowerCase() === "etfs")
    );
    if (!hasEtfCategory) {
      await putOne("categories", defaultCategories.find((category) => category.id === "inv-etfs"));
    }
  }
  const normalizedSettings = {
    ...defaultSettings,
    ...existingSettings,
    dashboardCards: {
      ...defaultSettings.dashboardCards,
      ...(existingSettings?.dashboardCards || {})
    }
  };
  await putOne("settings", normalizedSettings);
}

export async function resetToDefaults() {
  await clearAllData();
  await initializeDatabase();
}

export function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
