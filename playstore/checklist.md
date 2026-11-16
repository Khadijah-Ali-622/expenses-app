# Remaining steps you must do (nothing was uploaded)

This folder is a package to take into Google Play Console. No developer account was created and nothing was submitted. Complete the steps below yourself.

Official guides (re-check if a date or number has changed):

- Get started with Play Console — https://support.google.com/googleplay/android-developer/answer/6112435
- Target API level — https://support.google.com/googleplay/android-developer/answer/11926878
- Testing requirements for new personal accounts — https://support.google.com/googleplay/android-developer/answer/14151465
- Play App Signing — https://support.google.com/googleplay/android-developer/answer/9842756
- Data safety — https://support.google.com/googleplay/android-developer/answer/10787469

## 1. Back up the upload key
Copy `/workspace/expenses-app/native/android/app/expenses-release.keystore` off this machine and store it safely. Read `keystore-info.txt`. Without this key you cannot reliably update the app on Play.

## 2. Create a Play Console developer account
1. Use a Google Account you control, and be at least 18.
2. Open the [Play Console sign-up page](https://play.google.com/console/signup) and accept the Developer Distribution Agreement.
3. Pay the **US$25 one-time registration fee** (amount confirmed in Google’s “Get started with Play Console” help article). Cards: Visa, Mastercard, American Express, Discover (US only), Visa Electron (outside the US). Prepaid cards are not accepted. The fee is charged once per developer account, not per app. If identity checks fail, Google says the fee is not refunded.
4. Choose an account type:
   - **Personal** — in your own name. Required closed testing (step 5) applies to personal accounts created after 13 November 2023.
   - **Organization** — for a registered business (D-U-N-S number and, typically, a verified website). The 12-tester closed-test rule does not apply in the same way, but organisation verification takes longer.
   You must decide which type fits you before or during sign-up.

## 3. Complete identity verification
Play will ask you to verify your identity. For a personal account this usually means a government photo ID and a payment card in your legal name. Organisation accounts need business documents. Finish this before you expect to publish.

Personal accounts must also **verify access to a real Android device** with the Play Console mobile app before they can publish. See “Device verification requirements for developer accounts” in Play Console Help.

## 4. Host the privacy policy
Play needs a public **HTTPS** privacy policy URL.

1. Open `privacy-policy.html` and add a real contact email in the Contact section if you want one (otherwise the page points people to the email on your store listing).
2. Host the file, then paste the URL into Play Console.

Free options that work well:

- **GitHub Pages** — create a public repository, put this HTML in it (for example as `index.html` or `privacy.html`), enable Pages in the repo settings, and use the `https://<user>.github.io/<repo>/` URL.
- **Cloudflare Pages** or **Netlify** — drag-and-drop the HTML, get an HTTPS URL.
- Your own domain, if you have one.

Do not use a file:// link or a private Drive file. The URL must load for reviewers without signing in.

## 5. Create the app and enrol in Play App Signing
1. In Play Console, create a new app named **Expenses**, default language English (you can add Urdu later if you want).
2. When you first upload a bundle, enrol in **Play App Signing**. Let Google generate and hold the *app signing* key. The keystore in this project is your *upload* key — keep using it for every future AAB.
3. Upload `expenses-release.aab` (this folder). This first upload usually goes to a testing track, not straight to production.

## 6. Closed testing (required for new personal accounts)
If your **personal** developer account was created after 13 November 2023, you cannot go to production until you:

1. Finish app setup (listing, policy, questionnaires — at least enough for the test track).
2. Start a **closed** test (Test and release → Testing → Closed testing). An **internal** test does **not** count.
3. Invite testers by email or a Google Group, and send them the **opt-in link**. Invited is not enough; they must tap the link and stay opted in.
4. Have **at least 12 testers opted in continuously for 14 days**. If someone leaves and rejoins, their 14 days start again. Have a few extras so you do not drop below 12.
5. Tell testers to leave the app installed and open it occasionally. Keep notes of feedback — you will be asked about the test when you apply.
6. On or after day 14, with 12 testers still opted in, open the Dashboard and **Apply for production**. Google reviews the application (often about a week). Approval is separate from meeting the minimums.

Organisation accounts and personal accounts created on or before 13 November 2023 are not under this 12-for-14-days rule, but a closed or internal test is still a good idea.

Do not buy fake testers.

## 7. Complete the store listing and questionnaires
Use the files in this folder:

- `listing.md` — name, short and full description, category, tags
- `graphics/` — 512×512 icon, 1024×500 feature graphic, and phone screenshots (1080×1920)
- `privacy-policy.html` — already hosted, URL pasted into Console
- `data-safety.md` — Data safety answers, content-rating answers, target-audience notes

Also set:

- Contact email
- Developer name
- Pricing (this app is built as a free app with no in-app purchases)
- Countries / regions
- Content rating questionnaire (submit and wait for the official rating)
- Target audience: 18+; not Designed for Families
- Data safety: declare email, user ID, and expense data stored in Firebase when the user signs in (see data-safety.md). Host the updated privacy policy.

## 8. After production access, submit for review
Once production is unlocked, create a production release from the same AAB (or a later version), answer any remaining declarations, and submit for review. First reviews can take several days.

When you later ship an update, bump `versionCode` (and usually `versionName`) in `native/android/app/build.gradle`, rebuild the bundle, and sign with the **same** upload keystore.

## What you still need to decide
- Personal vs organisation Play account
- The public developer name and contact email (and whether to put that email in the privacy policy)
- Where you will host the privacy policy
- Which countries to distribute in
- Whether to add an Urdu store listing
- Who your 12 closed testers will be (if you use a new personal account)
