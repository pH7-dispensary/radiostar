import Foundation
import CryptoKit

/// Rolling bytes actually delivered to the same AVPlayer asset. Checkpoints
/// bind every preceding 64 KiB block, including gaps/dynamic insertions. Only
/// 8 MiB of rolling audio is retained; older blocks keep hashes, not audio.
final class DeliveredAudioChain {
  static let blockBytes = 65536
  static let maximumBlocks = 128
  private struct Block { var bytes = Data(repeating:0,count:DeliveredAudioChain.blockBytes); var covered=IndexSet() }
  private var blocks:[Int:Block]=[:], order:[Int]=[]
  private var digests:[Int:Data]=[:], lengths:[Int:Int]=[:], checkpoints:[Int64:String]=[:]
  private var next=0, chain=Data(repeating:0,count:32), revisits=Set<Int>(), lostPartialBlocks=Set<Int>()
  private var totalLength:Int64?, invalid=false
  func setLength(_ length:Int64) {
    if let old=totalLength,old != length {invalid=true;return}
    totalLength=length
  }
  func delivered(_ input:Data, at offset:Int64)->Data {
    guard offset>=0,offset+Int64(input.count)<=2*1024*1024*1024 else {invalid=true;return input}
    var output=input, consumed=0
    while consumed<input.count {
      let absolute=offset+Int64(consumed),index=Int(absolute/Int64(Self.blockBytes)),start=Int(absolute%Int64(Self.blockBytes))
      let count=min(Self.blockBytes-start,input.count-consumed)
      if blocks[index]==nil {
        if digests[index] != nil {revisits.insert(index)}
        if blocks.count>=Self.maximumBlocks,let oldest=order.first {
          // Never certify bytes whose earlier partial delivery was forgotten.
          if digests[oldest]==nil {lostPartialBlocks.insert(oldest)}
          blocks.removeValue(forKey:oldest);order.removeFirst()
        }
        blocks[index]=Block();order.append(index)
      }
      var block=blocks[index]!
      for range in block.covered.rangeView {
        let lower=max(range.lowerBound,start),upper=min(range.upperBound,start+count)
        if lower<upper {output.replaceSubrange((consumed+lower-start)..<(consumed+upper-start),with:block.bytes[lower..<upper])}
      }
      block.bytes.replaceSubrange(start..<(start+count),with:output[consumed..<(consumed+count)])
      block.covered.insert(integersIn:start..<(start+count));blocks[index]=block
      let expected=totalLength.map{min(Self.blockBytes,max(0,Int($0)-index*Self.blockBytes))} ?? Self.blockBytes
      if expected>0 && block.covered.contains(integersIn:0..<expected) {
        let digest=Data(SHA256.hash(data:block.bytes.prefix(expected)))
        if let prior=digests[index],prior != digest {invalid=true}
        digests[index]=digest;lengths[index]=expected;revisits.remove(index)
      }
      consumed+=count
    }
    while let digest=digests[next],let length=lengths[next] {
      chain=Data(SHA256.hash(data:chain+digest));checkpoints[Int64(next*Self.blockBytes+length)]=chain.map{String(format:"%02x",$0)}.joined();next+=1
    }
    return output
  }
  func matches(endByte:Int64,sha256:String)->Bool {
    !invalid && endByte>0 && revisits.union(lostPartialBlocks).allSatisfy{Int64($0*Self.blockBytes)>=endByte} && checkpoints[endByte]==sha256
  }
  var retainedBytes:Int {blocks.count*Self.blockBytes}
}
