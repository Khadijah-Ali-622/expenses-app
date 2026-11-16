/* =============================================================================
 * FIREBASE CONFIG
 * -----------------------------------------------------------------------------
 * Leave these values empty ("") to run the app in local-only mode — exactly as
 * it works today, with no cloud, no login, and no network calls.
 *
 * To enable login and sync, create a Firebase project and paste the web app
 * config values below. Step-by-step instructions: SETUP-FIREBASE.md
 * ============================================================================= */

window.HISAB_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* Optional. For local emulator testing only. Keep null for a real project. */
window.HISAB_FIREBASE_EMULATOR = null;
/* Example:
window.HISAB_FIREBASE_EMULATOR = {
  authHost: "http://127.0.0.1:9099",
  firestoreHost: "127.0.0.1",
  firestorePort: 8080
};
*/
