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
# Puppeteer needs these flags when running Chromium as root in Docker
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"
ENV MERMAID_TOOLS_DIR=/opt/mermaid-tools
ENV PATH=/opt/mermaid-tools/node_modules/.bin:${PATH}

ARG NODE_MAJOR=24

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

# Setup Chromium sandbox for Puppeteer if available
RUN if [ -f /usr/lib/chromium/chrome-sandbox ]; then \
        cp /usr/lib/chromium/chrome-sandbox /usr/local/sbin/chrome-devel-sandbox \
        && chown root:root /usr/local/sbin/chrome-devel-sandbox \
        && chmod 4755 /usr/local/sbin/chrome-devel-sandbox; \
    else \
        echo "Chromium sandbox not found at /usr/lib/chromium/chrome-sandbox - skipping"; \
    fi

# Install pinned Mermaid tooling from the repository-managed lockfile.
WORKDIR ${MERMAID_TOOLS_DIR}
COPY container/npm/package.json container/npm/package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /root/.npm

# Set environment variables for Puppeteer
ENV CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox
ENV PUPPETEER_DISABLE_HEADLESS_WARNING=true

WORKDIR /config
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
    && npm list --prefix /opt/mermaid-tools --depth=0 2>/dev/null \
    && echo "mermaid-filter: $(which mermaid-filter)" \
    && fc-list | grep -i "noto sans cjk jp" | head -n 1

ENTRYPOINT ["/usr/local/bin/generate-pdf.sh"]
