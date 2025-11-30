.PHONY: help build rebuild run clean clean-all test shell example convert info license-check

# Default target
help:
	@echo "Markdown Mermaid PDF - Available commands:"
	@echo ""
	@echo "  make build          - Build Docker image"
	@echo "  make run            - Run container interactively"
	@echo "  make example        - Generate PDF from example.md"
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
	docker build -t markdown-mermaid-pdf:latest .

# Rebuild without cache
rebuild:
	@echo "Rebuilding Docker image (no cache)..."
	docker build --no-cache -t markdown-mermaid-pdf:latest .

# Run container interactively
run:
	@echo "Starting container..."
	docker compose run --rm markdown-mermaid-pdf

# Generate PDF from example.md
example:
	@echo "Generating PDF from example.md..."
	@if [ ! -f workspace/example.md ]; then \
		echo "Error: workspace/example.md not found"; \
		exit 1; \
	fi
	docker run --rm \
		-v $$(pwd)/workspace:/workspace \
		markdown-mermaid-pdf:latest \
		example.md example.pdf
	@echo "Done! Check workspace/example.pdf"

# Test PDF generation with example
test: example
	@echo "Testing PDF generation..."
	@if [ -f workspace/example.pdf ]; then \
		echo "✓ Test passed: example.pdf generated successfully"; \
		ls -lh workspace/example.pdf; \
	else \
		echo "✗ Test failed: example.pdf not found"; \
		exit 1; \
	fi
	@echo "Running pagebreak marker test..."
	@docker run --rm \
		-v $$(pwd)/workspace:/workspace \
		markdown-mermaid-pdf:latest \
		pagebreak-test.md pagebreak-test.pdf
	@PAGES=$$(docker run --rm \
		-v $$(pwd)/workspace:/workspace \
		--entrypoint pdfinfo \
		markdown-mermaid-pdf:latest \
		pagebreak-test.pdf 2>/dev/null | awk '/Pages/ {print $$2}'); \
	if [ -z "$$PAGES" ]; then \
		echo "✗ Pagebreak test failed: could not read page count"; \
		exit 1; \
	fi; \
	if [ "$$PAGES" -ne 2 ]; then \
		echo "✗ Pagebreak test failed: expected 2 pages, got $$PAGES"; \
		exit 1; \
	fi; \
	echo "✓ Pagebreak test passed (2 pages)"

# Open bash shell in container
shell:
	@echo "Opening shell in container..."
	docker run --rm -it \
		-v $$(pwd)/workspace:/workspace \
		--entrypoint /bin/bash \
		markdown-mermaid-pdf:latest

# Clean generated files and Docker artifacts
clean:
	@echo "Cleaning up..."
	rm -f workspace/*.pdf
	rm -f workspace/*.log
	@if command -v docker compose >/dev/null 2>&1; then \
		docker compose down -v 2>/dev/null || true; \
	fi
	@echo "Cleanup complete"

# Clean everything including Docker images
clean-all: clean
	@echo "Removing Docker images..."
	docker rmi markdown-mermaid-pdf:latest || true
	@echo "Complete cleanup done"

# Generate PDF from specific file
# Usage: make convert INPUT=document.md OUTPUT=output.pdf
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
	@OUTPUT=$${OUTPUT:-$$(basename $(INPUT) .md).pdf}; \
	echo "Converting $(INPUT) to $$OUTPUT..."; \
	docker run --rm \
		-v $$(pwd)/workspace:/workspace \
		markdown-mermaid-pdf:latest \
		$(INPUT) $$OUTPUT
	@echo "Done!"

# Show Docker image info
info:
	@echo "Docker image information:"
	@docker images markdown-mermaid-pdf:latest
	@echo ""
	@echo "Installed tools versions:"
	@docker run --rm markdown-mermaid-pdf:latest /bin/bash -c "\
		echo 'Node.js:' && node --version && \
		echo 'Pandoc:' && pandoc --version | head -n 1 && \
		echo 'XeLaTeX:' && xelatex --version | head -n 1 && \
		echo 'yq:' && yq --version && \
		echo 'mermaid-filter:' && which mermaid-filter"

# Verify licenses and third-party components
license-check:
	@echo "Checking license compliance..."
	@echo ""
	@echo "1. Verifying LICENSE file exists:"
	@if [ -f LICENSE ]; then \
		echo "   ✓ LICENSE file found"; \
	else \
		echo "   ✗ LICENSE file missing"; \
		exit 1; \
	fi
	@echo ""
	@echo "2. Verifying THIRD_PARTY_NOTICES.md exists:"
	@if [ -f THIRD_PARTY_NOTICES.md ]; then \
		echo "   ✓ THIRD_PARTY_NOTICES.md found"; \
	else \
		echo "   ✗ THIRD_PARTY_NOTICES.md missing"; \
		exit 1; \
	fi
	@echo ""
	@echo "3. Checking Docker image labels:"
	@docker inspect markdown-mermaid-pdf:latest --format='{{.Config.Labels}}' 2>/dev/null | grep -q "org.opencontainers.image.licenses" && \
		echo "   ✓ License label found in image" || \
		echo "   ⚠ License label not found (image may need rebuilding)"
	@echo ""
	@echo "4. Auditing npm packages in image:"
	@docker run --rm markdown-mermaid-pdf:latest npm list -g --depth=0 2>/dev/null || echo "   (npm packages listed above)"
	@echo ""
	@echo "5. Checking Debian package licenses:"
	@echo "   (Sample check for key packages)"
	@docker run --rm markdown-mermaid-pdf:latest dpkg -l | grep -E "pandoc|git|texlive-xetex|fonts-noto-cjk" | head -n 5
	@echo ""
	@echo "✓ License compliance check complete"
	@echo ""
	@echo "For detailed license information:"
	@echo "  - cat LICENSE"
	@echo "  - cat THIRD_PARTY_NOTICES.md"
