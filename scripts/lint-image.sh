#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: lint-image.sh <local-image-ref> <dockle-image> [dockle-options...]" >&2
  exit 1
fi

image_ref="$1"
dockle_image="$2"
shift 2

archive_dir="$(mktemp -d)"
trap 'rm -rf -- "${archive_dir}"' EXIT

# Export the exact candidate already loaded/pulled for smoke tests. Dockle's
# registry reader can reject digest references to attested OCI image indexes.
docker image save --output "${archive_dir}/image.tar" "${image_ref}"
docker run --rm -v "${archive_dir}:/scan:ro" "${dockle_image}" \
  "$@" --input /scan/image.tar
