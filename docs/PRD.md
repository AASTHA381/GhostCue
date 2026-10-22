# GhostCue — Product Requirements Document

| | |
|---|---|
| **Product** | GhostCue — Invisible Webcam Teleprompter & Pitch Studio |
| **Version** | 1.0.0 |
| **Platforms** | macOS (arm64 DMG), Windows (NSIS) |
| **Status** | Reverse-documented from the v1.0.0 codebase |

## 1. Problem

Presenters on video calls look away from the camera to read notes, or risk exposing notes when sharing their screen. Existing teleprompters are visible in screen shares or sit far from the webcam.

## 2. Goals

1. Show script text near the webcam so eye contact is preserved.
2. Keep the teleprompter invisible to screen-share and recording audiences.
3. Let the presenter control pacing hands-free (WPM or voice).
4. Import existing material (PDF, DOCX, PPTX notes) with no re-typing.
5. Make it safe to present: detect risks (mirrored displays) before they leak notes.

### Non-goals
Cloud sync, collaboration, AI script writing, mobile apps, and server-side speech recognition.

## 3. Target users

Founders pitching to investors, sales and customer-success teams on calls, and educators or creators recording or streaming.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Floating overlay window, always-on-top, visible on all workspaces and over full-screen apps | P0 |
| FR-2 | Overlay excluded from screen capture (content protection) | P0 |
| FR-3 | Click-through mode with a global shortcut to switch to interactive mode | P0 |
| FR-4 | Constant-WPM auto-scroll with an adjustable target speed | P0 |
| FR-5 | Voice-Sync scrolling driven by on-device voice activity (macOS native helper) | P1 |
| FR-6 | Script cues: `[SLIDE N]`, `[PAUSE Ns]` (auto-pause), `[SLOW DOWN]` (about 22% slower), `**bold**` highlights | P0 |
| FR-7 | Slide-synced notes with next/previous navigation and optional pause at each `[SLIDE]` | P1 |
| FR-8 | Script library: create, select, delete, clear all; persisted locally | P0 |
| FR-9 | Import scripts from PDF, DOCX and PPTX speaker notes; export to Markdown | P1 |
| FR-10 | Pre-flight check: capture affinity, HDMI mirroring, microphone | P0 |
| FR-11 | Auto-hide overlay (opacity 0) when displays are hardware-mirrored | P0 |
| FR-12 | Audience-view self-test preview (`S`) | P2 |
| FR-13 | Global shortcuts: play/pause, slide nav, scroll, lock, show/hide, emergency quit | P0 |
| FR-14 | Snap overlay back under the webcam notch ("Dock to Notch") and drag to reposition | P1 |

## 5. Non-functional requirements

- **Privacy:** speech processing is local; no telemetry and no network calls for core features.
- **Performance:** background throttling is disabled so scrolling stays smooth when other apps are focused.
- **Security:** no secrets in the repo; microphone access is granted only for `media` / `audioCapture` permissions; hardened runtime on macOS.
- **Reliability:** the overlay shields itself on risky display configurations.

## 6. User flows

See [flowcharts.md](flowcharts.md): presenter session flow, script cue processing, voice-sync pipeline, and pre-flight and mirror-safety logic.

## 7. System overview

Two Electron `BrowserWindow`s (Studio and Overlay HUD) load the same renderer. The main process owns global shortcuts, display monitoring, and the native speech helper. Commands pass between windows through the main process and `localStorage` (`ghostcue_live_cmd_v1`). See the architecture diagram in [flowcharts.md](flowcharts.md).

## 8. Success metrics

- Presenter can start a session in under 60 seconds from install.
- 0 reported cases of the overlay showing in a shared screen when pre-flight passes.
- At least 80% of scripts imported without manual cleanup.

## 9. Risks and open questions

| Risk | Mitigation |
|---|---|
| Some conferencing or capture tools ignore OS content protection | Pre-flight check plus audience-view test; document limitations |
| Voice-Sync is macOS-only | Constant-WPM fallback on Windows; evaluate a Windows helper |
| Hardware-mirror detection is heuristic (matching display origins) | Manual simulate/alert in pre-flight |
| Unsigned or unnotarized builds trigger Gatekeeper warnings | Add signing and notarization to the release pipeline |

## 10. Future work

Windows voice-sync, auto-update, script templates, per-slide timers, and cloud backup (opt-in).
