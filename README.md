# My Wealth

My Wealth is a frontend-only, offline-first personal finance Progressive Web App. It uses HTML, CSS, vanilla JavaScript, IndexedDB, and a service worker. There is no backend, account connection, analytics, or tracking.

## Run locally

A PWA must be served over HTTP rather than opened directly as a file. Use any static file server or deploy the folder to a static HTTPS host. No build step or package installation is required.

## Install on Android

1. Host the folder on an HTTPS static host, or open it from a local HTTPS server reachable by the phone.
2. Open the site in Chrome on Android.
3. Open Chrome's menu and select **Add to Home screen** or **Install app**.
4. Launch **My Wealth** from the home screen.

After the first successful load, the application shell works offline. Financial data is always local to the browser profile.

## Data storage

Data is stored in the browser's IndexedDB database named `my-wealth`. The database contains separate stores for settings, accounts, investments, transactions, categories, goals, monthly plans, plan completion history, cards, investment products, liabilities, and net-worth history.

Clearing browser/site data or uninstalling the browser can remove this data. Export backups regularly.

## Spreadsheet updates

Open **More → Settings → Spreadsheet update**:

1. Select **Download template** and open the CSV in Excel.
2. Fill or copy rows using `Account`, `Investment`, `PF`, `Transaction`, or `Liability` as `RecordType`.
3. Set `Include` to `Yes` for every row to import. The sample rows remain ignored while set to `No`.
4. Keep each `ExternalId` stable between updates. Use an included Account row's `ExternalId` in `AccountExternalId` to link holdings and transactions.
5. Save as CSV, select **Choose CSV**, review the validated counts, and apply the update.

The file is parsed entirely in the browser. Applying a valid file atomically replaces all records from the previous spreadsheet import while preserving records entered manually in the app. Imported rows are read-only and marked **Imported**. A file with missing columns, unknown categories, invalid values, unresolved account references, or duplicate IDs is rejected before data changes.

## Workbook editing

The normal Home, Investments, Expenses, Accounts, and More pages are read-only views. Select the grid button in the top bar or open **More → Workbook editor** to enter the only data-editing mode.

The full-screen workbook contains tabs for Accounts, Investments, Transactions, Liabilities, Goals, Plans, Plan Checks, Cards, Products, Categories, Banks, and Net Worth. Cell changes remain in one shared draft while switching tabs. Each sheet supports direct editing, native copy and paste, an active-cell value bar, typed number/date fields, reference dropdowns, row creation, duplication, and deletion.

**Save** validates and atomically commits every sheet while keeping the workbook open. **Save & exit** commits all sheets and returns to the read-only dashboard. **Exit** discards unsaved changes after confirmation. Invalid rows leave all existing app data unchanged.

The required columns are `Include`, `RecordType`, `ExternalId`, and `Name`. Dates use `YYYY-MM-DD`; numeric cells must not contain formulas. The template includes the optional columns and examples for balances, quantities, prices, current values, transactions, PF contributions, and liabilities. Files are limited to 10 MB.

## Bank directory

The workbook Accounts and Cards sheets use a bank dropdown seeded with 20 common Indian banks, including SBI, ICICI Bank, Tamilnad Mercantile Bank (TMB), Indian Overseas Bank (IOB), and DCB Bank. Each bank has a compact local logo mark, so the directory works offline and makes no external image requests.

Use the workbook **Banks** sheet to add a bank, choose its logo text and color, edit an existing entry, or remove an unused entry. Imported Account rows automatically link `Institution` values that match a bank's full name, abbreviation, or known alias.

## Backup and restore

Open **More → Settings → Data**:

- **Export encrypted backup** encrypts every data store in the browser with AES-256-GCM. The encryption key is derived from a password of at least 12 characters using PBKDF2-SHA-256 with 310,000 iterations. The password is never stored and cannot be recovered.
- **Import backup** unlocks encrypted `.wealth` backups and continues to support legacy V1 or V2 JSON backups.
- **Export CSV** downloads transactions and holdings in a spreadsheet-friendly but unencrypted format after a warning.
- **Export readable JSON** remains available for compatibility after an explicit warning.
- **Clear all data** asks for two confirmations, clears every user-created record, and restores the reusable default categories and application settings.

IndexedDB data is isolated to this browser profile but is not encrypted at rest by the app. Use a device screen lock and browser profile protection. The interface is hidden when the app moves into the background to reduce exposure in app-switcher previews. Static app resources are cached for offline use; financial records are never added to the service-worker cache.

Production hosting should also send the Content Security Policy from `index.html` as an HTTP response header, together with `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` on HTTPS deployments.

## Customize categories and allocation

Use the workbook **Categories** sheet to add, rename, or delete investment categories, expense categories, and account types. Account records select those types from a dropdown in the **Accounts** sheet.

Investment categories store both target and current actual amounts. Cash, Bonds, Foreign Stocks, and ETFs are separate categories so each allocation can be tracked independently. The app divides each target amount by the total target and each actual amount by the total actual to calculate both allocation sets dynamically. The dashboard and Investments page present the resulting allocations as read-only charts and comparisons. Chart colors are assigned automatically.

## Monthly checklist and streaks

Open **More → Monthly plan** to view recurring transfer or investment tasks and completion history. Edit tasks in the workbook **Plans** sheet and monthly completion records in **Plan Checks**.

## Cards and investment products

- **More → Cards** tracks current and future cards, their linked bank, intended benefit, and a selectable purpose icon. Existing cards without a selected icon receive one automatically from their name or purpose.
- **More → Investment plan** tracks funds, ETFs, stocks, metals, debt, cash, crypto, tickers, charges, monthly amounts, exposure, and status.

Edit both sections through the workbook **Cards** and **Products** sheets.

## Liabilities

Open **More → Net Worth & Liabilities** to view loans, credit-card balances, EMIs, and other debts. Liability records are edited in the workbook **Liabilities** sheet. The app calculates monthly EMI, total interest, and total payable from the principal, annual interest rate, duration, and reducing-balance or fixed/flat method. The read-only liability view summarizes total payable, total paid, remaining debt, combined monthly payments, and total interest.

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
- `js/spreadsheet.js` validates and normalizes local CSV imports.
- `service-worker.js` defines the offline application-shell cache.
- `manifest.json` defines installable PWA metadata.

When adding a new application-shell file, also add it to `APP_SHELL` in `service-worker.js` and increment `CACHE_NAME` so existing installations receive the update.
