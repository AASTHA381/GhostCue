# GhostCue — Flowcharts & Diagrams

Standalone sources live in [diagrams/](diagrams/). They are embedded here so GitHub renders them.

## 1. Presenter session flow

```mermaid
flowchart TD
    A([Launch GhostCue]) --> B[Open Studio window]
    B --> C{Script source}
    C -->|Type / paste| D[Edit script with cues]
    C -->|Import PDF / DOCX / PPTX| D
    C -->|Pick from library| D
    D --> E[Run Pre-Flight check]
    E --> F{Mirroring or capture risk?}
    F -->|Yes| G[Fix display setup / overlay auto-hides]
    G --> E
    F -->|No| H[Choose scroll mode]
    H -->|Constant WPM| I[Set target WPM]
    H -->|Voice-Sync| J[Enable mic tracking]
    I --> K[Present Now: Studio hides, HUD docks under notch]
    J --> K
    K --> L[Share screen on Zoom / Meet / Teams]
    L --> M[Read script, control via global shortcuts]
    M --> N{Done?}
    N -->|No| M
    N -->|Yes| O([Cmd/Ctrl+Shift+Q or close])
```

## 2. Script cue processing

```mermaid
flowchart TD
    A[Raw script text] --> B[Split into lines]
    B --> C[Escape HTML entities]
    C --> D{Line contains cue?}
    D -->|"[SLIDE N]"| E[Start new slide section]
    D -->|"[PAUSE Ns]"| F[Sum pause seconds, render pause pill]
    D -->|"[SLOW DOWN]"| G[Render delivery pill, slow scroll about 22%]
    D -->|"**bold**"| H[Highlight key metric]
    D -->|None| I[Plain line]
    E --> J[Render HUD line]
    F --> J
    G --> J
    H --> J
    I --> J
    J --> K{Scroll loop reaches line}
    K -->|Has pause| L[Auto-pause N seconds once, then resume]
    K -->|Slide boundary and Pause-at-slide ON| M[Pause until user resumes]
    K -->|Otherwise| N[Continue scrolling]
```

## 3. Voice-sync pipeline

```mermaid
sequenceDiagram
    participant Mic as Microphone
    participant Helper as macos-speech-helper (Swift)
    participant Main as Electron main.js
    participant HUD as Overlay HUD
    participant Studio as Studio window

    Main->>Helper: spawn() on darwin
    Mic->>Helper: audio input
    Helper-->>Main: stdout __VOICE_LEVEL__:pct / __VOICE_ACTIVE__
    Main->>HUD: executeJavaScript (if scrollMode is voice)
    HUD->>HUD: isVoiceSpeaking = true, scroll script
    Main->>Studio: update mic level bar and badge
    Note over HUD,Studio: 520 ms silence timer resets state to Listening
    Main->>Helper: kill() on will-quit
```

## 4. Mirror safety & pre-flight

```mermaid
flowchart TD
    A[Display change or startup] --> B[screen.getAllDisplays]
    B --> C{More than 1 display?}
    C -->|No| D[Overlay opacity 1.0]
    C -->|Yes| E{Two displays share same x,y origin?}
    E -->|No| D
    E -->|Yes| F[Hardware mirror detected]
    F --> G[Overlay opacity 0.0]
    F --> H[Studio shows mirroring warning in Pre-Flight]
    D --> I[Pre-Flight shows safe status]
```

## 5. Architecture

```mermaid
flowchart LR
    subgraph Electron
        Main[main.js<br/>main process]
        Studio[Studio BrowserWindow<br/>teleprompter-studio.html]
        HUD[Overlay BrowserWindow<br/>content-protected, click-through]
        Main --- Studio
        Main --- HUD
    end
    Shortcuts[Global shortcuts] --> Main
    Main -->|sendKeyToOverlay| HUD
    Studio <-->|localStorage ghostcue_live_cmd_v1| HUD
    Helper[macos-speech-helper<br/>Swift, on-device] -->|stdout voice level| Main
    Displays[Electron screen API] --> Main
    PDFJS[pdf.min.js] --> Studio
    Studio --> Store[(localStorage<br/>script library)]
```

## 6. Phase 2 — AI Interview Co-Pilot Pipeline

```mermaid
flowchart TD
    subgraph Prep["1. Pre-Interview Setup (Studio Drawer)"]
        R[Upload / Paste Candidate Resume<br/>.PDF, .DOCX, .TXT] --> IDX[Local Fact & Skill Indexer]
        J[Upload / Paste Target Job Description] --> IDX
        IDX --> GAP[Compute Matched JD Skills vs.<br/>Missing Skill Gap Alerts]
    end

    subgraph Live["2. Live Interview Question Capture"]
        MIC[Interviewer Audio / Question] --> ASR[Apple On-Device SFSpeechRecognizer<br/>+ Manual Question Input]
        ASR --> Silence{650ms Question-End<br/>Pause Detected?}
    end

    subgraph Engine["3. Grounded Anti-Hallucination Answer Engine"]
        Silence -->|Yes| CheckGap{Question asks about skill<br/>NOT in Resume?}
        CheckGap -->|Yes: Unlisted Skill| Honest[Generate Honest Gap Response<br/>+ Pivot to Closest Real Bullet]
        CheckGap -->|No: Supported by Resume| STAR[Stage 1: Instant <15ms Local STAR Answer<br/>Stage 2: Optional Groq/OpenAI/Gemini Stream]
    end

    subgraph Display["4. Stealth Webcam HUD Delivery"]
        Honest --> HUD[Render 3-Sentence Spoken Answer<br/>in Capture-Invisible Notch HUD]
        STAR --> HUD
    end
```

