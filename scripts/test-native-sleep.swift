import Foundation
#if os(macOS)
import AVFoundation
#endif
final class FakeSleepPlayer: SleepPlayback {
 var identity="episode-a"; var positionMs:Double=1000000; var volume:Float=0.7; var playing=true; var pauses=0
 func pause(){playing=false;pauses+=1}
}
#if os(macOS)
final class MeasuredPlayer: SleepPlayback {
 let player:AVPlayer; var pauses=0
 init(_ url:URL){player=AVPlayer(url:url);player.isMuted=true;player.volume=0.7}
 var identity:String{"owned-file"}
 var positionMs:Double{player.currentTime().seconds*1000}
 var volume:Float{get{player.volume}set{player.volume=newValue}}
 var playing:Bool{player.timeControlStatus != .paused}
 func pause(){pauses+=1;player.pause()}
}
#endif
@main struct SleepTests {
 static func main() throws {
  var time:Double=0;var wall:Double=100000;var records:[SleepRecord]=[]
  let p=FakeSleepPlayer();let c=SleepDeadline(uptime:{time},wall:{wall},schedule:false,save:{records.append($0)})
  func arm(_ id:String="one",_ duration:Double=60000)throws{try c.arm(player:p,id:id,sourceKey:"episode-a",sourceJSON:"{}",kind:"ai",remainingMs:duration,fadeMs:10000)}
  try arm();assert(c.record?.armedAt==wall);time=50000;c.tick();assert(c.record?.state=="FADING"&&c.record?.fadeStartedAt==wall);time=55000;c.tick();assert(abs(p.volume-0.35)<0.001)
  for ms in [300000.0,900000.0,1800000.0]{try c.extend(id:"one",extraMs:ms)}
  assert(abs(p.volume-0.7)<0.001);assert(c.record!.deadlineAt == wall+3005000)
  c.cancel(id:"obsolete");assert(c.record?.state=="ARMED")
  time=60000;c.tick();assert(p.pauses==0);wall += 3600000;time=3060000;c.tick();assert(p.pauses==1)
  assert(c.record?.positionMs==1000000&&c.record?.recoveryMs==700000);assert(c.record?.pauseConfirmedAt==wall&&c.record?.deadlineDriftMs==0);c.tick();assert(p.pauses==1)
  c.cancel(id:"one");assert(c.record?.state=="CANCELLED")
  p.playing=true;try arm("source");p.identity="episode-b";time+=60001;c.tick();assert(p.pauses==1&&c.record?.state=="CANCELLED")
  p.identity="episode-a";try arm("call");c.cancel(reason:"interruption");time+=60000;c.tick();assert(c.record?.state=="INTERRUPTED"&&p.pauses==1)
  try arm("restart");let restored=SleepDeadline(restored:c.record,schedule:false,save:{_ in});assert(restored.record?.state=="INTERRUPTED")
  // Previously installed builds omit diagnostic fields. Preserve their recovery records.
  let oldJSON = "{\"id\":\"legacy\",\"sourceKey\":\"episode-a\",\"sourceJSON\":\"{}\",\"kind\":\"manual\",\"state\":\"PAUSED\",\"deadlineAt\":100,\"fadeMs\":10,\"positionMs\":50}"
  let oldRecord = try JSONDecoder().decode(SleepRecord.self, from:Data(oldJSON.utf8))
  assert(oldRecord.positionMs==50 && oldRecord.pauseConfirmedAt==nil)
  p.playing=true;try arm("drift",1000);time+=1025;c.tick()
  assert(c.record?.deadlineDriftMs==25 && c.record?.pauseConfirmedAt==wall)
  p.playing=false;do{try arm("paused");assertionFailure("paused player armed")}catch{}
  print("Native Swift deterministic cases passed: fade/restore, rapid 5/15/30 extensions, stale cancellation, duplicate pause, clock jump, source, interruption, restart and recovery.")
#if os(macOS)
  let audio=MeasuredPlayer(URL(fileURLWithPath:FileManager.default.currentDirectoryPath+"/fixtures/ad-skip-owned-v1.mp3"))
  audio.player.play()
  let loaded=Date().addingTimeInterval(8)
  while audio.player.currentItem?.status != .readyToPlay && Date()<loaded {RunLoop.main.run(until:Date().addingTimeInterval(0.05))}
  guard audio.player.currentItem?.status == .readyToPlay else {throw NSError(domain:"SleepTest",code:1,userInfo:[NSLocalizedDescriptionKey:"AVPlayer could not load owned media"])}
  var result:SleepRecord?;let actual=SleepDeadline(save:{result=$0});let start=ProcessInfo.processInfo.systemUptime
  try actual.arm(player:audio,id:"measured",sourceKey:"owned",sourceJSON:"{}",kind:"manual",remainingMs:2000,fadeMs:1000)
  var minimum:Float=1;var samples=0
  while result?.state != "PAUSED" && ProcessInfo.processInfo.systemUptime-start<5 {
    RunLoop.main.run(until:Date().addingTimeInterval(0.02));if result?.state=="FADING"{minimum=min(minimum,audio.volume);samples+=1}
  }
  assert(result?.state=="PAUSED"&&audio.pauses==1&&audio.player.rate==0)
  assert(samples>5&&minimum<0.2&&abs(audio.volume-0.7)<0.001)
  let report:[String:Any]=["platform":"macOS AVPlayer; muted output; NOT iPhone background or audible verification","elapsedMs":(ProcessInfo.processInfo.systemUptime-start)*1000,"targetMs":2000,"fadeSamples":samples,"minimumObservedVolume":minimum,"restoredVolume":audio.volume,"pausePositionMs":result?.positionMs ?? -1,"paused":audio.player.rate==0,"nativeDeadlineDriftMs":result?.deadlineDriftMs ?? -1,"fadeStartedAt":result?.fadeStartedAt ?? -1,"pauseConfirmedAt":result?.pauseConfirmedAt ?? -1]
  let data=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]);try data.write(to:URL(fileURLWithPath:ProcessInfo.processInfo.environment["RADIOSTAR_SLEEP_TEST_OUTPUT"] ?? "evals/recovery-batch7-native.json"));print(String(data:data,encoding:.utf8)!)
#endif
 }
}
