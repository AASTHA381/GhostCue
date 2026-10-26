# GhostCue — Invisible Webcam Teleprompter & Pitch Studio

GhostCue is an Electron desktop app (macOS & Windows) that docks a floating teleprompter under your webcam notch. The overlay is excluded from screen capture, so you can read your script while sharing your screen on Zoom, Meet or Teams and the audience never sees it.

## Features

- **Capture-invisible overlay** — `setContentProtection(true)`, always-on-top, visible on all workspaces including full-screen apps.
- **Click-through HUD** — the overlay ignores mouse events so it never steals focus; toggle interactive mode with a shortcut.
- **Two scroll modes** — Constant WPM, or Voice-Sync (scrolls while you speak, using a native macOS speech helper).
- **Script cues** — `[SLIDE N]`, `[PAUSE Ns]`, `[SLOW DOWN]`, and `**bold**` highlights for key numbers.
- **Script import / export** — PDF, Word (.docx), PowerPoint (.pptx) speaker notes, and Markdown export.
- **Phase 2: AI Real-Time Interview Co-Pilot** — Upload your Resume and target Job Description (`.PDF`, `.DOCX`, `.TXT`), listen to interviewer questions live via on-device speech recognition, and get instant, grounded, natural-sounding STAR answers in the webcam HUD—with strict anti-hallucination guardrails that flag unlisted skills honestly instead of inventing experience.
- **Pre-flight check** — display-mirroring detection, mic check and an audience-view self-test.
- **HDMI mirror safety** — overlay opacity drops to 0 if displays are hardware-mirrored.

## Quick start

```bash
npm install
npm run compile:speech   # macOS only: builds the native voice helper
npm start
```

Build installers:

```bash
npm run dist:mac   # DMG
npm run dist:win   # NSIS installer
```

## Keyboard shortcuts

| Shortcut (macOS / Windows) | Action |
|---|---|
| `Option+Space` / `Alt+Space` (or `Cmd/Ctrl+Shift+Space`) | Play / pause |
| `Option+←/→` | Previous / next slide notes |
| `Option+↑/↓` | Manual scroll |
| `Option+L` | Toggle click-through vs interactive |
| `Option+H` | Show / hide overlay |
| `Cmd/Ctrl+Shift+Q` | Emergency quit |

## Project structure

```
.
├── main.js                       # Electron main process: windows, shortcuts, speech helper, mirror safety
├── teleprompter-studio.html      # Studio UI + overlay HUD renderer (single-file app)
├── macos-speech-helper.swift     # Native voice-activity helper (compiled to macos-speech-helper)
├── entitlements.mac.plist        # macOS hardened-runtime entitlements (mic / speech)
├── pdf.min.js, pdf.worker.min.js # PDF.js for PDF script extraction
├── package.json / package-lock.json
├── studio-redesign-concepts.html # UI/UX redesign concepts
├── ui-concepts-gallery.html      # UI design directions gallery
└── docs/
    ├── PRD.md                    # Product requirements document
    ├── flowcharts.md             # Mermaid diagrams (rendered on GitHub)
    └── diagrams/                 # Standalone .mmd sources
```

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [Flowcharts & architecture diagrams](docs/flowcharts.md)

## Privacy

Speech detection runs on-device. Scripts are stored in the app's local storage only. No network services or API keys are used.

## Limitations

Capture exclusion depends on the OS and conferencing app; always run the in-app Pre-Flight check before presenting.
