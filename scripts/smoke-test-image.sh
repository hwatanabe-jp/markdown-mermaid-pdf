#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-}"
WORKSPACE_DIR="${2:-$(pwd)/workspace}"

if [ -z "${IMAGE_REF}" ]; then
  echo "Usage: smoke-test-image.sh <image-ref> [workspace-dir]"
  exit 1
fi

if [ ! -d "${WORKSPACE_DIR}" ]; then
  echo "Error: workspace directory '${WORKSPACE_DIR}' not found"
  exit 1
fi

WORKSPACE_DIR="$(cd "${WORKSPACE_DIR}" && pwd)"

for required_file in example.md; do
  if [ ! -f "${WORKSPACE_DIR}/${required_file}" ]; then
    echo "Error: required fixture '${WORKSPACE_DIR}/${required_file}' not found"
    exit 1
  fi
done

EXAMPLE_OUTPUT="smoke-test-${$}.pdf"
PAGEBREAK_INPUT="pagebreak-test-${$}.md"
PAGEBREAK_OUTPUT="pagebreak-test-${$}.pdf"

cleanup() {
  rm -f \
    "${WORKSPACE_DIR}/${EXAMPLE_OUTPUT}" \
    "${WORKSPACE_DIR}/${PAGEBREAK_INPUT}" \
    "${WORKSPACE_DIR}/${PAGEBREAK_OUTPUT}"
}

trap cleanup EXIT

echo "Running smoke test against ${IMAGE_REF}"
docker run --rm \
  -v "${WORKSPACE_DIR}:/workspace" \
  "${IMAGE_REF}" \
  example.md "${EXAMPLE_OUTPUT}"

test -f "${WORKSPACE_DIR}/${EXAMPLE_OUTPUT}"

cat > "${WORKSPACE_DIR}/${PAGEBREAK_INPUT}" <<'EOF'
# CI Pagebreak check
1st page text.

<!-- pagebreak -->

2nd page text.
EOF

echo "Running pagebreak test against ${IMAGE_REF}"
docker run --rm \
  -v "${WORKSPACE_DIR}:/workspace" \
  "${IMAGE_REF}" \
  "${PAGEBREAK_INPUT}" "${PAGEBREAK_OUTPUT}"

PAGE_COUNT="$(
  docker run --rm \
    -v "${WORKSPACE_DIR}:/workspace" \
    --entrypoint pdfinfo \
    "${IMAGE_REF}" \
    "${PAGEBREAK_OUTPUT}" 2>/dev/null | awk '/Pages/ {print $2}'
)"

if [ -z "${PAGE_COUNT}" ]; then
  echo "Error: could not read page count from ${PAGEBREAK_OUTPUT}"
  exit 1
fi

if [ "${PAGE_COUNT}" != "2" ]; then
  echo "Error: expected 2 pages, got ${PAGE_COUNT}"
  exit 1
fi

echo "Smoke tests passed for ${IMAGE_REF}"
