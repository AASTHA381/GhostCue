import Foundation
import AVFoundation
import Speech

// 100% On-Device Real-Time Word-Matching Speech Recognizer + Mic Level Streamer for GhostCue
// Compile with: npm run compile:speech

let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
let audioEngine = AVAudioEngine()
let recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
recognitionRequest.shouldReportPartialResults = true
if recognizer.supportsOnDeviceRecognition {
    recognitionRequest.requiresOnDeviceRecognition = true
}

var noiseFloor: Float = 0.0045
var speechStreak: Int = 0
var lastPrintTime: TimeInterval = 0
var wasSpeaking: Bool = false

let inputNode = audioEngine.inputNode
let format = inputNode.outputFormat(forBus: 0)
inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
    recognitionRequest.append(buffer)

    guard let channelData = buffer.floatChannelData?[0] else { return }
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

    if rms < noiseFloor * 1.8 {
        noiseFloor = max(0.002, min(0.015, noiseFloor * 0.94 + rms * 0.06))
    } else {
        noiseFloor = min(0.015, noiseFloor * 0.995 + rms * 0.005)
    }

    let rmsThreshold = max(0.015, noiseFloor * 2.8)
    let peakThreshold = max(0.055, noiseFloor * 6.5)
    let frameHasVoice = (rms > rmsThreshold) && (peak > peakThreshold)

    if frameHasVoice {
        speechStreak = min(5, speechStreak + 1)
    } else {
        speechStreak = max(0, speechStreak - 1)
    }

    let isSpeaking = speechStreak >= 2
    let now = Date().timeIntervalSince1970

    if isSpeaking && (now - lastPrintTime) > 0.08 {
        lastPrintTime = now
        wasSpeaking = true
        let pct = min(100, max(22, Int((rms - noiseFloor) * 950)))
        print("__VOICE_LEVEL__:\(pct)")
        fflush(stdout)
    } else if !isSpeaking && wasSpeaking && speechStreak == 0 {
        wasSpeaking = false
        print("__PHRASE_END__")
        fflush(stdout)
    }
}

audioEngine.prepare()
try! audioEngine.start()

let task = recognizer.recognitionTask(with: recognitionRequest) { result, error in
    if let r = result {
        let text = r.bestTranscription.formattedString
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            print("__TRANSCRIPT__:\(text)")
            fflush(stdout)
        }
    }
    if error != nil {
        // Exit cleanly so Electron respawns a fresh recognition session seamlessly
        exit(0)
    }
}

RunLoop.main.run()


