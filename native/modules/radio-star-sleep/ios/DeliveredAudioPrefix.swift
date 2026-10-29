import Foundation
import CryptoKit

/// Bytes actually delivered through this asset's loader. No URL-probe proof.
/// A cached prefix is immutable for the life of the asset, including Undo.
final class DeliveredAudioPrefix {
  static let maximumBytes = 8 * 1024 * 1024
  private(set) var data = Data()
  private var hashes: [Int: String] = [:]
  private var deliveredGap = false
  func delivered(_ input: Data, at offset: Int64) -> Data {
    guard offset >= 0, offset < Int64(Self.maximumBytes) else { return input }
    let start = Int(offset), boundedEnd = min(Self.maximumBytes, start + input.count)
    if start > data.count { deliveredGap = true }
    var output = input
    // Subsequent requests cannot replace bytes already served to AVPlayer.
    if start < data.count {
      let overlap = min(data.count - start, input.count)
      output.replaceSubrange(0..<overlap, with: data[start..<(start + overlap)])
    }
    if start <= data.count && boundedEnd > data.count {
      data.append(output[(data.count - start)..<(boundedEnd - start)])
    }
    return output
  }
  func matches(bytes: Int, sha256: String) -> Bool {
    guard !deliveredGap, bytes > 0, bytes <= Self.maximumBytes, bytes <= data.count,
          sha256.count == 64, sha256.allSatisfy({ $0.isHexDigit && !$0.isUppercase }) else { return false }
    if hashes[bytes] == nil { hashes[bytes] = SHA256.hash(data: data.prefix(bytes)).map { String(format: "%02x", $0) }.joined() }
    return hashes[bytes] == sha256
  }
}
