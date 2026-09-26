#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-}"
WORKSPACE_DIR="${2:-$(pwd)/workspace}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-}"

if [ -z "${IMAGE_REF}" ]; then
  echo "Usage: smoke-test-image.sh <image-ref> [workspace-dir]"
  exit 1
fi

if [ ! -d "${WORKSPACE_DIR}" ]; then
  echo "Error: workspace directory '${WORKSPACE_DIR}' not found"
  exit 1
fi

WORKSPACE_DIR="$(cd "${WORKSPACE_DIR}" && pwd)"

docker_run_args=(--rm)
if [ -n "${DOCKER_PLATFORM}" ]; then
  docker_run_args+=(--platform "${DOCKER_PLATFORM}")
fi

run_image() {
  docker run "${docker_run_args[@]}" -v "${WORKSPACE_DIR}:/workspace" "$@"
}

page_count() {
  run_image --entrypoint pdfinfo "${IMAGE_REF}" "$1" 2>/dev/null | awk '/Pages/ {print $2}'
}

for required_file in example.md formal-example.md; do
  if [ ! -f "${WORKSPACE_DIR}/${required_file}" ]; then
    echo "Error: required fixture '${WORKSPACE_DIR}/${required_file}' not found"
    exit 1
  fi
done

EXAMPLE_OUTPUT="smoke-test-${$}.pdf"
PAGEBREAK_INPUT="pagebreak-test-${$}.md"
PAGEBREAK_OUTPUT="pagebreak-test-${$}.pdf"
FORMAL_OUTPUT="formal-test-${$}.pdf"
FORMAL_INVALID_INPUT="formal-invalid-${$}.md"
FORMAL_INVALID_OUTPUT="formal-invalid-${$}.pdf"

cleanup() {
  rm -f \
    "${WORKSPACE_DIR}/${EXAMPLE_OUTPUT}" \
    "${WORKSPACE_DIR}/${PAGEBREAK_INPUT}" \
    "${WORKSPACE_DIR}/${PAGEBREAK_OUTPUT}" \
    "${WORKSPACE_DIR}/${FORMAL_OUTPUT}" \
    "${WORKSPACE_DIR}/${FORMAL_INVALID_INPUT}" \
    "${WORKSPACE_DIR}/${FORMAL_INVALID_OUTPUT}"
}

trap cleanup EXIT

echo "Running smoke test against ${IMAGE_REF}"
run_image "${IMAGE_REF}" example.md "${EXAMPLE_OUTPUT}"

test -f "${WORKSPACE_DIR}/${EXAMPLE_OUTPUT}"

cat > "${WORKSPACE_DIR}/${PAGEBREAK_INPUT}" <<'EOF'
# CI Pagebreak check
1st page text.

<!-- pagebreak -->

2nd page text.
EOF

echo "Running pagebreak test against ${IMAGE_REF}"
run_image "${IMAGE_REF}" "${PAGEBREAK_INPUT}" "${PAGEBREAK_OUTPUT}"

PAGE_COUNT="$(page_count "${PAGEBREAK_OUTPUT}")"

if [ -z "${PAGE_COUNT}" ]; then
  echo "Error: could not read page count from ${PAGEBREAK_OUTPUT}"
  exit 1
fi

if [ "${PAGE_COUNT}" != "2" ]; then
  echo "Error: expected 2 pages, got ${PAGE_COUNT}"
  exit 1
fi

echo "Running formal style test against ${IMAGE_REF}"
run_image "${IMAGE_REF}" formal-example.md "${FORMAL_OUTPUT}" --style formal

test -f "${WORKSPACE_DIR}/${FORMAL_OUTPUT}"

FORMAL_PAGE_COUNT="$(page_count "${FORMAL_OUTPUT}")"

if [ -z "${FORMAL_PAGE_COUNT}" ] || [ "${FORMAL_PAGE_COUNT}" -lt 6 ]; then
  echo "Error: expected at least 6 pages (cover, revision history, toc, chapters), got '${FORMAL_PAGE_COUNT}'"
  exit 1
fi

cat > "${WORKSPACE_DIR}/${FORMAL_INVALID_INPUT}" <<'EOF'
---
title: 必須メタデータが欠落した文書
---

# はじめに

doc-number などが無いため formal スタイルでは変換できないはず。
EOF

echo "Running formal validation-failure test against ${IMAGE_REF} (error output below is expected)"
if run_image "${IMAGE_REF}" "${FORMAL_INVALID_INPUT}" "${FORMAL_INVALID_OUTPUT}" --style formal; then
  echo "Error: formal conversion of an invalid document should fail"
  exit 1
fi

if [ -f "${WORKSPACE_DIR}/${FORMAL_INVALID_OUTPUT}" ]; then
  echo "Error: invalid formal document must not produce an output PDF"
  exit 1
fi

echo "Running unit and integration tests against ${IMAGE_REF}"
REPO_DIR="$(cd "$(dirname -- "$0")/.." && pwd)"
docker run "${docker_run_args[@]}" -v "${REPO_DIR}:/repo:ro" \
  --entrypoint node "${IMAGE_REF}" --test \
  /repo/tests/document-set.test.mjs \
  /repo/tests/generate-pdf.test.mjs \
  /repo/tests/formal.test.mjs \
  /repo/tests/document-set.integration.test.mjs

echo "Smoke tests passed for ${IMAGE_REF}"
