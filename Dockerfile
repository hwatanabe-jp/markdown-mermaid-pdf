FROM debian:bookworm-slim

# OCI Labels for container metadata
LABEL org.opencontainers.image.title="markdown-mermaid-pdf"
LABEL org.opencontainers.image.description="Convert Markdown to PDF with Pandoc, XeLaTeX, and Mermaid diagram support"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/yourusername/markdown-mermaid-pdf"
LABEL org.opencontainers.image.documentation="https://github.com/yourusername/markdown-mermaid-pdf/blob/main/README.md"
LABEL org.opencontainers.image.vendor="markdown-mermaid-pdf contributors"

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Prevent Puppeteer from downloading its own Chromium (we'll use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
# Tell Puppeteer where to find the system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Puppeteer needs these flags when running Chromium as root in Docker
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"

# Install Node.js 24, Chromium, git, and build dependencies in a single layer
# Then cleanup build-only tools to reduce image size
RUN apt-get update \
    # Install build dependencies temporarily
    && apt-get install -y --no-install-recommends \
        curl \
        wget \
        gnupg \
        ca-certificates \
        git \
        chromium \
    # Install Node.js 24 (LTS)
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    # Install yq for YAML parsing (architecture-aware)
    && ARCH=$(dpkg --print-architecture) \
    && wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${ARCH} \
    && chmod +x /usr/local/bin/yq \
    # Provide chromium-browser alias for compatibility with tooling expectations
    && ln -sf /usr/bin/chromium /usr/bin/chromium-browser \
    # Cleanup: remove build-only tools (NOT git/chromium - they are runtime tools)
    && apt-get purge -y curl wget gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Setup Chromium sandbox for Puppeteer if available
RUN if [ -f /usr/lib/chromium/chrome-sandbox ]; then \
        cp /usr/lib/chromium/chrome-sandbox /usr/local/sbin/chrome-devel-sandbox \
        && chown root:root /usr/local/sbin/chrome-devel-sandbox \
        && chmod 4755 /usr/local/sbin/chrome-devel-sandbox; \
    else \
        echo "Chromium sandbox not found at /usr/lib/chromium/chrome-sandbox - skipping"; \
    fi

# Install mermaid-filter globally (after PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is set)
RUN npm install -g mermaid-filter \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Install Pandoc and TeXLive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        pandoc \
        texlive-xetex \
        texlive-lang-cjk \
        texlive-lang-chinese \
        texlive-fonts-recommended \
        texlive-plain-generic \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        lmodern \
        latex-cjk-all \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer
ENV CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox
ENV PUPPETEER_DISABLE_HEADLESS_WARNING=true

# Create configuration files
WORKDIR /config

# Create Puppeteer configuration for Chromium sandbox
RUN cat > .puppeteer.json << 'EOF'
{
  "args": ["--no-sandbox", "--disable-setuid-sandbox"]
}
EOF

# Create Mermaid configuration for Japanese fonts
RUN cat > .mermaid-config.json << 'EOF'
{
  "theme": "default",
  "themeVariables": {
    "fontFamily": "\"Noto Sans CJK JP\", \"Hiragino Kaku Gothic ProN\", \"Yu Gothic\", \"MS Gothic\", sans-serif"
  },
  "puppeteerConfig": {
    "args": ["--no-sandbox", "--disable-setuid-sandbox"]
  }
}
EOF

# Create Mermaid CSS for enforcing Japanese fonts
RUN cat > .mermaid.css << 'EOF'
/* Gantt chart title - 特に重要 */
.titleText {
  font-family: "Noto Sans CJK JP", sans-serif !important;
}

/* Section titles */
.sectionTitle,
.sectionTitle0,
.sectionTitle1,
.sectionTitle2,
.sectionTitle3 {
  font-family: "Noto Sans CJK JP", sans-serif !important;
}

/* Task text */
.taskText,
.taskText0,
.taskText1,
.taskText2,
.taskText3,
.taskTextOutsideRight,
.taskTextOutsideLeft {
  font-family: "Noto Sans CJK JP", sans-serif !important;
}

/* すべてのテキスト要素への一般的な適用 */
text {
  font-family: "Noto Sans CJK JP", sans-serif !important;
}
EOF

# Create Pandoc header for font configuration
RUN cat > header.tex << 'EOF'
\usepackage{xeCJK}
\setCJKmainfont[Scale=1.0]{Noto Sans CJK JP}
\setmainfont[Scale=0.95]{DejaVu Sans}

% Line spacing for better readability
\usepackage{setspace}
\setstretch{1.3}

% Image placement - prevent floats from moving to end
\usepackage{float}
\floatplacement{figure}{H}

% Add gray hash marks to headings
\usepackage{xcolor}
\usepackage[explicit]{titlesec}

% # (Level 1 heading)
\titleformat{\section}
  {\Large\bfseries}
  {}
  {0em}
  {\textcolor{gray!50}{\#}\quad#1}

% ## (Level 2 heading)
\titleformat{\subsection}
  {\large\bfseries}
  {}
  {0em}
  {\textcolor{gray!50}{\#\#}\quad#1}

% ### (Level 3 heading)
\titleformat{\subsubsection}
  {\normalsize\bfseries}
  {}
  {0em}
  {\textcolor{gray!50}{\#\#\#}\quad#1}
EOF

# Set working directory for PDF generation
WORKDIR /workspace

# Create entrypoint script
RUN cat > /usr/local/bin/generate-pdf.sh << 'EOF'
#!/bin/bash
set -e

INPUT_MD="${1}"
OUTPUT_PDF="${2:-${INPUT_MD%.md}.pdf}"

if [ -z "$INPUT_MD" ]; then
  echo "Usage: generate-pdf.sh <input.md> [output.pdf]"
  echo "Example: generate-pdf.sh document.md output.pdf"
  exit 1
fi

if [ ! -f "$INPUT_MD" ]; then
  echo "Error: Input file '$INPUT_MD' not found"
  exit 1
fi

echo "Generating PDF: $INPUT_MD -> $OUTPUT_PDF"

# Ensure Mermaid styles, configuration, and puppeteer options are available in the working directory
if [ ! -f .mermaid-config.json ]; then
  cp /config/.mermaid-config.json .
fi
if [ ! -f .puppeteer.json ]; then
  cp /config/.puppeteer.json .
fi
if [ ! -f .mermaid.css ]; then
  cp /config/.mermaid.css .
fi

pandoc "$INPUT_MD" \
  -o "$OUTPUT_PDF" \
  --pdf-engine=xelatex \
  --resource-path="$(dirname "$INPUT_MD"):." \
  --filter=mermaid-filter \
  --include-in-header=/config/header.tex \
  -V geometry:margin=20mm \
  -V documentclass=article \
  -V papersize=a4 \
  -V subparagraph=yes \
  --verbose

if [ $? -eq 0 ]; then
  echo "✓ Successfully generated: $OUTPUT_PDF"
  ls -lh "$OUTPUT_PDF"
else
  echo "✗ Failed to generate: $OUTPUT_PDF"
  exit 1
fi
EOF

RUN chmod +x /usr/local/bin/generate-pdf.sh

# Verify installations
RUN echo "=== Version Information ===" \
    && node --version \
    && npm --version \
    && chromium --version \
    && pandoc --version | head -n 1 \
    && xelatex --version | head -n 1 \
    && yq --version \
    && echo "mermaid-filter: $(which mermaid-filter)" \
    && fc-list | grep -i "noto sans cjk jp" | head -n 1

ENTRYPOINT ["/usr/local/bin/generate-pdf.sh"]
