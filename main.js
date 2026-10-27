const { app, BrowserWindow, screen, globalShortcut, systemPreferences, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Prevent Chromium/macOS from throttling or pausing the teleprompter when Google Meet / Keynote / PDF is focused
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let studioWindow = null;
let overlayWindow = null;
let clickThrough = true;
let speechProcess = null;
let speechHelperDesired = false;
let isQuittingAppGlobal = false;

// Shows the Quick Drawer reliably, even after hide() or when presenting over a full-screen Space
function showStudioWindow() {
  if (!studioWindow || studioWindow.isDestroyed()) return;
  if (studioWindow.isMinimized()) studioWindow.restore();
  studioWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  studioWindow.setAlwaysOnTop(true, 'floating');
  studioWindow.show();
  studioWindow.moveTop();
  studioWindow.focus();
  studioWindow.webContents.executeJavaScript(
    `(function(){ var d = document.getElementById('quickDrawerShell'); if (d) d.classList.remove('drawer-collapsed'); })();`
  ).catch(() => {});
}

// Prevent multiple instances of GhostCue from ever opening duplicate speech notes
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showStudioWindow();
  });
}

// Keeps the HUD from being dragged/moved off every screen where it could never be grabbed again
function keepOverlayReachable(x, y, w, h) {
  const wa = screen.getDisplayNearestPoint({ x: Math.round(x + w / 2), y: Math.round(y + h / 2) }).workArea;
  const minVisible = 140;
  return {
    x: Math.round(Math.max(wa.x - w + minVisible, Math.min(wa.x + wa.width - minVisible, x))),
    y: Math.round(Math.max(0, Math.min(wa.y + wa.height - 60, y)))
  };
}

// Check if displays are in Hardware Mirror Mode (overlapping origin bounds across multiple displays)
function checkHardwareMirroringRisk() {
  const displays = screen.getAllDisplays();
  if (displays.length <= 1) return false;
  const origins = new Set();
  for (const d of displays) {
    const key = `${d.bounds.x},${d.bounds.y}`;
    if (origins.has(key)) return true;
    origins.add(key);
  }
  return false;
}

function enforceDisplayMirrorSafety() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const isMirrored = checkHardwareMirroringRisk();
  // Auto-shield overlay if an HDMI cable/projector is set to Hardware Mirror mode
  overlayWindow.setOpacity(isMirrored ? 0.0 : 1.0);
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.webContents.executeJavaScript(
      `if (typeof simulatedMirrorWarning !== 'undefined') { simulatedMirrorWarning = ${isMirrored}; updatePreflightDiagnostics(); }`
    ).catch(() => {});
  }
}

function stopNativeMacOsSpeechHelper() {
  speechHelperDesired = false;
  if (speechProcess) {
    const proc = speechProcess;
    speechProcess = null;
    try { proc.kill(); } catch (e) {}
  }
}

function startNativeMacOsSpeechHelper() {
  speechHelperDesired = true;
  if (speechProcess) return;
  const helperBin = path.join(__dirname, 'macos-speech-helper').replace('app.asar', 'app.asar.unpacked');
  if (process.platform !== 'darwin' || !fs.existsSync(helperBin)) return;
  try {
    speechProcess = spawn(helperBin);
    // A missing/unsigned/crashing helper must degrade to the browser VAD instead of throwing in the main process
    speechProcess.on('error', () => { speechProcess = null; });
    speechProcess.on('exit', () => {
      speechProcess = null;
      if (!isQuittingAppGlobal && speechHelperDesired) {
        setTimeout(() => {
          if (speechHelperDesired && !isQuittingAppGlobal) startNativeMacOsSpeechHelper();
        }, 200);
      }
    });
    speechProcess.stdout.on('error', () => {});
    speechProcess.stdout.on('data', (data) => {
      const rawLines = data.toString().trim().split(/\r?\n/);
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      for (const line of rawLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('__TRANSCRIPT__:')) {
          const transcriptText = trimmed.slice('__TRANSCRIPT__:'.length);
          const safeJson = JSON.stringify(transcriptText);
          overlayWindow.webContents.executeJavaScript(`
            if (typeof window.onNativeTranscript === 'function') window.onNativeTranscript(${safeJson});
          `).catch(() => {});
          if (studioWindow && !studioWindow.isDestroyed() && studioWindow.isVisible()) {
            studioWindow.webContents.executeJavaScript(`
              if (typeof window.onNativeTranscript === 'function') window.onNativeTranscript(${safeJson});
            `).catch(() => {});
          }
        } else if (trimmed === '__PHRASE_END__') {
          overlayWindow.webContents.executeJavaScript(`
            if (typeof window.onNativeVoicePhraseEnd === 'function') window.onNativeVoicePhraseEnd();
          `).catch(() => {});
          if (studioWindow && !studioWindow.isDestroyed()) {
            studioWindow.webContents.executeJavaScript(`
              if (typeof window.onNativeVoicePhraseEnd === 'function') window.onNativeVoicePhraseEnd();
            `).catch(() => {});
          }
        } else if (trimmed.startsWith('__VOICE_LEVEL__:') || trimmed === '__VOICE_ACTIVE__') {
          const pct = parseInt(trimmed.split(':')[1] || '65', 10) || 65;
          overlayWindow.webContents.executeJavaScript(`
            (function() {
              if (scrollMode !== 'voice') return;
              window.__externalVoiceActive = true;
              isVoiceSpeaking = true;
              clearTimeout(window.__nativeSpeechTimer);
              window.__nativeSpeechTimer = setTimeout(() => {
                window.__externalVoiceActive = false;
                isVoiceSpeaking = false;
                if (typeof window.onNativeVoicePhraseEnd === 'function') window.onNativeVoicePhraseEnd();
                if (scrollMode === 'voice') {
                  hudModeStatus.textContent = '🎙️ Voice Flow Paused · Speak Script Words to Scroll';
                }
              }, 340);
            })();
          `).catch(() => {});
          if (studioWindow && !studioWindow.isDestroyed() && studioWindow.isVisible()) {
            studioWindow.webContents.executeJavaScript(`
              (function() {
                if (scrollMode !== 'voice') return;
                window.__externalVoiceActive = true;
                isVoiceSpeaking = true;
                const bar = document.getElementById('micLevelBarFill');
                const badge = document.getElementById('micDbBadge');
                if (bar) bar.style.width = '${pct}%';
                if (badge) badge.textContent = '${pct}%';
                clearTimeout(window.__studioMicTimer);
                window.__studioMicTimer = setTimeout(() => {
                  window.__externalVoiceActive = false;
                  isVoiceSpeaking = false;
                  if (bar) bar.style.width = '4%';
                  if (badge) badge.textContent = 'SILENT';
                  const st = document.getElementById('micLevelStatusText');
                  if (st && scrollMode === 'voice') st.textContent = '🎙️ Paused (Silent) — Speak Script Words to Scroll';
                }, 340);
              })();
            `).catch(() => {});
          }
        }
      }
    });
  } catch (e) {}
}

async function createWindows() {
  if (process.platform === 'darwin' && systemPreferences.askForMediaAccess) {
    try { await systemPreferences.askForMediaAccess('microphone'); } catch (e) {}
  }

  // Automatically grant getUserMedia microphone access to GhostCue windows
  try {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media' || permission === 'audioCapture') {
        return callback(true);
      }
      callback(true);
    });
  } catch (e) {}

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  // 1. Main Script Studio & Calibration Window (Hidden when you close/minimize it so it never pops up over your slides!)
  let isQuittingApp = false;
  app.on('before-quit', () => {
    isQuittingApp = true;
    isQuittingAppGlobal = true;
  });

  studioWindow = new BrowserWindow({
    width: 1140,
    height: 610,
    x: Math.round((width - 1140) / 2),
    y: 262,
    show: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: true,
    title: 'GhostCue Quick Drawer',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true
    }
  });
  // Protect the Quick Drawer window from screen sharing/screenshots too
  studioWindow.setContentProtection(true);
  studioWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  studioWindow.setAlwaysOnTop(true, 'floating');
  studioWindow.loadFile(path.join(__dirname, 'teleprompter-studio.html'), {
    query: { mode: 'studio' }
  });

  // Clicking the red close button on Studio hides it instead of quitting, so you can present with ONLY the speech note
  studioWindow.on('close', (e) => {
    if (!isQuittingApp) {
      e.preventDefault();
      studioWindow.hide();
    }
  });

  // Clicking the GhostCue icon in the macOS Dock opens the Studio window when you want to upload/edit scripts
  app.on('activate', () => {
    showStudioWindow();
  });

  // 2. Floating Notch-Docked Stealth Teleprompter HUD
  const hudWidth = 600;
  const hudHeight = 360;

  overlayWindow = new BrowserWindow({
    width: hudWidth,
    height: hudHeight,
    x: Math.round((width - hudWidth) / 2),
    y: 0, // Window starts at 0, while CSS .teleprompter-hud starts at top: 28px directly below the MacBook Notch
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false, // Toggles to true automatically when Click-Through is OFF (Interactive Mode)
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  // CORE STEALTH API: Excludes window from Zoom, Teams, Google Meet, OBS & macOS ScreenCaptureKit
  overlayWindow.setContentProtection(true);

  // Stay visible across all macOS Spaces including Full-Screen Keynote/PowerPoint decks
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Enable Click-Through so mouse clicks pass down to underlying slides/apps
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, 'teleprompter-studio.html'), {
    query: { mode: 'overlay' }
  });

  // Ensure Overlay immediately syncs the active script from Studio once loaded
  overlayWindow.webContents.on('did-finish-load', () => {
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.executeJavaScript(
        `if (typeof broadcastState === 'function' && typeof scriptEditorEl !== 'undefined') { broadcastState('SCRIPT_UPDATE', { content: scriptEditorEl.value }); }`
      ).catch(() => {});
    }
  });

  let dragTimer = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartedAt = 0;

  function stopNativeOverlayDrag() {
    if (dragTimer) {
      clearInterval(dragTimer);
      dragTimer = null;
    }
  }

  // Bridge for 1-Click ✕ Close and Always-Clickable Top Bar on the Floating Speech Note
  const handleRendererIpc = (event, level, message) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (message === '__GHOSTCUE_IPC__:HEADER_ENTER') {
      overlayWindow.setIgnoreMouseEvents(false);
    } else if (message === '__GHOSTCUE_IPC__:HEADER_LEAVE') {
      if (clickThrough && !dragTimer) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    } else if (message === '__GHOSTCUE_IPC__:HIDE_OVERLAY') {
      stopNativeOverlayDrag();
      if (clickThrough) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
      overlayWindow.hide();
    } else if (message === '__GHOSTCUE_IPC__:SHOW_OVERLAY') {
      overlayWindow.showInactive();
      overlayWindow.webContents.executeJavaScript(`if (typeof setOverlayVisible === 'function') setOverlayVisible(true);`).catch(() => {});
    } else if (message === '__GHOSTCUE_IPC__:TOGGLE_STUDIO') {
      if (studioWindow && !studioWindow.isDestroyed()) {
        if (studioWindow.isVisible() && studioWindow.isFocused()) {
          studioWindow.hide();
        } else {
          showStudioWindow();
        }
      }
    } else if (message === '__GHOSTCUE_IPC__:HIDE_STUDIO') {
      if (studioWindow && !studioWindow.isDestroyed()) {
        studioWindow.hide();
      }
    } else if (message.startsWith('__GHOSTCUE_IPC__:SET_CLICK_THROUGH:')) {
      const locked = message.endsWith(':true');
      clickThrough = locked;
      if (locked) {
        stopNativeOverlayDrag();
        overlayWindow.setFocusable(false);
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        overlayWindow.setIgnoreMouseEvents(false);
        overlayWindow.setFocusable(true);
        overlayWindow.focus();
      }
    } else if (message === '__GHOSTCUE_IPC__:START_DRAG_OVERLAY') {
      stopNativeOverlayDrag();
      const cursor = screen.getCursorScreenPoint();
      const [winX, winY] = overlayWindow.getPosition();
      dragOffsetX = cursor.x - winX;
      dragOffsetY = cursor.y - winY;
      dragStartedAt = Date.now();
      dragTimer = setInterval(() => {
        if (!overlayWindow || overlayWindow.isDestroyed()) {
          stopNativeOverlayDrag();
          return;
        }
        // Failsafe: a lost mouse-up must never leave the HUD glued to the cursor
        if (Date.now() - dragStartedAt > 20000) {
          stopNativeOverlayDrag();
          return;
        }
        const pt = screen.getCursorScreenPoint();
        const [w, h] = overlayWindow.getSize();
        const pos = keepOverlayReachable(Math.round(pt.x - dragOffsetX), Math.round(pt.y - dragOffsetY), w, h);
        overlayWindow.setPosition(pos.x, pos.y);
      }, 16);
    } else if (message === '__GHOSTCUE_IPC__:STOP_DRAG_OVERLAY') {
      stopNativeOverlayDrag();
    } else if (message.startsWith('__GHOSTCUE_IPC__:MOVE_OVERLAY:')) {
      if (!dragTimer) {
        const parts = message.split(':');
        const dx = parseInt(parts[2] || '0', 10);
        const dy = parseInt(parts[3] || '0', 10);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        const [x, y] = overlayWindow.getPosition();
        const [w, h] = overlayWindow.getSize();
        const pos = keepOverlayReachable(x + dx, y + dy, w, h);
        overlayWindow.setPosition(pos.x, pos.y);
      }
    } else if (message.startsWith('__GHOSTCUE_IPC__:RESIZE_OVERLAY:')) {
      const parts = message.split(':');
      const reqW = parseInt(parts[2] || '600', 10);
      const reqH = parseInt(parts[3] || '360', 10);
      if (!Number.isFinite(reqW) || !Number.isFinite(reqH)) return;
      const [curX, curY] = overlayWindow.getPosition();
      const wa = screen.getDisplayNearestPoint({ x: curX, y: curY }).workArea;
      const newW = Math.min(wa.width, Math.max(420, reqW));
      const newH = Math.min(wa.height, Math.max(260, reqH));
      overlayWindow.setSize(newW, newH);
    } else if (message === '__GHOSTCUE_IPC__:SNAP_NOTCH') {
      stopNativeOverlayDrag();
      const [curW] = overlayWindow.getSize();
      overlayWindow.setPosition(Math.round((width - curW) / 2), 0);
    } else if (message === '__GHOSTCUE_IPC__:VOICE_MODE_START') {
      startNativeMacOsSpeechHelper();
    } else if (message === '__GHOSTCUE_IPC__:VOICE_MODE_STOP') {
      stopNativeMacOsSpeechHelper();
    } else if (message.startsWith('__GHOSTCUE_IPC__:SET_STEALTH_PROTECTION:')) {
      const enabled = message.endsWith(':true');
      try {
        overlayWindow.setContentProtection(enabled);
        if (studioWindow && !studioWindow.isDestroyed()) {
          studioWindow.setContentProtection(enabled);
        }
      } catch (e) {}
    }
  };
  overlayWindow.webContents.on('console-message', handleRendererIpc);
  studioWindow.webContents.on('console-message', handleRendererIpc);

  // Monitor external HDMI / DisplayPort connections for Mirror Mode safety
  screen.on('display-added', enforceDisplayMirrorSafety);
  screen.on('display-removed', enforceDisplayMirrorSafety);
  screen.on('display-metrics-changed', enforceDisplayMirrorSafety);
  enforceDisplayMirrorSafety();

  // Note: Native SFSpeechRecognizer helper is started on-demand ONLY when Voice Flow mode is activated,
  // keeping idle CPU/Neural Engine usage at 0%.

  // Global Hotkeys that work even when Keynote, PowerPoint, Chrome, or Zoom is focused!
  const sendKeyToOverlay = (key, code) => {
    const js = `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${code}' }));`;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.executeJavaScript(js).catch(() => {});
    }
  };

  // Play / Pause Prompter WITHOUT triggering Spacebar slide changes in PowerPoint/Google Slides
  globalShortcut.register('Alt+Space', () => sendKeyToOverlay(' ', 'Space'));
  globalShortcut.register('CommandOrControl+Shift+Space', () => sendKeyToOverlay(' ', 'Space'));

  // Next / Prev Slide Sync from anywhere
  globalShortcut.register('Alt+Right', () => sendKeyToOverlay('ArrowRight', 'ArrowRight'));
  globalShortcut.register('Alt+Left', () => sendKeyToOverlay('ArrowLeft', 'ArrowLeft'));
  globalShortcut.register('CommandOrControl+Shift+Right', () => sendKeyToOverlay('ArrowRight', 'ArrowRight'));
  globalShortcut.register('CommandOrControl+Shift+Left', () => sendKeyToOverlay('ArrowLeft', 'ArrowLeft'));

  // Speed Up / Slow Down WPM from anywhere
  globalShortcut.register('Alt+Up', () => sendKeyToOverlay('ArrowUp', 'ArrowUp'));
  globalShortcut.register('Alt+Down', () => sendKeyToOverlay('ArrowDown', 'ArrowDown'));
  globalShortcut.register('CommandOrControl+Shift+Up', () => sendKeyToOverlay('ArrowUp', 'ArrowUp'));
  globalShortcut.register('CommandOrControl+Shift+Down', () => sendKeyToOverlay('ArrowDown', 'ArrowDown'));

  // Toggle Click-Through vs. Interactive Mode
  const toggleClickThroughShortcut = () => {
    clickThrough = !clickThrough;
    if (clickThrough) {
      stopNativeOverlayDrag();
      overlayWindow.setFocusable(false);
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
      overlayWindow.setFocusable(true);
      overlayWindow.focus();
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.executeJavaScript(`if (typeof setClickThroughMode === 'function') setClickThroughMode(${clickThrough}, true);`).catch(() => {});
    }
  };
  globalShortcut.register('Alt+L', toggleClickThroughShortcut);
  globalShortcut.register('CommandOrControl+Shift+L', toggleClickThroughShortcut);

  // Hide / Show Floating Notch Overlay instantly from anywhere
  const toggleOverlayVisibility = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (overlayWindow.isVisible()) {
      if (clickThrough) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
      overlayWindow.hide();
      if (studioWindow && !studioWindow.isDestroyed()) {
        studioWindow.webContents.executeJavaScript(`if (typeof setOverlayVisible === 'function') setOverlayVisible(false);`).catch(() => {});
      }
    } else {
      overlayWindow.showInactive();
      overlayWindow.webContents.executeJavaScript(`if (typeof setOverlayVisible === 'function') setOverlayVisible(true);`).catch(() => {});
      if (studioWindow && !studioWindow.isDestroyed()) {
        studioWindow.webContents.executeJavaScript(`if (typeof setOverlayVisible === 'function') setOverlayVisible(true);`).catch(() => {});
      }
    }
  };
  globalShortcut.register('Alt+H', toggleOverlayVisibility);
  globalShortcut.register('CommandOrControl+Shift+H', toggleOverlayVisibility);

  // Emergency Quit GhostCue from anywhere
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit();
  });
}

app.whenReady().then(createWindows);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (speechProcess) {
    try { speechProcess.kill(); } catch (e) {}
  }
});
