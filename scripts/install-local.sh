#!/usr/bin/env bash
# macOS only.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
package_dir="$HOME/Library/Application Support/inkdrop/packages/drop-import"

cd "$repo_dir"
npm run build

if [[ -e "$package_dir" && ! -L "$package_dir" ]]; then
  printf 'Refusing to replace an existing file or directory: %s\n' "$package_dir" >&2
  exit 1
fi

mkdir -p "$(dirname "$package_dir")"
if [[ -L "$package_dir" ]]; then
  rm "$package_dir"
fi
ln -s "$repo_dir" "$package_dir"
printf 'Installed %s -> %s\n' "$package_dir" "$repo_dir"
printf 'Inkdrop must be restarted. Run scripts/relaunch-inkdrop.sh for a debuggable relaunch, or quit and reopen the app.\n'
