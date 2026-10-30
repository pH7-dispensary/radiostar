import Foundation
import AVFoundation
import UniformTypeIdentifiers

/// A resource delegate for the EXISTING Expo AVPlayer. It streams ordinary
/// playback immediately and captures an 8 MiB prefix plus an 8 MiB rolling witness; no proxy server or second
/// player, whole-file cache, transcript, or cloud upload is introduced.
final class DeliveredAudioLoader: NSObject, AVAssetResourceLoaderDelegate, URLSessionDataDelegate {
  let source: URL
  let prefix = DeliveredAudioPrefix()
  let chain = DeliveredAudioChain()
  let asset: AVURLAsset
  private var totalLength: Int64?
  private var resolvedURL: URL?
  private var requests: [Int: Transfer] = [:]
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.urlCache = nil; config.httpCookieStorage = nil
    config.timeoutIntervalForRequest = 30
    return URLSession(configuration: config, delegate: self, delegateQueue: .main)
  }()
  private final class Transfer {
    let loading: AVAssetResourceLoadingRequest
    let task: URLSessionDataTask
    let start: Int64
    var received: Int64 = 0
    var responseStart: Int64 = 0
    var expectedBytes: Int64?
    var redirects = 0
    init(_ loading: AVAssetResourceLoadingRequest, _ task: URLSessionDataTask, _ start: Int64) {
      self.loading = loading; self.task = task; self.start = start
    }
  }
  static func allowed(_ url: URL) -> Bool {
    guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil || url.port == 443, let host = url.host?.lowercased() else { return false }
    let numbers=host.split(separator:".").compactMap { Int($0) }
    if numbers.count == 4 && (numbers[0] == 0 || numbers[0] >= 224 || numbers[0] == 10 || numbers[0] == 127 ||
      numbers[0] == 172 && (16...31).contains(numbers[1]) || numbers[0] == 192 && [0,168].contains(numbers[1]) ||
      numbers[0] == 169 && numbers[1] == 254 || numbers[0] == 100 && (64...127).contains(numbers[1]) ||
      numbers[0] == 198 && [18,19].contains(numbers[1])) { return false }
    return host != "localhost" && !host.hasSuffix(".local") && !host.hasSuffix(".internal") && !host.contains(":") &&
      !host.hasPrefix("127.") && !host.hasPrefix("10.") && !host.hasPrefix("192.168.") && !host.hasPrefix("169.254.") && host != "0.0.0.0"
  }
  init(url: URL) {
    source = url
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
    components.scheme = "radiostar-audio"
    asset = AVURLAsset(url: components.url!)
    super.init()
    asset.resourceLoader.setDelegate(self, queue: .main)
  }
  func cancel() {
    let active = Array(requests.values); requests.removeAll()
    for transfer in active { transfer.task.cancel(); transfer.loading.finishLoading(with: URLError(.cancelled)) }
    session.invalidateAndCancel()
  }
  func resourceLoader(_ resourceLoader: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource loading: AVAssetResourceLoadingRequest) -> Bool {
    guard Self.allowed(source), requests.count < 4 else { loading.finishLoading(with: URLError(.resourceUnavailable)); return true }
    let data = loading.dataRequest
    let start = max(data?.currentOffset ?? 0, data?.requestedOffset ?? 0)
    guard start >= 0 else { loading.finishLoading(with: URLError(.badServerResponse)); return true }
    var request = URLRequest(url: resolvedURL ?? source)
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    request.setValue("RadioStar/1.0", forHTTPHeaderField: "User-Agent")
    if let data, !data.requestsAllDataToEndOfResource {
      let end = data.requestedOffset + Int64(data.requestedLength) - 1
      request.setValue("bytes=\(start)-\(max(start, end))", forHTTPHeaderField: "Range")
    } else { request.setValue(data == nil ? "bytes=0-1" : "bytes=\(start)-", forHTTPHeaderField: "Range") }
    let task = session.dataTask(with: request)
    requests[task.taskIdentifier] = Transfer(loading, task, start); task.resume()
    return true
  }
  func resourceLoader(_ resourceLoader: AVAssetResourceLoader, didCancel loading: AVAssetResourceLoadingRequest) {
    for (id, transfer) in requests where transfer.loading === loading { requests.removeValue(forKey:id); transfer.task.cancel() }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    guard let transfer = requests[task.taskIdentifier], transfer.redirects < 5, let url = request.url, Self.allowed(url) else { completionHandler(nil); return }
    transfer.redirects += 1
    completionHandler(request)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let transfer = requests[dataTask.taskIdentifier], let http = response as? HTTPURLResponse,
          [200,206].contains(http.statusCode), [nil,"identity"].contains(http.value(forHTTPHeaderField:"Content-Encoding")) else {
      completionHandler(.cancel); fail(dataTask, URLError(.badServerResponse)); return
    }
    var length: Int64?
    if resolvedURL == nil, let url = response.url, Self.allowed(url) { resolvedURL = url }
    if http.statusCode == 206 {
      let range = (http.value(forHTTPHeaderField:"Content-Range") ?? "").split(separator:" ")
      let values = range.last?.split(separator:"/") ?? []
      let bounds = values.first?.split(separator:"-") ?? []
      guard range.first == "bytes", values.count == 2, bounds.count == 2,
            let start = Int64(bounds[0]), let end = Int64(bounds[1]), start == transfer.start, end >= start else {
        completionHandler(.cancel); fail(dataTask, URLError(.badServerResponse)); return
      }
      transfer.responseStart = start; length = Int64(values[1])
      transfer.expectedBytes = end - start + 1
      if let length, length <= end { completionHandler(.cancel); fail(dataTask,URLError(.badServerResponse)); return }
    } else {
      // An ignored Range may stream from zero for ordinary opening playback,
      // but never discard an unbounded file to satisfy a distant seek.
      guard transfer.start < Int64(DeliveredAudioPrefix.maximumBytes) else { completionHandler(.cancel); fail(dataTask, URLError(.unsupportedURL)); return }
      transfer.responseStart = 0
      if response.expectedContentLength > 0 { length = response.expectedContentLength }
    }
    if let length {
      if let totalLength, totalLength != length { completionHandler(.cancel); fail(dataTask, URLError(.resourceUnavailable)); return }
      totalLength = length; chain.setLength(length)
    }
    if let info = transfer.loading.contentInformationRequest {
      info.contentType = UTType(mimeType: response.mimeType ?? "audio/mpeg")?.identifier ?? UTType.mp3.identifier
      info.isByteRangeAccessSupported = http.statusCode == 206
      if let totalLength { info.contentLength = totalLength }
    }
    if transfer.loading.dataRequest == nil { completionHandler(.cancel); finish(dataTask); return }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let transfer = requests[dataTask.taskIdentifier], let request = transfer.loading.dataRequest else { dataTask.cancel(); return }
    let offset = transfer.responseStart + transfer.received
    transfer.received += Int64(data.count)
    if let expected = transfer.expectedBytes, transfer.received > expected { fail(dataTask,URLError(.badServerResponse));return }
    let wanted = max(request.currentOffset, request.requestedOffset)
    let skip = Int(max(0, min(Int64(data.count), wanted - offset)))
    if skip == data.count { return }
    let end = request.requestsAllDataToEndOfResource ? Int64.max : request.requestedOffset + Int64(request.requestedLength)
    let count = Int(min(Int64(data.count - skip), max(0,end - max(wanted,offset))))
    if count > 0 {
      let bytes = prefix.delivered(Data(data[skip..<(skip + count)]), at: offset + Int64(skip))
      request.respond(with: chain.delivered(bytes, at:offset + Int64(skip)))
    }
    if request.currentOffset >= end { finish(dataTask) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let transfer = requests[task.taskIdentifier] else { return }
    if let error { fail(task,error); return }
    if let expected = transfer.expectedBytes, transfer.received < expected { fail(task,URLError(.networkConnectionLost));return }
    if let request = transfer.loading.dataRequest, !request.requestsAllDataToEndOfResource,
       request.currentOffset < request.requestedOffset + Int64(request.requestedLength),
       totalLength == nil || request.currentOffset < totalLength! { fail(task,URLError(.networkConnectionLost)); return }
    finish(task)
  }
  private func finish(_ task: URLSessionTask) { if let transfer = requests.removeValue(forKey:task.taskIdentifier) { transfer.loading.finishLoading(); task.cancel() } }
  private func fail(_ task: URLSessionTask, _ error: Error) { if let transfer = requests.removeValue(forKey:task.taskIdentifier) { transfer.loading.finishLoading(with:error); task.cancel() } }
}
