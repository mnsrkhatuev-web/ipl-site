#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-_site}"
rm -rf "$OUT"
mkdir -p "$OUT"
# Copy published site files only
shopt -s dotglob nullglob
for item in \
  admin assets data files pages \
  index.html styles.css script.js course.js \
  sw.js pwa-register.js manifest.webmanifest \
  robots.txt CNAME .nojekyll
do
  if [[ -e "$item" ]]; then
    cp -a "$item" "$OUT/"
  fi
done
echo "Prepared $OUT"
du -sh "$OUT"
