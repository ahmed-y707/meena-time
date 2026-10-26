#!/bin/sh
# Trial installer: install and open — the trial (DAYS, default 7) starts by itself on first run, then the
# program locks until it gets a code from us. The build stops working after DEADLINE (default: today + DAYS + 3)
# whatever happens. No free 3-employee mode in this build.
#   DAYS=7 sh tools/build-trial.sh → dist/Meena-Time-Trial-Setup-<version>.exe
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
DAYS=${DAYS:-7}
DEADLINE=${DEADLINE:-$(date -d "+$((DAYS + 3)) days" +%Y%m%d)}
echo "{\"token\":\"$(node tools/keygen.js --build "$DAYS" "$DEADLINE")\"}" > trial-build.json
echo "trial: $DAYS days from first run, deadline $DEADLINE"
npx electron-builder --win dir --x64
(cd installer && makensis -DVERSION="$V" installer.nsi)
mv "dist/Meena-Time-Setup-$V.exe" "dist/Meena-Time-Trial-Setup-$V.exe"
rm -f trial-build.json
echo "→ dist/Meena-Time-Trial-Setup-$V.exe"
