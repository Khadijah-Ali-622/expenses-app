# Expenses

A personal expenses manager (PKR by default): transactions, budgets, accounts, categories, recurring entries, reports, PIN lock, CSV/JSON export, optional Firebase login + cloud sync, and backup to a file you can save to Google Drive.

- Web app: open `index.html` in a browser.
- Android: Capacitor project in `native/` (`cd native && npm install && npx cap sync android`, then build with Gradle).
- Cloud sync setup: see `SETUP-FIREBASE.md`.
- Google Drive backup (share sheet / Save to Drive, no Google Cloud): see `SETUP-BACKUP.md`.
- Release signing: put `keystore.properties` and the keystore in `native/android/` (not committed).
