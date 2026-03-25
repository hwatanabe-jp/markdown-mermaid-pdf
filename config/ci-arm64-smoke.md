# Arm64 CI Smoke Test

This fixture keeps PDF generation validation lightweight for emulated arm64 CI.

The emulated arm64 CI path intentionally avoids Mermaid rendering here because
Chromium startup under QEMU is too slow to use as a stable main/release gate.
