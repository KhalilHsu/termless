#!/bin/bash
# Builds Termless, installs it to /Applications (replacing any old copy) and
# removes the build output, so macOS only ever sees one Termless.app —
# Launchpad lists every .app bundle it finds on disk.
set -euo pipefail
cd "$(dirname "$0")/.."
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
BUILT=release/mac-arm64/Termless.app
TARGET=/Applications/Termless.app

npm run dist:mac
if pgrep -x Termless >/dev/null; then osascript -e 'quit app "Termless"'; sleep 2; fi
rm -rf "$TARGET"
ditto --noextattr --norsrc --noqtn "$BUILT" "$TARGET"
codesign --verify --deep --strict "$TARGET"
"$LSREGISTER" -u "$BUILT" 2>/dev/null || true
rm -rf release
"$LSREGISTER" -f "$TARGET"
echo "Installed: $TARGET"
