#!/bin/sh
# Trial installer: normal build + trial-build.json → the program opens only with a code from us
# (node tools/keygen.js <request-code> --days 7). No free 3-employee mode in this build.
#   sh tools/build-trial.sh → dist/Meena-Time-Trial-Setup-<version>.exe
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
echo '{"trial":true}' > trial-build.json
npx electron-builder --win dir --x64
(cd installer && makensis -DVERSION="$V" installer.nsi)
mv "dist/Meena-Time-Setup-$V.exe" "dist/Meena-Time-Trial-Setup-$V.exe"
rm -f trial-build.json
echo "→ dist/Meena-Time-Trial-Setup-$V.exe"
