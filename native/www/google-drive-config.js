/* =============================================================================
 * GOOGLE DRIVE BACKUP CONFIG
 * -----------------------------------------------------------------------------
 * Leave these values empty ("") to hide the working backup controls and show
 * "Google Drive backup isn't set up yet". The rest of the app stays local and
 * offline, with no Google sign-in and no network calls for Drive.
 *
 * To enable backup, create OAuth client IDs and paste them below.
 * Step-by-step instructions: SETUP-GOOGLE-DRIVE.md
 * ============================================================================= */

window.HISAB_GOOGLE_DRIVE_CONFIG = {
  /* Web OAuth client ID (used by Google Identity Services in a browser, and as
     the server / web client ID for the Android Google Auth plugin). */
  webClientId: "",
  /* Android OAuth client ID. Optional in this file — Android matches the app
     by package name com.hisab.expenses plus the release SHA-1. You still need
     to create that Android client in Google Cloud (see the setup guide). */
  androidClientId: ""
};
