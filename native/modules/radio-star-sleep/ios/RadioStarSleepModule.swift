import ExpoModulesCore
import ExpoAudio
import AVFoundation

private final class ExistingPlayback: SleepPlayback {
  let player: AVPlayer
  init(_ player: AVPlayer) { self.player = player }
  var identity: String { player.currentItem.map { String(describing: ObjectIdentifier($0)) } ?? "none" }
  var positionMs: Double { let time = player.currentTime().seconds; return time.isFinite ? time*1000 : 0 }
  var volume: Float { get { player.volume } set { player.volume = newValue } }
  var playing: Bool { player.timeControlStatus != .paused }
  func pause() { player.pause() }
}
public final class RadioStarSleepModule: Module {
  private static let key = "radio-star-native-sleep-v1"
  private lazy var deadline: SleepDeadline = {
    let restored = UserDefaults.standard.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(SleepRecord.self, from: $0) }
    return SleepDeadline(restored: restored) { row in
      if let data = try? JSONEncoder().encode(row) { UserDefaults.standard.set(data, forKey: Self.key) }
    }
  }()
  private var observationRevision = 0
  private var playback: ExistingPlayback?
  private var observers: [NSObjectProtocol] = []
  private var itemObserver: NSKeyValueObservation?
  private var statusObserver: NSKeyValueObservation?
  private var rateObserver: NSKeyValueObservation?
  public func definition() -> ModuleDefinition {
    Name("RadioStarSleep")
    AsyncFunction("arm") { (player: AudioPlayer, id: String, sourceKey: String, sourceJSON: String, kind: String, remainingMs: Double, fadeMs: Double) -> String in
      self.deadline.cancel(reason: "superseded"); self.unobserve(); let adapter = ExistingPlayback(player.ref); self.playback = adapter
      try self.deadline.arm(player: adapter, id: id, sourceKey: sourceKey, sourceJSON: sourceJSON, kind: kind, remainingMs: remainingMs, fadeMs: fadeMs)
      self.observe(player.ref)
      return self.stateJSON()
    }.runOnQueue(.main)
    AsyncFunction("extend") { (id: String, extraMs: Double) -> String in
      try self.deadline.extend(id:id,extraMs:extraMs); return self.stateJSON()
    }.runOnQueue(.main)
    AsyncFunction("cancel") { (id: String?) -> String in
      self.deadline.cancel(id: id); return self.stateJSON()
    }.runOnQueue(.main)
    AsyncFunction("state") { () -> String in self.deadline.tick(); return self.stateJSON() }.runOnQueue(.main)
    AsyncFunction("clear") { () in
      self.deadline.clear(); self.unobserve(); self.playback = nil
      UserDefaults.standard.removeObject(forKey: Self.key)
    }.runOnQueue(.main)
    OnDestroy { DispatchQueue.main.async { self.deadline.cancel(reason: "module_destroyed"); self.unobserve() } }
  }
  private func stateJSON() -> String {
    guard let row = deadline.record, let data = try? JSONEncoder().encode(row), let json = String(data: data, encoding: .utf8) else { return "null" }
    return json
  }
  private func observe(_ player: AVPlayer) {
    let revision = observationRevision
    itemObserver = player.observe(\.currentItem) { [weak self] _,_ in DispatchQueue.main.async { if self?.observationRevision == revision { self?.deadline.cancel(reason: "source_changed") } } }
    statusObserver = player.observe(\.timeControlStatus) { [weak self] player,_ in
      DispatchQueue.main.async { if self?.observationRevision == revision && player.timeControlStatus == .paused { self?.deadline.cancel(reason: "playback_paused") } }
    }
    rateObserver = player.observe(\.rate) { [weak self] _,_ in DispatchQueue.main.async { if self?.observationRevision == revision { self?.rescheduleEnd() } } }
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      if self?.observationRevision == revision, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, raw == AVAudioSession.InterruptionType.began.rawValue { self?.deadline.cancel(reason: "interruption") }
    })
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
      if self?.observationRevision == revision, let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt, raw == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.deadline.cancel(reason: "route_disconnected") }
    })
    observers.append(NotificationCenter.default.addObserver(forName: AVPlayerItem.timeJumpedNotification, object: player.currentItem, queue: .main) { [weak self] _ in
      guard let self = self, self.observationRevision == revision else { return }
      if self.deadline.record?.kind == "end" { self.rescheduleEnd() }
      // Fixed wall deadlines survive seeks, including automatic Ad Skip.
      // Explicit foreground interaction is handled by the existing sleep model.
    })
  }
  private func rescheduleEnd() {
    guard let row = deadline.record, row.kind == "end", ["ARMED","FADING"].contains(row.state), let adapter = playback, adapter.player.rate > 0, let duration = adapter.player.currentItem?.duration.seconds, duration.isFinite else { return }
    let remaining = (duration*1000-adapter.positionMs)/Double(adapter.player.rate)
    if remaining > 0 { try? deadline.arm(player: adapter, id: row.id, sourceKey: row.sourceKey, sourceJSON: row.sourceJSON, kind: row.kind, remainingMs: remaining, fadeMs: row.fadeMs) }
  }
  private func unobserve() {
    observationRevision += 1
    itemObserver = nil; statusObserver = nil; rateObserver = nil
    observers.forEach { NotificationCenter.default.removeObserver($0) }; observers = []
  }
}
