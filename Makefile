.PHONY: help build rebuild run clean clean-all test shell example example-formal convert info license-check

IMAGE ?= markdown-mermaid-pdf:latest
RUN_WORKSPACE = docker run --rm -v $$(pwd)/workspace:/workspace $(IMAGE)
RUN_BASH = docker run --rm --entrypoint /bin/bash $(IMAGE) -lc

# Default target
help:
	@echo "Markdown Mermaid PDF - Available commands:"
	@echo ""
	@echo "  make build          - Build Docker image"
	@echo "  make run            - Open a shell via Docker Compose"
	@echo "  make example        - Generate PDF from example.md"
	@echo "  make example-formal - Generate formal-style PDF from formal-example.md"
	@echo "  make test           - Test PDF generation"
	@echo "  make shell          - Open bash shell in container"
	@echo "  make clean          - Remove generated PDFs and Docker artifacts"
	@echo "  make rebuild        - Clean build (no cache)"
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

# Test PDF generation with example
test:
	@echo "Testing PDF generation..."
	@./scripts/smoke-test-image.sh $(IMAGE)

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
