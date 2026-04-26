# Agent Memory

This file is the canonical AI-agent memory for this repository.

`CLAUDE.md` should point to this file as a symlink so both names resolve to the same instructions.

## Repository Purpose

This repository builds and publishes a Docker image that converts Markdown to PDF with:

- Pandoc
- XeLaTeX
- Mermaid rendering through `mermaid-filter`
- Chromium/Puppeteer for Mermaid diagrams

## Project Posture

This is a personal project.

Keep the workflow minimal, calm, and professional:

- prefer the smallest reviewable diff
- avoid adding process-heavy governance unless explicitly requested
- optimize for maintainability and clear release behavior over elaborate automation

## Development Rules

- Treat `main` as the day-to-day development branch and keep it in a working state.
- Prefer short-lived branches only for larger or riskier changes.
- Before considering work complete, run the smallest relevant local checks when practical.
- For minor changes, do not run local Docker build or smoke checks by default unless explicitly requested or the risk justifies it.
- Local Docker checks remain optional for larger or runtime-sensitive changes:
  - `docker build -t markdown-mermaid-pdf:latest .`
  - `./scripts/smoke-test-image.sh markdown-mermaid-pdf:latest`
- If those Docker checks are skipped, say so clearly in the final handoff.
- If dependency, version, or compliance-related files change, also run:
  - `make info`
  - `make license-check`

## Release Rules

- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest` is for stable releases only.
- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` is for validated `main` branch builds.
- Public releases are triggered from Git tags starting with `v`; use `vX.Y.Z` for normal stable releases.
- Do not repurpose `latest` for development snapshots.
- Keep release flow simple: develop on `main`, validate, tag, release.

## Documentation Rules

When behavior changes, update the matching docs in the same change:

- `README.md` for user-facing usage or tag-policy changes
- `TROUBLESHOOTING.md` for operational gotchas and failure modes
- `THIRD_PARTY_NOTICES.md` when bundled components or license notes change

## Security and Runtime Notes

- This container is trusted-input-only.
- Mermaid rendering uses Chromium with `--no-sandbox`.
- Do not describe the container as suitable for safely processing untrusted Markdown or Mermaid input.
- Remember that the container runs as root by default, so bind-mounted output ownership can differ from the host user.

## Implementation Preferences

- Preserve the current simple repo shape unless a redesign is explicitly requested.
- Prefer tracked config files and scripts over large inline shell or Dockerfile heredocs.
- Reuse existing entrypoints and scripts when possible:
  - `scripts/generate-pdf.sh`
  - `scripts/smoke-test-image.sh`
- Keep Docker, Compose, README, and workflow behavior aligned.

## Practical References

- `README.md` is the user-facing contract.
- `Makefile` is the quickest guide to local developer workflows.
- `.github/workflows/build-main.yml` defines validated development image publishing.
- `.github/workflows/release.yml` defines stable release publishing.
