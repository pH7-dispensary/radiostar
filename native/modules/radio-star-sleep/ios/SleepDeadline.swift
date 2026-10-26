import Foundation

// This is the sole native deadline state, shared by manual and adaptive sleep.
// A Dispatch timer is usable while background audio keeps the process running;
// it is not a promise of execution after force-quit or arbitrary suspension.
protocol SleepPlayback: AnyObject {
  var identity: String { get }
  var positionMs: Double { get }
  var volume: Float { get set }
  var playing: Bool { get }
  func pause()
}
struct SleepRecord: Codable {
  var id: String
  var sourceKey: String
  var sourceJSON: String
  var kind: String
  var state: String
  var deadlineAt: Double
  var fadeMs: Double
  var positionMs: Double?
  var recoveryMs: Double?
  var completedAt: Double?
  var reason: String?
}
final class SleepDeadline {
  private(set) var record: SleepRecord?
  private weak var player: SleepPlayback?
  private var identity = ""
  private var deadline: Double = 0
  private var originalVolume: Float = 1
  private var timer: DispatchSourceTimer?
  private var generation = 0
  private let uptime: () -> Double
  private let wall: () -> Double
  private let save: (SleepRecord) -> Void
  private let schedule: Bool
  init(restored: SleepRecord? = nil, uptime: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime * 1000 }, wall: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }, schedule: Bool = true, save: @escaping (SleepRecord) -> Void) {
    self.uptime = uptime; self.wall = wall; self.save = save; self.schedule = schedule
    record = restored
    if var row = restored, ["ARMED", "FADING"].contains(row.state) {
      row.state = "INTERRUPTED"; row.reason = "process_restarted"; record = row; save(row)
    }
  }
  func arm(player: SleepPlayback, id: String, sourceKey: String, sourceJSON: String, kind: String, remainingMs: Double, fadeMs: Double) throws {
    guard !id.isEmpty, !sourceKey.isEmpty, ["ai", "manual", "end"].contains(kind), remainingMs.isFinite, remainingMs > 0, remainingMs <= 8*3600000, fadeMs.isFinite, fadeMs >= 0, fadeMs <= 120000, player.playing else { throw NSError(domain: "RadioStarSleep", code: 1, userInfo: [NSLocalizedDescriptionKey: "Start playback and choose a valid sleep window."]) }
    cancel(reason: "superseded")
    generation += 1; self.player = player; identity = player.identity; originalVolume = player.volume
    deadline = uptime() + remainingMs
    record = SleepRecord(id: id, sourceKey: sourceKey, sourceJSON: sourceJSON, kind: kind, state: "ARMED", deadlineAt: wall()+remainingMs, fadeMs: min(fadeMs,remainingMs))
    persist(); install(delayMs: max(0,remainingMs-min(fadeMs,remainingMs)), repeating: false)
  }
  func extend(id: String, extraMs: Double) throws {
    guard let row = record, row.id == id, ["ARMED","FADING"].contains(row.state), let player = player, [300000.0,900000.0,1800000.0].contains(extraMs) else { throw NSError(domain:"RadioStarSleep",code:2) }
    let remaining = max(0,deadline-uptime())+extraMs
    try arm(player:player,id:row.id,sourceKey:row.sourceKey,sourceJSON:row.sourceJSON,kind:row.kind,remainingMs:remaining,fadeMs:row.fadeMs)
  }
  func cancel(id: String? = nil, reason: String = "cancelled") {
    if let id = id, record?.id != id { return }
    generation += 1; timer?.cancel(); timer = nil
    if player?.identity == identity { player?.volume = originalVolume }
    if var row = record, ["ARMED", "FADING"].contains(row.state) || (row.state == "PAUSED" && id != nil && reason == "cancelled") {
      row.state = reason == "interruption" ? "INTERRUPTED" : "CANCELLED"; row.reason = reason; record = row; persist()
    }
    player = nil
  }
  func clear() { cancel(); record = nil }
  func tick() {
    guard var row = record, ["ARMED", "FADING"].contains(row.state) else { return }
    guard let player = player, player.identity == identity else { cancel(reason: "source_changed"); return }
    guard player.playing else { cancel(reason: "playback_paused"); return }
    let left = deadline - uptime()
    // Wall-clock changes affect display only, never the elapsed-time deadline.
    row.deadlineAt = wall() + max(0,left)
    if left <= 0 {
      row.state = "PAUSED"; row.positionMs = max(0,player.positionMs); row.recoveryMs = max(0,(row.positionMs ?? 0) - (row.kind == "ai" ? 300000 : 0)); row.completedAt = wall()
      record = row; persist() // Persist before our pause triggers observers.
      timer?.cancel(); timer = nil; generation += 1
      player.volume = 0; player.pause(); player.volume = originalVolume; self.player = nil
    } else if left <= row.fadeMs {
      let first = row.state != "FADING"
      row.state = "FADING"; record = row
      player.volume = originalVolume * Float(max(0,min(1,left/max(1,row.fadeMs))))
      if first { persist(); install(delayMs: 50, repeating: true) }
    } else { record = row }
  }
  private func persist() { if let row = record { save(row) } }
  private func install(delayMs: Double, repeating: Bool) {
    guard schedule else { return }
    timer?.cancel(); let token = generation; let next = DispatchSource.makeTimerSource(queue: .main)
    if repeating { next.schedule(deadline: .now() + delayMs/1000, repeating: .milliseconds(50), leeway: .milliseconds(10)) }
    else { next.schedule(deadline: .now() + delayMs/1000, leeway: .milliseconds(50)) }
    next.setEventHandler { [weak self] in guard let self = self, self.generation == token else { return }; self.tick() }
    timer = next; next.resume()
  }
  deinit { timer?.cancel() }
}
