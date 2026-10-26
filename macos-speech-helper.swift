import Foundation
import AVFoundation

// 100% Crash-Safe Native macOS Microphone Voice-Activity & Level Streamer for GhostCue
// Compile with: swiftc macos-speech-helper.swift -o macos-speech-helper

final class NativeMicVoiceStreamer {
    private let audioEngine = AVAudioEngine()
    private var noiseFloor: Float = 0.0045
    private var speechStreak: Int = 0
    private var lastPrintTime: TimeInterval = 0

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

            // Require clear voice energy above ambient noise floor (typical room noise RMS ~0.004-0.006, speech RMS ~0.025-0.12)
            let rmsThreshold = max(0.015, self.noiseFloor * 2.8)
            let peakThreshold = max(0.055, self.noiseFloor * 6.5)
            let frameHasVoice = (rms > rmsThreshold) && (peak > peakThreshold)

            if frameHasVoice {
                self.speechStreak = min(10, self.speechStreak + 1)
            } else {
                self.speechStreak = max(0, self.speechStreak - 1)
            }

            // Require at least 2 consecutive voiced buffers (~45ms) to reject clicks/pops
            let isSpeaking = self.speechStreak >= 2
            let now = Date().timeIntervalSince1970

            if isSpeaking && (now - self.lastPrintTime) > 0.08 {
                self.lastPrintTime = now
                let pct = min(100, max(22, Int((rms - self.noiseFloor) * 950)))
                print("__VOICE_LEVEL__:\(pct)")
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


