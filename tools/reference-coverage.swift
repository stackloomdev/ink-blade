// Generates render coverage, never rewrites the supplied RGB artwork.
// macOS 14+; uses the on-device Vision foreground model, no service or API key.
// swift -module-cache-path /tmp/ink-swift-cache tools/reference-coverage.swift
import Foundation
import Vision
import CoreVideo

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let inputs = root.appendingPathComponent("assets/reference/turnarounds")
let output = root.appendingPathComponent("assets/rig/coverage")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let names = CommandLine.arguments.dropFirst().isEmpty
    ? ["hero-front", "hero-side", "hero-back", "hero-weapons", "boss-front", "boss-side-back", "boss-weapons"]
    : Array(CommandLine.arguments.dropFirst())
for name in names {
    let sourceName = name == "boss-weapons" ? "boss-side-back" : name
    let handler = VNImageRequestHandler(url: inputs.appendingPathComponent(sourceName + ".png"), options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    if name == "boss-weapons" { request.regionOfInterest = CGRect(x: 0, y: 0, width: 200.0/1448.0, height: 1) }
    try handler.perform([request])
    guard let observation = request.results?.first else { fatalError("No foreground: \(name)") }
    let mask = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    let width = CVPixelBufferGetWidth(mask), height = CVPixelBufferGetHeight(mask)
    let stride = CVPixelBufferGetBytesPerRow(mask)
    let format = CVPixelBufferGetPixelFormatType(mask)
    let base = CVPixelBufferGetBaseAddress(mask)!
    var bytes = [UInt8](repeating: 0, count: width * height)
    for y in 0..<height {
        if format == kCVPixelFormatType_OneComponent32Float {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: Float.self)
            for x in 0..<width { bytes[y * width + x] = UInt8(max(0, min(255, Int(row[x] * 255)))) }
        } else if format == kCVPixelFormatType_OneComponent8 {
            let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
            for x in 0..<width { bytes[y * width + x] = row[x] }
        } else { fatalError("Unsupported coverage format: \(format)") }
    }
    CVPixelBufferUnlockBaseAddress(mask, .readOnly)
    var data = Data()
    for value in [UInt32(width), UInt32(height)] {
        var little = value.littleEndian
        withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
    }
    data.append(contentsOf: bytes)
    try data.write(to: output.appendingPathComponent(name + ".coverage"))
    print("\(name): \(width)×\(height), \(observation.allInstances.count) subjects, \(data.count) bytes")
}
