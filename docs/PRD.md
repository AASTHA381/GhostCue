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

## 10. Phase 2 — AI-Powered Real-Time Interview Co-Pilot (v2.0)

### 10.1 Objective
Enable candidates to upload their **Resume** and target **Job Description (JD)** before an interview and receive real-time, concise, spoken-style suggested answers inside GhostCue's capture-invisible webcam HUD as the interviewer asks questions—strictly grounded in the candidate's real experience without inventing qualifications.

### 10.2 Phase 2 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-15 | **Resume & JD Ingestion:** Upload `.PDF`, `.DOCX`, `.DOC`, `.TXT`, or paste text for both Candidate Resume and Target Job Description; automatically index experience bullets, quantified metrics, and matched vs. missing JD skills. | P0 |
| FR-16 | **Live Interviewer Question Capture:** Stream spoken interviewer questions via on-device `SFSpeechRecognizer` with automatic 650 ms end-of-question pause detection, plus 1-click/manual question input. | P0 |
| FR-17 | **Two-Stage Low-Latency Answer Generation:** Stage 1 renders a deterministic grounded STAR/Role-Fit answer in **<15 ms**; Stage 2 optionally streams a cloud LLM refinement (Groq `llama-3.3-70b-versatile`, OpenAI `gpt-4o-mini`, or Gemini 2.0 Flash) in **~220–400 ms** first-token latency. | P0 |
| FR-18 | **Strict Grounding & Honest Gap Guardrail:** Never fabricate employers, metrics, or skills. When asked about a skill/tool absent from the resume (e.g., Kubernetes, Rust), explicitly flag `⚠️ HONEST GAP ALERT` and suggest a transparent response that pivots to the candidate's closest verified experience. | P0 |
| FR-19 | **Spoken-Style HUD Formatting:** Format suggested answers in first-person conversational sentences (`60–90` words) with `**bold**` metric callouts and `[PAUSE 2s]` breathing cues inside the webcam-docked HUD. | P0 |
| FR-20 | **Local-First Privacy & Consent:** Store Resume, JD, and optional BYOK API keys strictly in local storage; never log or transmit data unless the user explicitly enables a cloud LLM provider. | P0 |

