#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: ci-image-required.sh <base-sha> <head-sha>" >&2
  exit 1
fi

HEAD_SHA="$(git rev-parse --verify --end-of-options "${2}^{commit}")"
if ! BASE_SHA="$(git rev-parse --verify --quiet --end-of-options "${1}^{commit}")"; then
  # New branches and unavailable history must still validate the image.
  echo true
  exit 0
fi

changed_files="$(mktemp)"
trap 'rm -f "${changed_files}"' EXIT
# Keep deleted paths visible when a runtime file is renamed into docs/.
git diff --no-renames --name-only -z "${BASE_SHA}" "${HEAD_SHA}" -- >"${changed_files}"

if [ ! -s "${changed_files}" ]; then
  echo true
  exit 0
fi

while IFS= read -r -d '' path; do
  case "${path}" in
    README.md|TROUBLESHOOTING.md|AGENTS.md|CLAUDE.md|docs/*)
      ;;
    *)
      echo true
      exit 0
      ;;
  esac
done <"${changed_files}"

echo false
