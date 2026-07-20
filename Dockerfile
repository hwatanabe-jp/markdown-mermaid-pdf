FROM debian:bookworm-slim

# OCI Labels for container metadata
LABEL org.opencontainers.image.title="markdown-mermaid-pdf"
LABEL org.opencontainers.image.description="Convert Markdown to PDF with Pandoc, XeLaTeX, and Mermaid diagram support"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/hwatanabe-jp/markdown-mermaid-pdf"
LABEL org.opencontainers.image.documentation="https://github.com/hwatanabe-jp/markdown-mermaid-pdf/blob/main/README.md"
LABEL org.opencontainers.image.vendor="markdown-mermaid-pdf contributors"

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Prevent Puppeteer from downloading its own Chromium (we'll use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
# Tell Puppeteer where to find the system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Chromium sandbox flags for root execution are supplied via config/.puppeteer.json
ENV MERMAID_TOOLS_DIR=/opt/mermaid-tools
ENV PATH=${MERMAID_TOOLS_DIR}/node_modules/.bin:${PATH}

ARG NODE_MAJOR=24

# Fail RUN pipelines on any stage failure (e.g. a truncated curl feeding gpg).
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js from the explicit NodeSource apt repository, along with all
# runtime packages needed for PDF generation.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gpg \
        chromium \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && chmod a+r /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        nodejs \
        pandoc \
        poppler-utils \
        texlive-xetex \
        texlive-lang-cjk \
        texlive-lang-chinese \
        texlive-fonts-recommended \
        texlive-plain-generic \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        lmodern \
        latex-cjk-all \
    && ln -sf /usr/bin/chromium /usr/bin/chromium-browser \
    && apt-get purge -y curl gpg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && npm cache clean --force

# Install pinned Mermaid tooling from the repository-managed lockfile.
WORKDIR ${MERMAID_TOOLS_DIR}
COPY container/npm/package.json container/npm/package-lock.json ./
# Suppress lifecycle scripts to avoid arbitrary postinstall execution.
# Puppeteer uses the system Chromium configured above instead of downloading one.
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Set environment variables for Puppeteer
ENV PUPPETEER_DISABLE_HEADLESS_WARNING=true

COPY config/ /config/

# Set working directory for PDF generation
WORKDIR /workspace

COPY scripts/generate-pdf.sh /usr/local/bin/generate-pdf.sh
RUN chmod +x /usr/local/bin/generate-pdf.sh

# Verify installations
RUN echo "=== Version Information ===" \
    && node --version \
    && npm --version \
    && chromium --version \
    && pandoc --version | head -n 1 \
    && xelatex --version | head -n 1 \
    && npm list --prefix ${MERMAID_TOOLS_DIR} --depth=0 2>/dev/null \
    && echo "mermaid-filter: $(which mermaid-filter)" \
    && fc-list | grep -i "noto sans cjk jp" | head -n 1 \
    && rm -rf /root/.npm

ENTRYPOINT ["/usr/local/bin/generate-pdf.sh"]
