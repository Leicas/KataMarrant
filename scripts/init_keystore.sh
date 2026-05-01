#!/usr/bin/env bash
# One-time release keystore generation for KataMarrant.
# Wraps the long keytool invocation so it can't be mangled by terminal line wrap.
#
# Usage:
#   bash scripts/init_keystore.sh
#
# It will prompt twice for the keystore password, then once for the key
# password (press Enter at the key-password prompt to reuse the keystore one).
# After it finishes you'll have ~/keystores/katamarrant-release.jks.

set -euo pipefail

KEYTOOL='/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe'
KEYSTORE_DIR="$HOME/keystores"
KEYSTORE_FILE="$KEYSTORE_DIR/katamarrant-release.jks"
ALIAS="katamarrant"
DNAME="CN=Antoine Weill-Duflos, O=Personal, C=FR"

if [[ ! -x "$KEYTOOL" ]]; then
    echo "error: keytool not found at $KEYTOOL" >&2
    exit 1
fi

if [[ -f "$KEYSTORE_FILE" ]]; then
    echo "error: keystore already exists at $KEYSTORE_FILE" >&2
    echo "       (delete it manually if you really want to start over)" >&2
    exit 1
fi

mkdir -p "$KEYSTORE_DIR"

echo "Pick a password of AT LEAST 6 characters (Play needs it long; you'll"
echo "save it in your password manager). It will be asked twice."
echo

if ! "$KEYTOOL" -genkey -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 9125 \
    -dname "$DNAME"; then
    echo
    echo "error: keytool failed — re-run this script and try again." >&2
    exit 1
fi

if [[ ! -f "$KEYSTORE_FILE" ]]; then
    echo "error: keytool returned 0 but no keystore was written." >&2
    exit 1
fi

echo
echo "Keystore created at: $KEYSTORE_FILE"
echo "Alias:               $ALIAS"
echo
echo "Next: tell Claude the keystore password (or paste it yourself into key.properties)."
