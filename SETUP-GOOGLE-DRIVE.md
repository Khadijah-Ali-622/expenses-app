# Set up Google Drive backup

Expenses already works as a **local-only** app, including the existing CSV / JSON export on the device. Follow this if you want optional backup to a hidden folder in *your* Google Drive.

Nothing here publishes the app or the OAuth consent screen to production. You will create a Google Cloud project and OAuth clients for *your* copy of the app. Until you paste a Web client ID into `google-drive-config.js`, Settings shows “Google Drive backup isn't set up yet” and the rest of the app stays offline as before.

The app only asks for the `drive.appdata` scope. That lets it create and read files in its own hidden app-data folder. It cannot see the rest of your Drive.

Backups are **not encrypted** beyond Google’s normal protection of your account. Each file is a JSON snapshot of the ledger on that device (including the PIN hash and settings). Keep the Google account you sign in with private.

## 1. Create a Google Cloud project

1. Open [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with a Google account you control.
2. Click the project picker at the top → **New project**.
3. Name it something like `Hisab Expenses`, and create it.
4. Make sure the new project is selected.

## 2. Turn on the Google Drive API

1. Open [APIs & Services → Library](https://console.cloud.google.com/apis/library).
2. Search for **Google Drive API**.
3. Open it and click **Enable**.

## 3. Configure the OAuth consent screen (External, Testing)

1. Open [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. If you are asked to pick a user type, choose **External**, then **Create**.
3. Fill in the app name (`Expenses`), a user support email (your Gmail is fine), and a developer contact email. Save and continue.
4. On the **Scopes** page, click **Add or remove scopes**. Add:

   ```
   https://www.googleapis.com/auth/drive.appdata
   ```

   Save and continue.
5. On the **Test users** page, add the Gmail address you will use to sign in (and any other accounts you want to test with). While the consent screen is in **Testing**, only these accounts can sign in.
6. Save and go back to the dashboard. Leave the publishing status as **Testing** until you are ready to go through Google’s verification.

### 7-day re-sign-in while in Testing

While the consent screen is in Testing, Google expires the grant after **7 days**. You will need to sign in again to back up or restore after that. This limit goes away only if you later publish the app and, if Google asks, complete OAuth verification. You do not need to publish anything now.

## 4. Create a Web OAuth client

1. Open [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Expenses web`.
4. Under **Authorised JavaScript origins**, add every origin where the app will run, for example:

   - `http://localhost`
   - `http://127.0.0.1`
   - `https://expenses.app` (this is the hostname used by the Android WebView; it is a placeholder, not a site you have to own)
   - any HTTPS site where you host the web app (for example a GitHub Pages URL)

   You can leave **Authorised redirect URIs** empty for the popup / token sign-in used in a browser.
5. Create the client and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Create an Android OAuth client

This is required for sign-in inside the installed Android app. Google Identity Services popups usually do not work in the Capacitor WebView, so the app uses the [Capacitor Google Auth](https://www.npmjs.com/package/@codetrix-studio/capacitor-google-auth) plugin on Android.

The Android project already includes the `@codetrix-studio/capacitor-google-auth` plugin (Capacitor 6). A small patch under `native/patches/` makes the access token include the `drive.appdata` scope (upstream would only request profile and email). `npm install` inside `native/` re-applies that patch via a postinstall script.

1. Credentials → **Create credentials** → **OAuth client ID**.
2. Application type: **Android**.
3. Name: `Expenses android`.
4. Package name: `com.hisab.expenses`
5. SHA-1 certificate fingerprint (from the existing release / upload keystore):

   ```
   1B:3E:AB:A5:08:95:C9:5E:0F:AA:BF:15:86:3A:23:C3:B4:1E:04:00
   ```

6. Create the client. You can also add the SHA-256 if a screen asks for it:

   ```
   B6:7C:B8:04:1A:86:1C:FE:B3:E0:4C:7D:64:B8:7A:2B:97:54:8A:A3:A3:70:D2:28:4E:7A:00:9D:AA:D5:F3:49
   ```

Do not put the keystore password in this file, in Play listings, or in any shared document.

## 6. Paste the client IDs into the app

1. Open `google-drive-config.js` and paste the **Web** client ID into `webClientId`. You can paste the Android client ID into `androidClientId` as a reminder; the Android app matches your package name and SHA-1 automatically.
2. Open `native/capacitor.config.json`. Under `plugins.GoogleAuth`, set `serverClientId` to the **same Web client ID**.
3. Open `native/android/app/src/main/res/values/strings.xml` and set `server_client_id` to that same Web client ID. The Android plugin reads this value.
4. Rebuild the app (or refresh the web page). If the Web client ID is still blank, Settings will keep saying the feature is not set up, and everything else still works offline.

Example of the config file after pasting:

```js
window.HISAB_GOOGLE_DRIVE_CONFIG = {
  webClientId: "1234567890-abcdef.apps.googleusercontent.com",
  androidClientId: "1234567890-android.apps.googleusercontent.com"
};
```

## 7. Try it

1. Open Expenses (web or the Android app) and go to **More → Settings**.
2. Under **Google Drive backup**, tap **Sign in with Google** and choose a test-user account.
3. Tap **Back up now**. You should see a last-backup time and a file in the list.
4. Use **Daily** or **Weekly** if you want an automatic backup the next time you open the app after that interval. Phones do not reliably run this in the background at night, so it runs when you open the app.
5. **Restore** asks for confirmation, then replaces the ledger on this device and reloads the app. The newest 14 backups are kept; older ones are removed after a successful backup.

In a desktop browser, sign-in uses Google Identity Services (a Google popup). In the Android app, it uses the native Google account picker via the Capacitor plugin.

If sign-in fails in a browser, confirm the page’s origin is listed under Authorised JavaScript origins, and that your Google account is a test user. If it fails in the Android app, confirm the SHA-1, package name, Web client ID in `server_client_id`, and that you rebuilt after pasting the IDs.

## What this does not do

- It does not replace the optional Firebase login and cloud sync. You can use either, both, or neither.
- It does not give the app developer access to your Drive. Files live in your own Google account’s hidden app-data folder.
- It does not encrypt the backup file. Treat the Google account like a copy of your ledger.
