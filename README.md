# Expenses

A personal expenses manager (PKR by default): transactions, budgets, accounts, categories, recurring entries, reports, PIN lock, CSV/JSON export, and optional Firebase login + cloud sync.

- Web app: open `index.html` in a browser.
- Android: Capacitor project in `native/` (`cd native && npm install && npx cap sync android`, then build with Gradle).
- Cloud sync setup: see `SETUP-FIREBASE.md`.
- Release signing: put `keystore.properties` and the keystore in `native/android/` (not committed).
