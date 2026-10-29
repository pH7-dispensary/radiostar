import Foundation
import CryptoKit
import AVFoundation

@main struct DeliveredAudioTest {
  static func hash(_ data:Data)->String { SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined() }
  static func wait(_ timeout:Double, _ predicate:()->Bool) -> Bool {
    let deadline=Date().addingTimeInterval(timeout)
    while !predicate() && Date()<deadline { RunLoop.main.run(until:Date().addingTimeInterval(0.02)) }
    return predicate()
  }
  static func main() throws {
    let witness=DeliveredAudioPrefix(), original=Data((0..<256).map{UInt8($0)})
    assert(!witness.matches(bytes:256,sha256:hash(original)))
    assert(witness.delivered(original.prefix(100),at:0)==original.prefix(100))
    assert(witness.delivered(original.subdata(in:100..<256),at:100)==original.subdata(in:100..<256))
    assert(witness.matches(bytes:256,sha256:hash(original)))
    assert(!witness.matches(bytes:257,sha256:hash(original)))
    assert(!witness.matches(bytes:256,sha256:String(repeating:"0",count:64)))
    // Repeat/Undo receives preserved actual bytes, even if a CDN response has changed.
    assert(witness.delivered(Data(repeating:7,count:128),at:0)==original.prefix(128))
    assert(witness.matches(bytes:256,sha256:hash(original)))
    let gap=DeliveredAudioPrefix();_=gap.delivered(original,at:1000);_=gap.delivered(original,at:0);assert(!gap.matches(bytes:256,sha256:hash(original)),"A later prefix must not retroactively certify earlier unrecorded delivery")
    let bounded=DeliveredAudioPrefix();_=bounded.delivered(Data(repeating:1,count:DeliveredAudioPrefix.maximumBytes+1000),at:0);assert(bounded.data.count==DeliveredAudioPrefix.maximumBytes)
    assert(!DeliveredAudioLoader.allowed(URL(string:"http://example.com/a.mp3")!));assert(!DeliveredAudioLoader.allowed(URL(string:"https://127.0.0.1/a.mp3")!))
    let configuration:[String:Any]
    if CommandLine.arguments.count==2 {
      configuration=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1]))) as! [String:Any]
    } else if CommandLine.arguments.count==4 {
      configuration=["url":CommandLine.arguments[1],"sha256":CommandLine.arguments[2],"bytes":Int(CommandLine.arguments[3])!]
    } else { print("Delivered-prefix immutability, mismatch, gaps and 8 MiB bound passed.");return }
    let url=URL(string:configuration["url"] as! String)!, expected=configuration["sha256"] as! String, bytes=configuration["bytes"] as! Int
    let entry=configuration["entrySeconds"] as? Double ?? 15.2, target=configuration["targetSeconds"] as? Double ?? 35
    let loader=DeliveredAudioLoader(url:url), item=AVPlayerItem(asset:loader.asset), player=AVPlayer(playerItem:item)
    item.preferredForwardBufferDuration=185;player.isMuted=true
    player.playImmediately(atRate:1.5)
    guard wait(30,{item.status == .readyToPlay && player.currentTime().seconds>0.2}) else { throw NSError(domain:"native-loading",code:1,userInfo:[NSLocalizedDescriptionKey:item.error?.localizedDescription ?? "Playback did not advance"]) }
    let began=player.currentTime().seconds
    guard wait(30,{loader.prefix.matches(bytes:bytes,sha256:expected)}) else { throw NSError(domain:"native-prefix",code:2,userInfo:[NSLocalizedDescriptionKey:"Actual delivered prefix did not match"]) }
    // Proof attaches to this exact running item; no replacement/restart.
    assert(player.currentItem === item && player.currentTime().seconds>=began)
    var entered=false
    player.seek(to:CMTime(seconds:entry,preferredTimescale:1000),toleranceBefore:.zero,toleranceAfter:.zero){entered=$0}
    guard wait(5,{entered}) else { throw NSError(domain:"native-seek",code:3) }
    let origin=player.currentTime().seconds, rate=player.rate
    var skipped=false
    player.seek(to:CMTime(seconds:target,preferredTimescale:1000),toleranceBefore:.zero,toleranceAfter:.zero){skipped=$0}
    guard wait(5,{skipped}), abs(player.currentTime().seconds-target)<0.35, player.rate==rate else { throw NSError(domain:"native-seek",code:4) }
    let destination=player.currentTime().seconds
    guard wait(5,{player.currentTime().seconds>destination+0.05}) else { throw NSError(domain:"native-continue",code:5) }
    player.pause();var undone=false
    player.seek(to:CMTime(seconds:origin,preferredTimescale:1000),toleranceBefore:.zero,toleranceAfter:.zero){undone=$0}
    guard wait(5,{undone}),abs(player.currentTime().seconds-origin)<0.35,player.rate==0,player.currentItem === item else { throw NSError(domain:"native-undo",code:6) }
    let output:[String:Any]=["platform":"macOS AVPlayer","physicalIPhoneVerified":false,"actualDeliveredBytes":loader.prefix.data.count,"deliveredPrefixSha256":expected,"proofBytes":bytes,"lateAttachedWithoutReplacement":true,"originMs":origin*1000,"destinationMs":destination*1000,"undoMs":player.currentTime().seconds*1000,"rateBeforeSkip":rate,"pausedUndo":true]
    print(String(data:try JSONSerialization.data(withJSONObject:output,options:[.sortedKeys]),encoding:.utf8)!)
    loader.cancel()
  }
}
