variable "operations_alerts_enabled" {
  type        = bool
  default     = true
  description = "Disable only during staged telemetry commissioning; production alarms remain enabled."
}
# Ten fixed, low-cardinality EMF metrics reuse the existing log group/agent.
# No paid canary, extra instance, database or new queue is required.
resource "aws_sns_topic" "operations" { name = "starcast-operations" }
resource "aws_sns_topic_policy" "operations" {
  arn = aws_sns_topic.operations.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "CloudWatchAlarms", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = "sns:Publish", Resource = aws_sns_topic.operations.arn,
    Condition = { StringEquals = { "aws:SourceAccount" = var.starcast_account_id }, ArnLike = { "aws:SourceArn" = "arn:aws:cloudwatch:${var.region}:${var.starcast_account_id}:alarm:starcast-*" } } }
  ] })
}
resource "aws_sns_topic_subscription" "operations" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
locals {
  operational_alarms = {
    "api-unavailable"     = { metric = "ApiReady", threshold = 1, comparison = "LessThanThreshold", missing = "breaching", severity = "CRITICAL" }
    "worker-unavailable"  = { metric = "WorkerReady", threshold = 1, comparison = "LessThanThreshold", missing = "breaching", severity = "CRITICAL" }
    "database-integrity"  = { metric = "DatabaseIntegrity", threshold = 1, comparison = "LessThanThreshold", missing = "breaching", severity = "CRITICAL" }
    "disk-critical"       = { metric = "DiskUsedPercent", threshold = 90, comparison = "GreaterThanOrEqualToThreshold", missing = "breaching", severity = "CRITICAL" }
    "disk-warning"        = { metric = "DiskUsedPercent", threshold = 80, comparison = "GreaterThanOrEqualToThreshold", missing = "missing", severity = "HIGH" }
    "inodes-low"          = { metric = "FreeInodes", threshold = 100000, comparison = "LessThanThreshold", missing = "breaching", severity = "HIGH" }
    "backup-overdue"      = { metric = "BackupAgeSeconds", threshold = 3600, comparison = "GreaterThanThreshold", missing = "breaching", severity = "HIGH" }
    "processing-failures" = { metric = "ProcessingFailures5m", threshold = 3, comparison = "GreaterThanOrEqualToThreshold", missing = "missing", severity = "HIGH" }
    "telemetry-missing"   = { metric = "TelemetryHeartbeat", threshold = 1, comparison = "LessThanThreshold", missing = "breaching", severity = "HIGH" }
    "event-loop-delay"    = { metric = "EventLoopP99Ms", threshold = 500, comparison = "GreaterThanThreshold", missing = "missing", severity = "HIGH" }
  }
}
resource "aws_cloudwatch_metric_alarm" "operations" {
  for_each            = local.operational_alarms
  actions_enabled     = var.operations_alerts_enabled
  alarm_name          = "starcast-${each.key}"
  alarm_description   = "${each.value.severity}: Radio Star ${each.key}; 2 of 3 minutes. Inspect protected Admin infrastructure and the recovery runbook. Missing data: ${each.value.missing}."
  namespace           = "RadioStar/Operations"
  metric_name         = each.value.metric
  dimensions          = { Environment = "production" }
  statistic           = each.value.metric == "EventLoopP99Ms" ? "Maximum" : each.value.comparison == "LessThanThreshold" ? "Minimum" : "Maximum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison
  treat_missing_data  = each.value.missing
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
resource "aws_cloudwatch_metric_alarm" "queue_age" {
  actions_enabled     = var.operations_alerts_enabled
  alarm_name          = "starcast-queue-age"
  alarm_description   = "HIGH: oldest queued message exceeds 30 minutes for 2 of 3 five-minute periods. Empty SQS queues may omit age; the independent worker/telemetry alarms cover missing service health."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.processing.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1800
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
resource "aws_cloudwatch_metric_alarm" "dead_letter" {
  actions_enabled     = var.operations_alerts_enabled
  alarm_name          = "starcast-dead-letter"
  alarm_description   = "HIGH: messages in the existing dead-letter queue; investigate before redrive. Missing idle SQS data does not imply a backlog."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dead_letter.name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
output "operations_alert_topic" { value = aws_sns_topic.operations.arn }
