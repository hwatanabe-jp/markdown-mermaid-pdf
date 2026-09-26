# Agent Memory

This file is the canonical AI-agent memory for this repository.

`CLAUDE.md` should point to this file as a symlink so both names resolve to the same instructions.

## Repository Purpose

This personal project builds and publishes a Markdown-to-PDF Docker image using
Pandoc, XeLaTeX, and `mermaid-filter` with Chromium/Puppeteer. The optional
`--style formal` mode in `config/formal/` renders Digital-Agency-style documents
from schema-conforming Markdown.

## Development

- Treat `main` as the day-to-day development branch and keep it in a working state.
- Prefer short-lived branches only for larger or riskier changes.
- Prefer small, reviewable changes within the existing simple repo structure;
  avoid elaborate automation or governance unless requested.
- Prefer tracked config files and scripts over large inline shell or Dockerfile heredocs.
- Reuse `scripts/generate-pdf.sh` and `scripts/smoke-test-image.sh` where applicable.
- Keep Docker, Compose, README, and workflow behavior aligned.
- Complete the requested implementation, matching documentation, and relevant
  verification. Continue routine local edits and checks, including fixing failures
  caused by the change and rerunning affected checks, without asking at each step.

## Verification

- Choose the smallest checks that cover the change. `make test-unit` runs local
  tests without Docker (Node.js required; formal tests also need Pandoc); select
  affected test files for narrower changes. Documentation-only edits need a diff
  and reference check, not runtime tests.
- Do not run local Docker build or smoke checks for dependency updates, workflow maintenance, documentation updates, or other non-feature maintenance unless explicitly requested.
- For feature work, including larger runtime-sensitive changes, local Docker
  build and smoke checks are optional: `make build` and `make test`.
- For Dockerfile or image-layout changes, run `make lint`. It combines
  `make lint-dockerfile` (Hadolint, requires Docker) and `make lint-image`
  (Dockle, requires Docker and a built image). CI uses these targets to gate publishing.
- For dependency, version, or compliance-related changes, also run `make info`
  and `make license-check`; both inspect a built image and require Docker.
- Image checks must use an image reflecting the changed inputs (`IMAGE=...`
  selects it). If Docker or that image is unavailable, run applicable checks that
  remain possible and report image verification as incomplete. Do not build an
  image just to satisfy these checks when the maintenance rule above prohibits it.
- Report checks performed and relevant gaps. State when Docker build/smoke checks
  were skipped; do not present results from an older image as validating the change.

## Release Rules

- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest` is for stable releases only.
- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` is for validated `main` branch builds.
- Public releases are triggered from Git tags starting with `v`; use `vX.Y.Z` for normal stable releases.
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

## Task References

Read the references relevant to the task:

- Usage or tag-policy changes: `README.md` is the user-facing contract.
- Choosing or changing local commands: `Makefile`.
- Formal-mode changes: `docs/formal-mode.md` for the schema and
  `workspace/formal-example.md` for an example; check the matching tests.
- Development image publishing: `.github/workflows/build-main.yml`.
- Stable release publishing: `.github/workflows/release.yml`.
