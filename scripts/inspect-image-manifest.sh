#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-}"
MODE="${2:-inspect}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"
BASE_DELAY_SECONDS="${BASE_DELAY_SECONDS:-5}"

if [ -z "${IMAGE_REF}" ]; then
  echo "Usage: inspect-image-manifest.sh <image-ref> [inspect|digest]" >&2
  exit 1
fi

case "${MODE}" in
  inspect|digest)
    ;;
  *)
    echo "Error: unsupported mode '${MODE}' (expected inspect or digest)" >&2
    exit 1
    ;;
esac

attempt=1
while true; do
  output_file="$(mktemp)"

  if docker buildx imagetools inspect "${IMAGE_REF}" >"${output_file}" 2>&1; then
    if [ "${MODE}" = "inspect" ]; then
      cat "${output_file}"
      rm -f "${output_file}"
      exit 0
    fi

    digest="$(awk '/^Digest:/ {print $2; exit}' "${output_file}")"
    if [ -n "${digest}" ]; then
      printf '%s\n' "${digest}"
      rm -f "${output_file}"
      exit 0
    fi

    cat "${output_file}" >&2
    echo "Digest not found in manifest output for ${IMAGE_REF}" >&2
  else
    cat "${output_file}" >&2
  fi

  rm -f "${output_file}"

  if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
    echo "Failed to inspect ${IMAGE_REF} after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi

  delay_seconds=$((attempt * BASE_DELAY_SECONDS))
  echo "Retrying manifest inspection for ${IMAGE_REF} in ${delay_seconds}s..." >&2
  sleep "${delay_seconds}"
  attempt=$((attempt + 1))
done
