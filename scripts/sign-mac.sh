#!/bin/bash
# Ad-hoc signs the packaged app so it runs on this Mac (not notarized, not for
# distribution). codesign rejects resource forks / Finder info that packaging
# can leave behind, so the app is first copied without them.
set -euo pipefail
APP="${1:-release/mac-arm64/Termless.app}"
STAGE="$(mktemp -d)"
ditto --noextattr --norsrc --noqtn "$APP" "$STAGE/Termless.app"
codesign --force --deep --sign - "$STAGE/Termless.app"
codesign --verify --deep --strict "$STAGE/Termless.app"
rm -rf "$APP"
mv "$STAGE/Termless.app" "$APP"
rmdir "$STAGE"
echo "Signed (ad-hoc): $APP"
