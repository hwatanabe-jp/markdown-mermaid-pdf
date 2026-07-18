#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: generate-pdf.sh <input.md> [output.pdf] [--style default|formal]"
  echo "Example: generate-pdf.sh document.md output.pdf --style formal"
}

INPUT_MD=""
OUTPUT_PDF=""
STYLE="default"

while [ $# -gt 0 ]; do
  case "$1" in
    --style)
      if [ $# -lt 2 ]; then
        echo "Error: --style requires a value (default|formal)"
        usage
        exit 1
      fi
      STYLE="$2"
      shift 2
      ;;
    --style=*)
      STYLE="${1#--style=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Error: unknown option '$1'"
      usage
      exit 1
      ;;
    *)
      if [ -z "${INPUT_MD}" ]; then
        INPUT_MD="$1"
      elif [ -z "${OUTPUT_PDF}" ]; then
        OUTPUT_PDF="$1"
      else
        echo "Error: unexpected argument '$1'"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "${INPUT_MD}" ]; then
  usage
  exit 1
fi

if [ ! -f "${INPUT_MD}" ]; then
  echo "Error: Input file '${INPUT_MD}' not found"
  exit 1
fi

case "${STYLE}" in
  default|formal) ;;
  *)
    echo "Error: unknown style '${STYLE}' (expected: default|formal)"
    exit 1
    ;;
esac

if [ -z "${OUTPUT_PDF}" ]; then
  OUTPUT_PDF="${INPUT_MD%.md}.pdf"
fi

echo "Generating PDF: ${INPUT_MD} -> ${OUTPUT_PDF} (style: ${STYLE})"

# formal スタイルでは、利用者が独自の設定を置いていない限り
# コントラストの高いニュートラル配色の Mermaid テーマを使う。
if [ "${STYLE}" = "formal" ] && [ ! -f .mermaid-config.json ]; then
  cp /config/formal/mermaid-config.json .mermaid-config.json
fi

for config_file in .mermaid-config.json .puppeteer.json .mermaid.css; do
  if [ ! -f "${config_file}" ]; then
    cp "/config/${config_file}" "${config_file}"
  fi
done

if [ "${STYLE}" = "formal" ]; then
  # formal: スキーマ検証(validate.lua)を mermaid-filter より先に実行して早期に失敗させ、
  # 図表整形(format.lua)は mermaid-filter の画像化より後に実行する。
  pandoc "${INPUT_MD}" \
    -o "${OUTPUT_PDF}" \
    --pdf-engine=xelatex \
    --resource-path="$(dirname -- "${INPUT_MD}"):." \
    -L /config/formal/validate.lua \
    -L /config/pagebreak.lua \
    --filter=mermaid-filter \
    -L /config/formal/format.lua \
    --template=/config/formal/template.tex \
    --highlight-style=monochrome \
    --verbose
else
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
fi

echo "Successfully generated: ${OUTPUT_PDF}"
ls -lh "${OUTPUT_PDF}"
