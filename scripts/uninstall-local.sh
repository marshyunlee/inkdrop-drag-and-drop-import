#!/usr/bin/env bash
# macOS only.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
package_dir="$HOME/Library/Application Support/inkdrop/packages/drop-import"

if [[ -L "$package_dir" ]]; then
  target_dir="$(cd "$package_dir" 2>/dev/null && pwd -P)" || target_dir=""
  if [[ "$target_dir" == "$repo_dir" ]]; then
    rm "$package_dir"
    printf 'Removed %s\n' "$package_dir"
    printf 'Restart Inkdrop to unload the plugin.\n'
  else
    printf 'Left symlink unchanged; it does not point to this repo: %s\n' "$package_dir"
  fi
elif [[ -e "$package_dir" ]]; then
  printf 'Left existing file or directory unchanged: %s\n' "$package_dir"
else
  printf 'No local installation found at %s\n' "$package_dir"
fi
