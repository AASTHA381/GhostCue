import Foundation
import AVFoundation

// 100% Crash-Safe Native macOS Microphone Voice-Activity & Level Streamer for GhostCue
// Compile with: swiftc macos-speech-helper.swift -o macos-speech-helper

final class NativeMicVoiceStreamer {
    private let audioEngine = AVAudioEngine()
    private var noiseFloor: Float = 0.0045
    private var speechStreak: Int = 0
    private var lastPrintTime: TimeInterval = 0
    private var envFast: Float = 0
    private var envSlow: Float = 0
    private var inPulse: Bool = false
    private var lastPulseTime: TimeInterval = 0
    private var wasSpeaking: Bool = false

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            self.beginAudioTap()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if granted {
                    DispatchQueue.main.async {
                        self.beginAudioTap()
                    }
                }
            }
        default:
            break
        }
    }

    private func beginAudioTap() {
        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.channelCount > 0 else { return }

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self, let channelData = buffer.floatChannelData?[0] else { return }
            let frameLength = Int(buffer.frameLength)
            guard frameLength > 0 else { return }

            var sum: Float = 0
            var peak: Float = 0
            for i in 0..<frameLength {
                let s = abs(channelData[i])
                sum += s * s
                if s > peak { peak = s }
            }
            let rms = sqrt(sum / Float(frameLength))

            // Track ambient room noise floor when signal isn't an active loud voice spike
            if rms < self.noiseFloor * 1.8 {
                self.noiseFloor = max(0.002, min(0.015, self.noiseFloor * 0.94 + rms * 0.06))
            } else {
                // Very slow upward drift so a loud fan/AC doesn't permanently lock as speech
                self.noiseFloor = min(0.015, self.noiseFloor * 0.995 + rms * 0.005)
            }

            self.envFast = self.envFast * 0.35 + rms * 0.65
            self.envSlow = self.envSlow * 0.85 + rms * 0.15

            // Require clear voice energy above ambient noise floor (typical room noise RMS ~0.004-0.006, speech RMS ~0.025-0.12)
            let rmsThreshold = max(0.015, self.noiseFloor * 2.8)
            let peakThreshold = max(0.055, self.noiseFloor * 6.5)
            let frameHasVoice = (rms > rmsThreshold) && (peak > peakThreshold)

            if frameHasVoice {
                self.speechStreak = min(5, self.speechStreak + 1)
            } else {
                self.speechStreak = max(0, self.speechStreak - 1)
            }

            // Require at least 2 consecutive voiced buffers (~45ms) to reject clicks/pops
            let isSpeaking = self.speechStreak >= 2
            let now = Date().timeIntervalSince1970

            // Detect real-time syllable/word energy peaks so fast speakers advance every word without waiting for WPM
            if isSpeaking {
                let isOnset = !self.inPulse && self.envFast > self.envSlow * 1.07 && (now - self.lastPulseTime) > 0.13
                let isSustainedWord = (now - self.lastPulseTime) > 0.25
                if isOnset || isSustainedWord {
                    self.inPulse = true
                    self.lastPulseTime = now
                    print("__WORD_PULSE__")
                    fflush(stdout)
                }
            }
            if self.envFast < self.envSlow * 0.92 || !isSpeaking {
                self.inPulse = false
            }

            if isSpeaking && (now - self.lastPrintTime) > 0.08 {
                self.lastPrintTime = now
                self.wasSpeaking = true
                let pct = min(100, max(22, Int((rms - self.noiseFloor) * 950)))
                print("__VOICE_LEVEL__:\(pct)")
                fflush(stdout)
            } else if !isSpeaking && self.wasSpeaking && self.speechStreak == 0 {
                // Presenter finished a phrase or sentence — notify renderer so it snaps cleanly to the next unread line
                self.wasSpeaking = false
                print("__PHRASE_END__")
                fflush(stdout)
            }
        }

        audioEngine.prepare()
        try? audioEngine.start()
    }
}

let streamer = NativeMicVoiceStreamer()
streamer.start()
RunLoop.main.run()


