#!/usr/bin/env bash
# Builds one role-locked APK (one role per APK, design Builds frame) into dist/:
#   scripts/build-apk.sh vendor|buyer [debug|release]
# A debug APK loads its JavaScript from Metro (npx expo start + adb reverse tcp:8081 tcp:8081); a release APK
# carries its bundle and needs no laptop. Only arm64-v8a is built, which every Android 15/16 phone runs.
set -euo pipefail

role=${1:-}
variant=${2:-debug}
case "$role" in vendor | buyer) ;; *) echo "usage: scripts/build-apk.sh vendor|buyer [debug|release]" >&2; exit 1 ;; esac
case "$variant" in debug) task=assembleDebug ;; release) task=assembleRelease ;; *) echo "variant must be debug or release" >&2; exit 1 ;; esac

cd "$(dirname "$0")/.."
# Needed at prebuild (name, package) and again in gradle, where expo-constants embeds extra.role.
export EXPO_PUBLIC_APP_ROLE=$role
CI=1 EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$task" -PreactNativeArchitectures=arm64-v8a --console=plain)

mkdir -p dist
out="dist/tap-to-pay-$role-$variant.apk"
cp "android/app/build/outputs/apk/$variant/app-$variant.apk" "$out"
echo "$out"
