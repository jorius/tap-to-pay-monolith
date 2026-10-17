#!/usr/bin/env bash
# Builds one role-locked APK (one role per APK, design Builds frame) into dist/:
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
url=${EXPO_PUBLIC_API_URL:-$(sed -n 's/^EXPO_PUBLIC_API_URL=//p' .env 2>/dev/null || true)}
if [ "$variant" = release ]; then
  case "$url" in https://*) echo "API URL in the bundle: $url" ;; *) echo "a release APK needs an https API URL, got \"$url\"" >&2; exit 1 ;; esac
else
  echo "debug APK: the API URL comes from the Metro you start (npx expo start reads .env)"
fi
# Needed at prebuild (name, package) and again in gradle, where expo-constants embeds extra.role.
export EXPO_PUBLIC_APP_ROLE=$role
CI=1 EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$task" -PreactNativeArchitectures=arm64-v8a --console=plain)

mkdir -p dist
out="dist/tap-to-pay-$role-$variant.apk"
cp "android/app/build/outputs/apk/$variant/app-$variant.apk" "$out"
echo "$out"
