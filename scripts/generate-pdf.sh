#!/usr/bin/env bash
set -euo pipefail

INPUT_MD="${1:-}"
OUTPUT_PDF="${2:-}"

if [ -z "${INPUT_MD}" ]; then
  echo "Usage: generate-pdf.sh <input.md> [output.pdf]"
  echo "Example: generate-pdf.sh document.md output.pdf"
  exit 1
fi

if [ ! -f "${INPUT_MD}" ]; then
  echo "Error: Input file '${INPUT_MD}' not found"
  exit 1
fi

if [ -z "${OUTPUT_PDF}" ]; then
  OUTPUT_PDF="${INPUT_MD%.md}.pdf"
fi

echo "Generating PDF: ${INPUT_MD} -> ${OUTPUT_PDF}"

for config_file in .mermaid-config.json .puppeteer.json .mermaid.css; do
  if [ ! -f "${config_file}" ]; then
    cp "/config/${config_file}" "${config_file}"
  fi
done

pandoc "${INPUT_MD}" \
  -o "${OUTPUT_PDF}" \
  --pdf-engine=xelatex \
  --resource-path="$(dirname -- "${INPUT_MD}"):." \
  -L /config/pagebreak.lua \
  --filter=mermaid-filter \
  --include-in-header=/config/header.tex \
  -V geometry:margin=20mm \
  -V documentclass=article \
  -V papersize=a4 \
  -V subparagraph=yes \
  --verbose

echo "Successfully generated: ${OUTPUT_PDF}"
ls -lh "${OUTPUT_PDF}"
