.PHONY: help build rebuild run clean clean-all test shell example example-formal example-set convert info license-check lint lint-dockerfile lint-image

IMAGE ?= markdown-mermaid-pdf:latest
RUN_WORKSPACE = docker run --rm -v $$(pwd)/workspace:/workspace $(IMAGE)
RUN_BASH = docker run --rm --entrypoint /bin/bash $(IMAGE) -lc

# Lint tool pins (single source of truth; CI calls these targets too).
HADOLINT_IMAGE := hadolint/hadolint:v2.15.1@sha256:32dac94127fd60b7b7e3fbfc65e1383b9b5e25c9bfd7b8536de7a539fe68a12d
DOCKLE_IMAGE := goodwithtech/dockle:v0.4.15@sha256:eade932f793742de0aa8755406c7677cd7696f8675b6180926f7eeffa7abe6b9

# Default target
help:
	@echo "Markdown Mermaid PDF - Available commands:"
	@echo ""
	@echo "  make build          - Build Docker image"
	@echo "  make run            - Open a shell via Docker Compose"
	@echo "  make example        - Generate PDF from example.md"
	@echo "  make example-formal - Generate formal-style PDF from formal-example.md"
	@echo "  make example-set    - Generate a formal document set in formal-set/dist"
	@echo "  make test           - Test PDF generation"
	@echo "  make shell          - Open bash shell in container"
	@echo "  make clean          - Remove generated PDFs and Docker artifacts"
	@echo "  make rebuild        - Clean build (no cache)"
	@echo "  make lint           - Lint Dockerfile (Hadolint) and built image (Dockle)"
	@echo "  make info           - Show Docker image and tool versions"
	@echo "  make license-check  - Verify license compliance"
	@echo ""

# Build Docker image
build:
	@echo "Building Docker image..."
	docker build -t $(IMAGE) .

# Rebuild without cache
rebuild:
	@echo "Rebuilding Docker image (no cache)..."
	docker build --no-cache -t $(IMAGE) .

# Run container interactively
run: shell

# Generate PDF from example.md
example:
	@echo "Generating PDF from example.md..."
	@if [ ! -f workspace/example.md ]; then \
		echo "Error: workspace/example.md not found"; \
		exit 1; \
	fi
	$(RUN_WORKSPACE) example.md example.pdf
	@echo "Done! Check workspace/example.pdf"

# Generate formal-style PDF from formal-example.md
example-formal:
	@echo "Generating formal-style PDF from formal-example.md..."
	@if [ ! -f workspace/formal-example.md ]; then \
		echo "Error: workspace/formal-example.md not found"; \
		exit 1; \
	fi
	$(RUN_WORKSPACE) formal-example.md formal-example.pdf --style formal
	@echo "Done! Check workspace/formal-example.pdf"

# Generate the example document set (output directory must not exist).
example-set:
	$(RUN_WORKSPACE) --set formal-set/documents.json

# Test PDF generation with examples and failure cases.
test:
	@echo "Testing PDF generation..."
	@./scripts/smoke-test-image.sh $(IMAGE)

# Lint Dockerfile and built image (same commands CI runs)
lint: lint-dockerfile lint-image

# Static Dockerfile lint; picks up .hadolint.yaml from the repo root.
# HADOLINT_ARGS is a hook for CI (e.g. HADOLINT_ARGS="-f sarif").
lint-dockerfile:
	@docker run --rm -v $$(pwd):/wd:ro -w /wd $(HADOLINT_IMAGE) \
		hadolint $(HADOLINT_ARGS) Dockerfile

# Image lint against $(IMAGE). Accepted checks (documented in TROUBLESHOOTING.md):
#   CIS-DI-0001  root がデフォルトなのは bind-mount 出力の所有権を考慮した仕様
#   DKL-DI-0006  latest タグは「安定版のみ」のタグポリシーとして README に明記済み
#   -ae mdf      texlive の mdframed パッケージ (*.mdf) を資格情報ファイルと誤検知するため
lint-image:
	@docker run --rm -v /var/run/docker.sock:/var/run/docker.sock $(DOCKLE_IMAGE) \
		--exit-code 1 --exit-level warn \
		-i CIS-DI-0001 \
		-i DKL-DI-0006 \
		-ae mdf \
		$(IMAGE)

# Open bash shell in container
shell:
	@echo "Opening shell in container..."
	docker compose run --rm markdown-mermaid-pdf-shell

# Clean generated files and Docker artifacts
clean:
	@echo "Cleaning up..."
	rm -f workspace/*.pdf
	rm -f workspace/*.log
	@docker compose down -v 2>/dev/null || true
	@echo "Cleanup complete"

# Clean everything including Docker images
clean-all: clean
	@echo "Removing Docker images..."
	docker rmi $(IMAGE) || true
	@echo "Complete cleanup done"

# Generate PDF from specific file
# Usage: make convert INPUT=document.md [OUTPUT=output.pdf]
# OUTPUT を省略した場合はコンテナ側 (generate-pdf.sh) が入力名から導出する。
convert:
	@if [ -z "$(INPUT)" ]; then \
		echo "Error: INPUT variable is required"; \
		echo "Usage: make convert INPUT=document.md [OUTPUT=output.pdf]"; \
		exit 1; \
	fi
	@if [ ! -f workspace/$(INPUT) ]; then \
		echo "Error: workspace/$(INPUT) not found"; \
		exit 1; \
	fi
	$(RUN_WORKSPACE) $(INPUT) $(OUTPUT)
	@echo "Done!"

# Show Docker image info
info:
	@echo "Docker image information:"
	@docker images $(IMAGE)
	@echo ""
	@echo "Installed tools versions:"
	@$(RUN_BASH) "\
		echo 'Node.js:' && node --version && \
		echo 'npm:' && npm --version && \
		echo 'Pandoc:' && pandoc --version | head -n 1 && \
		echo 'XeLaTeX:' && xelatex --version | head -n 1 && \
		echo 'Chromium:' && chromium --version && \
		echo 'Mermaid packages:' && npm list --prefix /opt/mermaid-tools --depth=0 2>/dev/null"

# Verify licenses and third-party components
license-check:
	@echo "Checking license compliance..."
	@echo ""
	@echo "1. Verifying required license files:"
	@for f in LICENSE THIRD_PARTY_NOTICES.md; do \
		if [ -f $$f ]; then \
			echo "   ✓ $$f found"; \
		else \
			echo "   ✗ $$f missing"; \
			exit 1; \
		fi; \
	done
	@echo ""
	@echo "2. Checking Docker image labels:"
	@docker inspect $(IMAGE) --format='{{.Config.Labels}}' 2>/dev/null | grep -q "org.opencontainers.image.licenses" && \
		echo "   ✓ License label found in image" || \
		echo "   ⚠ License label not found (image may need rebuilding)"
	@echo ""
	@echo "3. Auditing Mermaid npm packages and key Debian packages in image:"
	@$(RUN_BASH) "npm list --prefix /opt/mermaid-tools --depth=0 2>/dev/null || true; \
		echo ''; \
		dpkg -l | grep -E 'pandoc|chromium|texlive-xetex|fonts-noto-cjk' | head -n 5"
	@echo ""
	@echo "✓ License compliance check complete"
	@echo ""
	@echo "For detailed license information:"
	@echo "  - cat LICENSE"
	@echo "  - cat THIRD_PARTY_NOTICES.md"
