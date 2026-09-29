const DB_NAME = "my-wealth";
const DB_VERSION = 2;

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
  }
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
