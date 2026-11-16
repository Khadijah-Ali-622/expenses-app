# Google Drive backup

Expenses never signs in to Google Drive and does not use Google Cloud. Backup works through your phone’s own share sheet, or as a downloaded file in a browser.

The backup file is a JSON snapshot of the ledger on this device (accounts, transactions, budgets, rules, settings, and the hashed PIN). It is **not encrypted**. Treat it like a copy of your ledger.

## Back up

1. Open **More → Settings**.
2. Under **Google Drive backup**, tap **Back up to Google Drive**.
3. In the share sheet, choose **Save to Drive**, then the Gmail account you want.
4. If Save to Drive is not listed, install the Google Drive app, or pick Files / Downloads and upload the JSON file to Drive yourself.

On a computer or in a browser, the app tries the system share dialog. If the browser cannot share a file, it downloads `expenses-backup-YYYY-MM-DD-HHmm.json` instead. You can then upload that file to Drive.

## Restore

1. In Settings, tap **Restore from backup file**.
2. Pick the JSON file. On Android you can choose Google Drive in the file picker.
3. Confirm. The app replaces the data on this device and reloads.

You can also still use **Export JSON backup** and **Import JSON backup** under Data for a local copy.

## Reminder

Set the reminder to **Weekly** or **Monthly** if you want a gentle banner when you open the app and your last backup is older than that. The app cannot upload on its own, because it has no access to your Google account.

## What this does not do

- It does not replace optional Firebase login and cloud sync. You can use either, both, or neither.
- The app does not get access to your Google account or the rest of your Drive.
- Uninstalling the app does not delete files you already saved in Drive.
