// Frames to an MP4, with the Mac's own H.264 encoder (no ffmpeg needed).
//
//     swift scripts/pack-empire-teaser/encode.swift <frames-dir> <fps> <out.mp4>
//
// The frames are the JPEGs render.py writes, in name order. Tagged Rec. 709 so
// the colours come out the way the browser drew them.

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 4, let fps = Int32(args[2]) else {
  print("usage: encode.swift <frames-dir> <fps> <out.mp4>")
  exit(2)
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[3])

let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
  .filter { ["jpg", "png"].contains($0.pathExtension) }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }

func image(_ url: URL) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

guard let first = files.first, let img0 = image(first) else {
  print("no frames in \(dir.path)")
  exit(1)
}
let w = img0.width
let h = img0.height
// Generous for the size: the platforms recompress, so start them from a clean master.
let bitrate = Int(Double(w * h) * Double(fps) * 0.14)

try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: w,
  AVVideoHeightKey: h,
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
    AVVideoExpectedSourceFrameRateKey: Int(fps),
  ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: w,
  kCVPixelBufferHeightKey as String: h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
for (i, file) in files.enumerated() {
  autoreleasepool {
    guard let img = image(file), let pool = adaptor.pixelBufferPool else { return }
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    guard let pb = buffer else { return }
    CVPixelBufferLockBaseAddress(pb, [])
    let ctx = CGContext(
      data: CVPixelBufferGetBaseAddress(pb), width: w, height: h, bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: space, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    )!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    CVPixelBufferUnlockBaseAddress(pb, [])
    adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
  }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else {
  print("encode failed: \(String(describing: writer.error))")
  exit(1)
}
print("wrote \(out.path): \(files.count) frames, \(w)x\(h) at \(fps)fps")
