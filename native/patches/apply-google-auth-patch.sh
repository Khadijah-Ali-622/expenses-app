#!/bin/sh
# Re-apply the Drive-scope access-token fix after npm install.
# The upstream plugin fetches an access token with only "profile email",
# which cannot call the Drive API. This copy requests the configured scopes.
set -e
DEST="node_modules/@codetrix-studio/capacitor-google-auth/android/src/main/java/com/codetrixstudio/capacitor/GoogleAuth/GoogleAuth.java"
SRC="patches/GoogleAuth.java"
cd "$(dirname "$0")/.."
if [ -f "$DEST" ] && [ -f "$SRC" ]; then
  cp "$SRC" "$DEST"
  echo "Applied GoogleAuth Drive-scope patch"
else
  echo "GoogleAuth plugin or patch missing; skipped"
fi
