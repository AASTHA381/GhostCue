import Foundation
import AVFoundation

// 100% Crash-Safe Native macOS Microphone Voice-Activity & Level Streamer for GhostCue
// Compile with: swiftc macos-speech-helper.swift -o macos-speech-helper

final class NativeMicVoiceStreamer {
    private let audioEngine = AVAudioEngine()
    private var noiseFloor: Float = 0.0025
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

            // Adaptive ambient noise floor tracker (slowly adapts to quiet room background)
            if rms < self.noiseFloor * 1.4 {
                self.noiseFloor = max(0.0008, min(0.006, self.noiseFloor * 0.95 + rms * 0.05))
            }

            // Detect human voice whenever RMS exceeds adaptive noise floor + margin or 0.0045
            let threshold = max(0.0042, self.noiseFloor * 1.85)
            let isSpeaking = (rms > threshold) || (peak > threshold * 2.6)
            let now = Date().timeIntervalSince1970

            if isSpeaking && (now - self.lastPrintTime) > 0.09 {
                self.lastPrintTime = now
                let pct = min(100, max(18, Int(rms * 1400)))
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


