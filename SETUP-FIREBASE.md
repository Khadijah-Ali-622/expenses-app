# Set up login and cloud sync (Firebase)

Expenses already works as a **local-only** app. Follow this if you want optional sign-in and sync across devices. You do not need to pay — the Firebase Spark (free) plan is enough to start.

Nothing here publishes the app or creates a Google Play account. You will create a Firebase project, which is a Google Cloud / Firebase console project for *your* copy of the app.

## 1. Create a free Firebase project

1. Open [https://console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account you control.
2. Click **Add project** (or **Create a project**).
3. Give it a name, for example `Hisab Expenses`.
4. You can turn **Google Analytics** off — this app does not use it.
5. Create the project and wait until it is ready.

## 2. Add a Web app and copy the config

1. In the project overview, click the **Web** icon (`</>`), or **Add app** → Web.
2. Register a nickname such as `expenses-web`. You do **not** need Firebase Hosting.
3. Firebase shows a config object that looks like this:

```js
{
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…"
}
```

4. Open `firebase-config.js` in this folder and paste those six values in place of the empty `""` strings. Leave `window.HISAB_FIREBASE_EMULATOR` as `null`.
5. Save the file. If the values are missing or blank, the app stays in local-only mode on purpose.

## 3. Turn on Email/Password and Google sign-in

1. In the Firebase console, open **Build → Authentication** (or **Product catalogue → Authentication**).
2. Click **Get started** if you are asked to.
3. Open the **Sign-in method** tab.
4. Enable **Email/Password** (the basic email provider is enough; you do not need email-link sign-in).
5. Enable **Google**. Set a support email (your Google account is fine) and save.

### Authorised domains (needed for Google sign-in in a browser)

Under Authentication → Settings → **Authorised domains**, add every site where people will open the web app (for example your GitHub Pages or other HTTPS host). `localhost` is usually already listed for testing.

**Android note:** the packaged app loads the UI in a WebView at `https://expenses.app` (a placeholder hostname, not a site you own). Google sign-in often fails there (popup / authorised-domain limits). **Email and password sign-in is the reliable path in the Android app.** Google sign-in is more reliable in a browser on a domain you added above. If you later want Google sign-in inside the APK, point Capacitor at a hostname you control, add that domain to Authorised domains, and rebuild.

## 4. Create Firestore and paste the security rules

1. Open **Build → Firestore Database**.
2. Click **Create database**.
3. Start in **production mode** (the rules file below will replace the default). Pick a region close to you and enable the database.
4. Open the **Rules** tab. Replace everything with the contents of `firestore.rules` in this folder, then **Publish**. The rules allow a signed-in user to read and write only their own `users/{their user id}` data — nobody else’s.

Optional but useful: in Firestore, turn on the database (it is on once created). Persistence on the device is already enabled in the app.

## 5. Add the Android app and the signing certificate

This step is required if you want **Google** sign-in related to the Android package. It is still good practice even if you mainly use email/password.

1. In Project overview, click **Add app** → **Android**.
2. Android package name: `com.hisab.expenses`
3. App nickname: `Expenses` (optional).
4. Paste this **SHA-1** (from the existing release/upload keystore used to sign the APK and AAB):

```
1B:3E:AB:A5:08:95:C9:5E:0F:AA:BF:15:86:3A:23:C3:B4:1E:04:00
```

5. Register the app. You can download `google-services.json` if Firebase offers it; this web-based app does not require that file to run, but keeping it in the Android project is harmless if you add it later.
6. You may also add the **SHA-256** (some Google Cloud OAuth screens ask for it):

```
B6:7C:B8:04:1A:86:1C:FE:B3:E0:4C:7D:64:B8:7A:2B:97:54:8A:A3:A3:70:D2:28:4E:7A:00:9D:AA:D5:F3:49
```

Do not put the keystore password in this file, in Play listings, or in any shared document.

## 6. Rebuild the app (or ask Grok to rebuild)

After `firebase-config.js` is filled in, the web copy at `index.html` will use your project as soon as you refresh (serve the folder over http(s); `file://` may limit Google sign-in popups).

To refresh the **Android APK** and Play **AAB**:

1. Copy the updated web files into the Capacitor project (`native/www`), including `index.html`, `firebase-config.js`, `js/`, `vendor/`, `pwa/`, and `sw.js`.
2. From `native/`, run `npx cap sync android`.
3. Build a debug-signed APK and a release AAB with the existing keystore, keeping `targetSdk` 36, `versionCode` 2, and `versionName` `1.1.0` (already set in this source). Output paths used previously:
   - APK: `/workspace/expenses-app/expenses.apk`
   - AAB: `/workspace/expenses-app/playstore/expenses-release.aab`

Or tell Grok: *Firebase config is filled in — please rebuild the Expenses APK and AAB.* Do not ask Grok (or anyone) to create public accounts or to upload the app for you unless you clearly want that.

## If something does not work

- **The app still says “local-only”** — `apiKey` and `projectId` in `firebase-config.js` are still empty, or you are looking at an APK built before you pasted the config. Rebuild after saving the file.
- **Email sign-in errors** — confirm Email/Password is enabled, and that you are using the same Firebase project as the config.
- **Google sign-in popup blocked or unauthorised domain** — use email/password, or add your real web domain under Authorised domains.
- **Data does not appear on a second device** — sign in with the same account, wait for the status chip to say Synced, or tap **Sync now**. The first time a device that already has local expenses meets a cloud copy, the app will ask whether to upload this phone or use the cloud copy.
- **PIN** — the PIN is only a lock on that device. It is not your cloud password and does not sync.

## Privacy reminder

Once Firebase is configured and people sign in, email addresses and expense data are stored in *your* Firebase project. Host the updated `playstore/privacy-policy.html` at a public HTTPS URL before you ship, and fill in Play’s Data safety form using `playstore/data-safety.md`.
