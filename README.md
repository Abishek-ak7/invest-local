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
- **Clear all data** asks for two confirmations, clears every user-created record, and restores the reusable default categories and application settings.

Backup JSON is readable and is not encrypted. Keep it in a secure location.

## Customize categories and allocation

Open **More → Settings**. Investment categories, expense categories, and account types can be added, renamed, or deleted. A category that is currently used cannot be deleted until its items are reassigned. When adding an account, account types appear as a vertical icon list, and the saved account keeps its type icon.

Investment categories store both target and current actual amounts. Cash, Bonds, Foreign Stocks, and ETFs are separate categories so each allocation can be tracked independently. Existing combined Foreign Stocks / ETFs amounts remain under Foreign Stocks after migration, while the new ETFs category starts at zero. The app divides each target amount by the total target and each actual amount by the total actual to calculate both allocation sets dynamically. The dashboard shows separate target and actual donut charts with totals, labeled horizontal bars, icons, INR amounts, percentages, and screen-reader descriptions. A paired-bar comparison highlights each category's positive or negative variance. The Investments page compares both amounts and percentages in a table. Its **Edit targets** button opens a focused editor containing only investment categories, without unrelated expense or account settings. Chart colors are assigned automatically.

## Monthly checklist and streaks

Open **More → Monthly plan** to create and track recurring transfer or investment tasks. Select a month and mark each item complete. Completed entries are retained per month and consecutive completions build a streak. Every plan item can be added, edited, or deleted.

## Cards and investment products

- **More → Cards** tracks current and future cards, their linked bank, intended benefit, and a selectable purpose icon. Existing cards without a selected icon receive one automatically from their name or purpose.
- **More → Investment plan** tracks funds, ETFs, stocks, metals, debt, cash, crypto, tickers, charges, monthly amounts, exposure, and status.

Both sections provide full add, edit, and delete controls.

## Liabilities

Open **More → Net Worth & Liabilities** to track loans, credit-card balances, EMIs, and other debts. Enter the principal, annual interest rate, duration, and whether interest uses a reducing balance or fixed/flat rate. The app calculates the corresponding monthly EMI, total interest, and total payable. Each liability also records its type, lender, amount paid, remaining payable, start date, expected end date, and notes. The liability area summarizes total payable, total paid, remaining debt, combined monthly payments, and total interest.

Expense categories also carry editable monthly plan amounts. The app includes reusable investment, expense, and account-type categories, but starts without personal accounts, plans, goals, cards, holdings, transactions, liabilities, or investment products.

## Customize the dashboard and appearance

Open **More → Settings** to:

- show or hide dashboard cards;
- select light, dark, or system theme;
- choose an accent color;
- change the display currency.

The moon/sun button in the top bar switches directly between white and dark themes from any page. The selected theme is saved on the device.

## Modify the UI

- `index.html` contains the application shell, navigation, dialog, and metadata.
- `styles.css` contains responsive layout, themes, cards, charts, forms, and navigation styles.
- `js/app.js` contains view rendering, event handling, forms, and CRUD workflows.
- `js/db.js` is the only IndexedDB access layer and contains default categories and application settings.
- `js/calculations.js` contains reusable financial calculations.
- `service-worker.js` defines the offline application-shell cache.
- `manifest.json` defines installable PWA metadata.

When adding a new application-shell file, also add it to `APP_SHELL` in `service-worker.js` and increment `CACHE_NAME` so existing installations receive the update.
