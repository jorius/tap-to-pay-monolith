#!/usr/bin/env bash
# Builds one role-locked APK (one role per APK, design Builds frame) into dist/ and installs it on the role's phone:
#   scripts/build-apk.sh vendor|buyer [debug|release] [api-url]
# A debug APK loads its JavaScript from Metro (npx expo start + adb reverse tcp:8081 tcp:8081); a release APK
# carries its bundle and needs no laptop. Only arm64-v8a is built, which every Android 15/16 phone runs.
# api-url replaces .env's EXPO_PUBLIC_API_URL for this build. A release APK needs https, because Android blocks plain
# http outside debug builds: forward port 4000 publicly (VS Code Ports panel, ngrok, cloudflared) and pass that URL.
set -euo pipefail

role=${1:-}
variant=${2:-debug}
api=${3:-}
case "$role" in vendor | buyer) ;; *) echo "usage: scripts/build-apk.sh vendor|buyer [debug|release] [api-url]" >&2; exit 1 ;; esac
case "$variant" in debug) task=assembleDebug ;; release) task=assembleRelease ;; *) echo "variant must be debug or release" >&2; exit 1 ;; esac
case "$api" in '' | http://* | https://*) ;; *) echo "api-url must start with https:// (or http:// for debug)" >&2; exit 1 ;; esac

cd "$(dirname "$0")/.."
# Expo reads .env without overriding what the shell already set, so an exported URL wins in the bundle.
if [ -n "$api" ]; then export EXPO_PUBLIC_API_URL=$api; fi
# The last EXPO_PUBLIC_API_URL line of .env wins, as in Expo; quotes, spaces and Windows line ends are dropped.
url=${EXPO_PUBLIC_API_URL:-$(sed -n 's/^EXPO_PUBLIC_API_URL=//p' .env 2>/dev/null | tail -n 1 | tr -d "\"' \r" || true)}
if [ "$variant" = release ]; then
  case "$url" in https://*) echo "API URL in the bundle: $url" ;; *) echo "a release APK needs an https API URL, got \"$url\"" >&2; exit 1 ;; esac
  export EXPO_PUBLIC_API_URL=$url
else
  echo "debug APK: the API URL comes from the Metro you start (npx expo start reads .env)"
fi
# Needed at prebuild (name, package) and again in gradle, where expo-constants embeds extra.role.
export EXPO_PUBLIC_APP_ROLE=$role
CI=1 EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$task" -PreactNativeArchitectures=arm64-v8a --console=plain)

mkdir -p dist
out="dist/paynela-$role-$variant.apk"
cp "android/app/build/outputs/apk/$variant/app-$variant.apk" "$out"
echo "$out"

# Installs on the role's phone, keeping the app's data (-r): VENDOR_DEVICE or BUYER_DEVICE (an adb serial, from the
# shell or .env) picks it, else the only phone connected. Each role needs its own phone: both apps on one phone claim
# the same NFC AID, so taps would bring back Android's app chooser.
key=$(printf '%s_DEVICE' "$role" | tr '[:lower:]' '[:upper:]')
serial=${!key:-$(sed -n "s/^$key=//p" .env 2>/dev/null | tail -n 1 | tr -d "\"' \r" || true)}
if ! command -v adb >/dev/null; then
  echo "adb not found: install $out yourself"
  exit 0
fi
if [ -z "$serial" ]; then
  devices=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  count=$(printf '%s' "$devices" | grep -c . || true)
  if [ "$count" -ne 1 ]; then
    echo "not installed: $count phones connected. Set $key=<serial> in .env (adb devices lists them)"
    exit 0
  fi
  serial=$devices
fi
echo "installing on ${serial}…"
adb -s "$serial" install -r "$out" || {
  echo "install failed. If adb says INSTALL_FAILED_UPDATE_INCOMPATIBLE, uninstall the old app first (it clears its data):" >&2
  echo "  adb -s $serial uninstall co.inteligenciaartesanal.taptopay.$role" >&2
  exit 1
}
