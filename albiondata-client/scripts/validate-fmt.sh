#!/usr/bin/env bash

set -eo pipefail

# PATCH LOCAL (Albion Profit Pro): validate gofmt without rewriting the fork and
# compare normalized content so CRLF working trees do not become false failures.
bad_files=()
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

if [ "$#" -gt 0 ]; then
  files=("$@")
elif [ -n "${FORMAT_BASE_REF:-}" ]; then
  mapfile -t files < <(git diff --relative --name-only --diff-filter=ACMRT "$FORMAT_BASE_REF" HEAD -- '*.go')
else
  mapfile -t files < <(
    git diff --relative --name-only --diff-filter=ACMRT HEAD -- '*.go'
    git ls-files --others --exclude-standard -- '*.go'
  )
fi

for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  relative_name="${file#./}"
  safe_name="${relative_name//\//_}"
  normalized="$temp_dir/$safe_name.normalized"
  formatted="$temp_dir/$safe_name.formatted"

  tr -d '\r' < "$file" > "$normalized"
  gofmt "$file" | tr -d '\r' > "$formatted"

  if ! cmp -s "$normalized" "$formatted"; then
    bad_files+=("$file")
  fi
done

if [ ${#bad_files[@]} -eq 0 ]; then
  echo "All Go source files are formatted correctly (EOL ignored)."
  exit 0
fi

echo "The following files are not formatted properly:"
for file in "${bad_files[@]}"; do
  echo " - $file"
done
exit 1
