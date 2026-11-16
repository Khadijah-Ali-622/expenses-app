# Data safety, content rating, and target audience

Use this as a worksheet when filling in Play Console. Answers reflect this version of the app (1.3.0): local-first storage, with **optional** email/Google sign-in and cloud sync through the developer’s Firebase project (Authentication + Cloud Firestore). A backup the user chooses to save (for example through the system share sheet → Save to Drive) is a file they keep themselves; the app does not access Google Drive or upload that file. Recheck if you later add analytics, ads, or other data uses.

Sources to reopen if a form wording has changed: Play Console → App content → Data safety, and the [Data safety help article](https://support.google.com/googleplay/android-developer/answer/10787469).

## Data safety form

### Overview
- **Does your app collect or share any of the required user data types?** Yes. When a user signs in for cloud sync, the app sends account and expense data to Google Firebase in the developer’s project so the ledger can sync. If the user never signs in, that data stays on the device and is not collected through this feature. A backup the user saves through the system share sheet (for example Save to Drive) or a file export is not collected or uploaded by the app; the user chooses where the file goes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS to Firebase, when the user signs in or syncs).
- **Do you provide a way for users to request that their data is deleted?** Yes. Signed-in users can use Settings → Delete cloud data to remove the Firestore ledger. They can also clear the on-device ledger (Settings → Reset all data) or uninstall the app. Backup files the user saved themselves (including any they put in Google Drive) are not deleted automatically; the user can remove those files where they stored them. To delete the Firebase Authentication account itself, they should contact the developer email on the store listing. Declare that users can request deletion, and that in-app deletion is available for the synced ledger.
- **Has your app received an independent security review, such as MAGA or another audit?** No. (Optional; not required for this kind of app.)

### Data types to declare as collected

Declare these types as **collected**, used for **App functionality**, **not sold**, and **optional** (the user can use the app without signing in). Tick **encrypted in transit**. Users can request deletion as described above.

- **Personal info → Email address** — collected when the user signs in with email and password, or with Google. Stored in Firebase Authentication. Used to create and recognise the account (and to send a password-reset email if they ask for one).
- **Personal info → User IDs** — the Firebase Authentication user ID assigned at sign-in. Used to store that user’s Firestore data under `users/{uid}`.
- **Financial info → Other financial info** — the user-entered ledger that is synced when they are signed in to Firebase: accounts and opening balances, categories, transactions (amounts, dates, notes, payment method), budgets, and recurring rules. This is not bank-account access, purchase history from a store, or payment-card processing. Do not declare a Drive backup or JSON/CSV export as data the app collects or shares; the user saves that file through the system share sheet or a download.

Do **not** declare as collected:

- Name or additional Google profile fields, unless you later add them (this app only needs the email Firebase already provides for sign-in)
- The 4-digit PIN in plain form (only a one-way hash is stored, and it is not sent to Firebase). Note: a backup file the user saves themselves *does* include the hashed PIN and display settings, because it is a full snapshot of on-device data, but that file is not uploaded by the app
- Currency or dark mode as data you collect for Firebase sync (these stay on the device and are not synced to Firebase)
- Location, photos, contacts, messages, files, calendar, app activity, web browsing, crash logs, performance, device IDs, or advertising IDs
- Credit-card numbers or government IDs (the app does not ask for these)

### Sharing

Data used for login and sync is sent to **Google Firebase** (Authentication and Cloud Firestore), which is a Google service the developer uses to host accounts and the cloud ledger.

A backup the user saves through the system share sheet (for example Save to Drive) is not an upload performed by the app, and should not be declared as data shared with Google Drive. The user chooses the destination.

In the form:

- Treat Firebase/Google as the destination for this data.
- Purpose: App functionality (account and sync). Not advertising. Not sold.
- Play may let you treat a processor as a “service provider” rather than as “data shared with a third party,” if your use matches the help article. If you are unsure, the conservative and accurate path is to declare that this data is shared with Google for app functionality, and to say so in the privacy policy (which this package already does).

The developer (you) can also access data in the Firebase Console of the project you created. That is not a separate “share,” but you are the data controller for that project.

### Security practices
- Local copy: the on-screen ledger is stored in the app’s local storage on the device and remains usable offline.
- Cloud copy (only after Firebase sign-in): stored in the developer’s Firebase project, in transit over HTTPS.
- Optional backup file: created on the device and handed to the system share sheet or downloaded. The app does not upload it. The file is not encrypted.
- An optional PIN is stored as a one-way hash on the device only.
- The app does not use advertising ID, Firebase Analytics, Crashlytics, or similar.
- Android’s own device backup, if the user has it enabled, may include app data in *their* backup. That is a system feature, not Expenses cloud sync. You do not receive that system backup as the app developer.

### INTERNET permission
The release bundle declares `INTERNET` so that optional Firebase login and sync can work. After you upload the AAB, confirm in Play Console → App bundle explorer that INTERNET is declared, and that the Data safety form and privacy policy match this (they should). The app still works as a local ledger when the user is signed out, offline, or if Firebase has not been configured yet. Share-sheet backup does not require the app to use the Internet permission.

### What this app is not
Do not complete questionnaires as if Expenses were a bank, wallet, payment, lending, or crypto app. It does not move money, open accounts at a financial institution, or process card payments. Synced “financial info” is only the user’s own typed-in expense records.

## Content rating (IARC / Play questionnaire)

Play routes you through the International Age Rating Coalition questionnaire. Answer truthfully; typical answers for this app:

| Topic | Answer |
| --- | --- |
| App type | Not a game (it is a utility / finance tool) |
| Violence, blood, or gore | No |
| Sexual content or nudity | No |
| Profanity or crude humour | No |
| Controlled substances (alcohol, tobacco, drugs) | No |
| Gambling or simulated gambling | No (tracking spending is not gambling) |
| Horror or frightening content | No |
| User-generated content that others can see | No (a signed-in ledger is private to that user’s account, not a public feed) |
| Social features, chat, or sharing with strangers | No |
| Digital goods or in-app purchases | No (the app is free and has no store) |
| Location sharing | No |
| Personal information collected from users | Yes — email (and a user ID) if the user creates an account or signs in. There is no collection if they never sign in. Answer the form in line with that. |
| Ads | No |
| Appeals to children | No |

Expected outcome: an “Everyone” / low-age rating (for example PEGI 3 or the local equivalent), unless the account-and-email question changes the result in your region. The form, not this sheet, issues the official rating.

## Target audience and news apps

- **Primary target age:** 18 and over (adults managing personal or household money).
- **This app is not designed for children.** Do not enrol it in Designed for Families or Teachers.
- **Target age groups in Play Console:** select 18 and over only, unless you have a reason to include 13–15 or 16–17. The content is not adult-only, but the product is a personal finance tool.
- **News app?** No.
- **Store presence:** standard, not a “kids” listing.

If Play asks whether the app is appealing to children, answer no.
