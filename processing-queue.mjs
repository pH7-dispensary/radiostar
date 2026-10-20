import {
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

const validQueueUrl = (value) =>
  typeof value === "string" &&
  /^https:\/\/sqs\.eu-west-2\.amazonaws\.com\/208096650030\/starcast-phase1-processing$/.test(value);

export class ProcessingQueue {
  constructor({ queueUrl, region = "eu-west-2", client, pollWaitSeconds = 20, renewalMs = 60_000 } = {}) {
    if (!validQueueUrl(queueUrl)) throw Error("A dedicated Star Cast processing queue is required.");
    this.queueUrl = queueUrl;
    this.deadLetterQueueUrl = queueUrl.replace(/processing$/, "processing-dlq");
    this.client = client || new SQSClient({ region, maxAttempts: 3 });
    this.pollWaitSeconds = Math.max(1, Math.min(20, Number(pollWaitSeconds) || 20));
    this.running = false;
    this.renewalMs = renewalMs;
  }

  async enqueue(job) {
    if (!job?.jobId || !job?.key || !job?.feedUrl || !job?.episodeId) throw Error("A complete processing job is required.");
    await this.client.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify({
        version: 1,
        jobId: job.jobId,
        key: job.key,
        feedUrl: job.feedUrl,
        episodeId: job.episodeId,
        allowAudio: job.allowAudio === true,
        // Preserve a cache-safety recheck across the durable queue boundary.
        // Omitted on older messages remains false for backward compatibility.
        forcePublisherRefresh: job.forcePublisherRefresh === true,
        queuedAt: job.queuedAt,
      }),
    }));
  }

  async receive() {
    const received = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: this.pollWaitSeconds,
      VisibilityTimeout: 900,
      MessageAttributeNames: ["All"],
    }));
    return received.Messages || [];
  }

  async acknowledge(receiptHandle) {
    if (!receiptHandle) return;
    await this.client.send(new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    }));
  }

  // This is deliberately a small, bounded read. The administrative surface
  // needs queue evidence, not browser credentials or an unbounded AWS proxy.
  async metrics() {
    const attributesFor = async (queueUrl) => {
      const result = await this.client.send(new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
          "ApproximateNumberOfMessagesDelayed",
        ],
      }));
      const values = result.Attributes || {};
      return {
        visible: Number(values.ApproximateNumberOfMessages || 0),
        inFlight: Number(values.ApproximateNumberOfMessagesNotVisible || 0),
        delayed: Number(values.ApproximateNumberOfMessagesDelayed || 0),
      };
    };
    try {
      const [processing, deadLetter] = await Promise.all([
        attributesFor(this.queueUrl),
        attributesFor(this.deadLetterQueueUrl),
      ]);
      return {
        status: deadLetter.visible > 0 ? "DEGRADED" : "HEALTHY",
        processing,
        deadLetter,
        workerRunning: this.running,
        observedAt: new Date().toISOString(),
        reason: deadLetter.visible > 0
          ? "Messages are waiting in the processing dead-letter queue."
          : "SQS queue attributes were read successfully.",
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        processing: null,
        deadLetter: null,
        workerRunning: this.running,
        observedAt: new Date().toISOString(),
        reason: `Queue attributes could not be read (${String(error?.name || "QUEUE_READ_FAILED").slice(0, 80)}).`,
      };
    }
  }

  async run({ execute, recover }) {
    if (this.running) return;
    this.running = true;
    try {
      while (this.running) {
        await recover();
        const messages = await this.receive();
        for (const message of messages) {
          let job;
          const controller = new AbortController();
          let renewal = null;
          let renewing = false;
          try {
            job = JSON.parse(message.Body || "{}");
            renewal = setInterval(async () => {
              if (renewing || controller.signal.aborted) return;
              renewing = true;
              try {
                await this.client.send(new ChangeMessageVisibilityCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: 900 }));
              } catch { controller.abort(Error("Processing queue lease renewal failed.")); }
              finally { renewing = false; }
            }, this.renewalMs);
            renewal.unref?.();
            await execute(job, controller.signal);
            controller.signal.throwIfAborted();
            await this.acknowledge(message.ReceiptHandle);
          } catch (error) {
            console.error(JSON.stringify({
              event: "processing-queue-message-failed",
              jobId: job?.jobId || null,
              code: error?.name || "QUEUE_MESSAGE_FAILED",
            }));
          } finally {
            clearInterval(renewal);
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  stop() { this.running = false; }
}

export function processingQueueFromEnv(env = process.env, options = {}) {
  if (!env.STARCAST_PROCESSING_QUEUE_URL) return null;
  return new ProcessingQueue({
    queueUrl: env.STARCAST_PROCESSING_QUEUE_URL,
    region: env.AWS_REGION || "eu-west-2",
    ...options,
  });
}
