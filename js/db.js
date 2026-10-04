const DB_NAME = "my-wealth";
const DB_VERSION = 7;
const CATEGORY_ICON_VERSION = 1;
const CATEGORY_STRUCTURE_VERSION = 3;
const BANK_DIRECTORY_VERSION = 1;

export const STORES = [
  "settings",
  "banks",
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
  { id: "inv-foreign", group: "investment", name: "Foreign Stocks", icon: "🌎", color: "#176b5b" },
  { id: "inv-etfs", group: "investment", name: "ETFs", icon: "🧺" },
  { id: "inv-funds", group: "investment", name: "Indian Equity Funds", icon: "📊", color: "#2f80ed" },
  { id: "inv-stocks", group: "investment", name: "Indian Stocks", icon: "🇮🇳", color: "#7b61ff" },
  { id: "inv-gold", group: "investment", name: "Gold / Metals", icon: "🪙", color: "#e0a100" },
  { id: "inv-debt", group: "investment", name: "Bonds", icon: "🏦", color: "#b56b00" },
  { id: "inv-cash", group: "investment", name: "Cash", icon: "💰", color: "#00a884" },
  { id: "inv-crypto", group: "investment", name: "Crypto", icon: "₿", color: "#e76f51" },
  { id: "inv-trading", group: "investment", name: "Intraday / Trading", icon: "⚡", color: "#d14d72" },
  { id: "inv-pf", group: "investment", name: "Provident Fund", icon: "🛡️", color: "#4f6d7a" },
  { id: "inv-other", group: "investment", name: "Other", icon: "🧩", color: "#77817d" },
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

const defaultBanks = [
  { id: "bank-sbi", name: "State Bank of India", shortName: "SBI", color: "#2563eb", aliases: ["State Bank of India"] },
  { id: "bank-icici", name: "ICICI Bank", shortName: "ICICI", color: "#b91c1c", aliases: ["ICICI"] },
  { id: "bank-tmb", name: "Tamilnad Mercantile Bank", shortName: "TMB", color: "#9d174d", aliases: ["Tamilnad Mercantile Bank Limited"] },
  { id: "bank-iob", name: "Indian Overseas Bank", shortName: "IOB", color: "#1d4ed8", aliases: ["Indian Overseas Bank"] },
  { id: "bank-dcb", name: "DCB Bank", shortName: "DCB", color: "#047857", aliases: ["Development Credit Bank"] },
  { id: "bank-hdfc", name: "HDFC Bank", shortName: "HDFC", color: "#075985", aliases: ["HDFC"] },
  { id: "bank-axis", name: "Axis Bank", shortName: "AXIS", color: "#97144d", aliases: ["Axis"] },
  { id: "bank-kotak", name: "Kotak Mahindra Bank", shortName: "KOTAK", color: "#dc2626", aliases: ["Kotak", "Kotak Bank"] },
  { id: "bank-bob", name: "Bank of Baroda", shortName: "BOB", color: "#ea580c", aliases: ["BOB"] },
  { id: "bank-canara", name: "Canara Bank", shortName: "CANARA", color: "#0284c7", aliases: ["Canara"] },
  { id: "bank-indian", name: "Indian Bank", shortName: "IB", color: "#0369a1", aliases: ["Indian"] },
  { id: "bank-union", name: "Union Bank of India", shortName: "UNION", color: "#1d4ed8", aliases: ["Union Bank"] },
  { id: "bank-pnb", name: "Punjab National Bank", shortName: "PNB", color: "#881337", aliases: ["Punjab National Bank"] },
  { id: "bank-idbi", name: "IDBI Bank", shortName: "IDBI", color: "#047857", aliases: ["IDBI"] },
  { id: "bank-federal", name: "Federal Bank", shortName: "FED", color: "#0369a1", aliases: ["Federal"] },
  { id: "bank-yes", name: "YES Bank", shortName: "YES", color: "#1d4ed8", aliases: ["YES"] },
  { id: "bank-indusind", name: "IndusInd Bank", shortName: "IND", color: "#7f1d1d", aliases: ["IndusInd"] },
  { id: "bank-au", name: "AU Small Finance Bank", shortName: "AU", color: "#ea580c", aliases: ["AU Bank"] },
  { id: "bank-boi", name: "Bank of India", shortName: "BOI", color: "#0369a1", aliases: ["BOI"] },
  { id: "bank-uco", name: "UCO Bank", shortName: "UCO", color: "#1d4ed8", aliases: ["UCO"] }
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
  categoryStructureVersion: CATEGORY_STRUCTURE_VERSION,
  bankDirectoryVersion: BANK_DIRECTORY_VERSION
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

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (database.objectStoreNames.contains("connections")) database.deleteObjectStore("connections");
      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: "id" });
        }
      }
      if (event.oldVersion < 7) {
        const stripFields = (storeName, fields) => {
          const cursorRequest = request.transaction.objectStore(storeName).openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            for (const field of fields) delete record[field];
            cursor.update(record);
            cursor.continue();
          };
        };
        stripFields("accounts", ["targetBalance", "minimumBalance"]);
        stripFields("categories", ["target", "targetAmount", "actualAmount"]);
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

export async function replaceImportedData(recordsByStore) {
  const importStores = ["accounts", "investments", "transactions", "liabilities"];
  const database = await openDatabase();
  const transaction = database.transaction(importStores, "readwrite");

  for (const storeName of importStores) {
    const store = transaction.objectStore(storeName);
    const records = await requestToPromise(store.getAll());
    for (const record of records) {
      if (record.import?.managed === true || record.sync?.managed === true) store.delete(record.id);
    }
    for (const record of recordsByStore[storeName] || []) store.put(record);
  }

  await transactionDone(transaction);
}

export async function replaceWorkbookData(recordsByStore) {
  const workbookStores = STORES.filter((store) => store !== "settings");
  const database = await openDatabase();
  const transaction = database.transaction(workbookStores, "readwrite");

  for (const storeName of workbookStores) {
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const record of recordsByStore[storeName] || []) store.put(record);
  }

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
    version: 3,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(entries)
  };
}

export function validateBackup(backup) {
  if (!backup || backup.app !== "My Wealth" || ![1, 2, 3].includes(backup.version) || !backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
    throw new Error("This is not a valid My Wealth backup.");
  }

  for (const store of STORES.filter((name) => !["banks", "planCompletions", "cards", "investmentProducts"].includes(name))) {
    if (!Array.isArray(backup.data[store])) {
      throw new Error(`Backup is missing the ${store} collection.`);
    }
  }

  for (const store of STORES) {
    const records = backup.data[store] || [];
    if (!Array.isArray(records)) throw new Error(`The ${store} collection is invalid.`);
    const ids = new Set();
    for (const record of records) {
      if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.id !== "string" || !record.id.trim()) {
        throw new Error(`The ${store} collection contains an invalid record.`);
      }
      if (ids.has(record.id)) throw new Error(`The ${store} collection contains duplicate IDs.`);
      ids.add(record.id);
    }
  }

  if (!backup.data.settings.some((record) => record.id === "app")) {
    throw new Error("Backup is missing application settings.");
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
    const hasPfCategory = categories.some((category) => category.id === "inv-pf");
    if (!hasPfCategory) {
      await putOne("categories", defaultCategories.find((category) => category.id === "inv-pf"));
    }
  }
  if (Number(existingSettings?.bankDirectoryVersion || 0) < BANK_DIRECTORY_VERSION) {
    const bankIds = new Set((await getAll("banks")).map((bank) => bank.id));
    for (const bank of defaultBanks) {
      if (!bankIds.has(bank.id)) await putOne("banks", bank);
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
