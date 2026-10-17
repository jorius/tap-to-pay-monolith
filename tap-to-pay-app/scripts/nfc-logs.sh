#!/usr/bin/env bash
# Live NFC logs for one phone, left running while tapping (SDD §14): scripts/nfc-logs.sh <adb serial>
set -euo pipefail

serial=${1:?usage: scripts/nfc-logs.sh <adb serial>}
exec adb -s "$serial" logcat -v time -T 1 NfcTap:V ReactNativeJS:V NfcService:D HostEmulationManager:D RegisteredAidCache:D '*:S'
