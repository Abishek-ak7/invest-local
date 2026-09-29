# My Wealth

My Wealth is a lightweight, offline-first personal finance Progressive Web App. It uses only HTML, CSS, vanilla JavaScript, IndexedDB, and a service worker. There is no backend, login, analytics, or tracking.

## Run locally

A PWA must be served over HTTP rather than opened directly as a file.

From this folder, use any local static server already installed on your computer. For example:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080` in Chrome or Edge. The app works without a build step or package installation.

## Install on Android

1. Host the folder on an HTTPS static host, or open it from a local HTTPS server reachable by the phone.
2. Open the site in Chrome on Android.
3. Open Chrome's menu and select **Add to Home screen** or **Install app**.
4. Launch **My Wealth** from the home screen.

After the first successful load, the application shell works offline. Financial data is always local to the browser profile.

## Data storage

Data is stored in the browser's IndexedDB database named `my-wealth`. The database contains separate stores for settings, accounts, investments, transactions, categories, goals, monthly plans, plan completion history, cards, investment products, liabilities, and net-worth history.

Clearing browser/site data or uninstalling the browser can remove this data. Export backups regularly.

## Backup and restore

Open **More → Settings → Data**:

- **Export backup** downloads every data store as a dated JSON file.
- **Import backup** validates and restores My Wealth V1 or V2 JSON backups, replacing current data.
- **Export CSV** downloads transactions and holdings in a spreadsheet-friendly format.
- **Clear all data** asks for two confirmations, clears every user-created record, and restores only the application settings.

Backup JSON is readable and is not encrypted. Keep it in a secure location.

## Customize categories and allocation

Open **More → Settings**. Investment categories, expense categories, and account types can be added, renamed, or deleted. A category that is currently used cannot be deleted until its items are reassigned.

Investment target percentages are editable category properties. The Investments page compares each target with the actual allocation but never recommends trades.

## Monthly checklist and streaks

Open **More → Monthly plan** to create and track recurring transfer or investment tasks. Select a month and mark each item complete. Completed entries are retained per month and consecutive completions build a streak. Every plan item can be added, edited, or deleted.

## Cards and investment products

- **More → Cards** tracks current and future cards, their linked bank, and intended benefit.
- **More → Investment plan** tracks funds, ETFs, stocks, metals, debt, cash, crypto, tickers, charges, monthly amounts, exposure, and status.

Both sections provide full add, edit, and delete controls.

Expense categories also carry editable monthly plan amounts. The app starts empty so accounts, categories, plans, goals, cards, and investment products can be entered manually.

## Customize the dashboard and appearance

Open **More → Settings** to:

- show or hide dashboard cards;
- select light, dark, or system theme;
- choose an accent color;
- change the display currency.

## Modify the UI

- `index.html` contains the application shell, navigation, dialog, and metadata.
- `styles.css` contains responsive layout, themes, cards, charts, forms, and navigation styles.
- `js/app.js` contains view rendering, event handling, forms, and CRUD workflows.
- `js/db.js` is the only IndexedDB access layer and contains default application settings.
- `js/calculations.js` contains reusable financial calculations.
- `service-worker.js` defines the offline application-shell cache.
- `manifest.json` defines installable PWA metadata.

When adding a new application-shell file, also add it to `APP_SHELL` in `service-worker.js` and increment `CACHE_NAME` so existing installations receive the update.
