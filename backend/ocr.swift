import Foundation
import Vision
import AppKit
// Pixels arrive on stdin; this helper never captures a screen itself.
let data = FileHandle.standardInput.readDataToEndOfFile()
guard let image = NSImage(data: data), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Invalid image\n", stderr); exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
do {
    try VNImageRequestHandler(cgImage: cg).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    let result = try JSONSerialization.data(withJSONObject: ["text": lines.joined(separator: "\n")])
    FileHandle.standardOutput.write(result)
} catch { fputs("Local OCR failed\n", stderr); exit(1) }
