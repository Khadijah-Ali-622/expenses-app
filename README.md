# Expenses

A personal expenses manager (PKR by default): transactions, budgets, accounts, categories, recurring entries, reports, PIN lock, CSV/JSON export, optional Firebase login + cloud sync, and optional Google Drive backup.

- Web app: open `index.html` in a browser.
- Android: Capacitor project in `native/` (`cd native && npm install && npx cap sync android`, then build with Gradle).
- Cloud sync setup: see `SETUP-FIREBASE.md`.
- Google Drive backup setup: see `SETUP-GOOGLE-DRIVE.md`.
- Release signing: put `keystore.properties` and the keystore in `native/android/` (not committed).
