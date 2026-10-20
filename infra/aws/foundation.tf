terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
variable "region" {
  type    = string
  default = "eu-west-2"
  validation {
    condition     = var.region == "eu-west-2"
    error_message = "Phase 1 is restricted to eu-west-2."
  }
}
variable "starcast_account_id" {
  type    = string
  default = "208096650030"
  validation {
    condition     = var.starcast_account_id == "208096650030"
    error_message = "Only the explicitly approved dedicated Star Cast account is permitted."
  }
}
variable "alert_email" {
  type        = string
  default     = ""
  description = "Optional owner-approved cost notification recipient; never infer an address."
}
variable "monthly_budget_usd" {
  type        = number
  default     = 25
  description = "AWS cost alert, not a hard cap; independent of OpenAI limits."
  validation {
    condition     = var.monthly_budget_usd > 0 && var.monthly_budget_usd <= 25
    error_message = "Phase 1 monitoring budget must not exceed USD 25 without review."
  }
}
provider "aws" {
  region              = var.region
  profile             = "radiostar"
  allowed_account_ids = [var.starcast_account_id]
  default_tags {
    tags = { Project = "StarCast", Environment = "phase1", ManagedBy = "Terraform", CostCenter = "RadioStar" }
  }
}
# Durable artifacts and backups only; no public podcast/audio redistribution.
resource "aws_s3_bucket" "objects" {
  bucket        = "starcast-phase1-208096650030-eu-west-2"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "objects" {
  bucket                  = aws_s3_bucket.objects.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "objects" {
  bucket = aws_s3_bucket.objects.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_versioning" "objects" {
  bucket = aws_s3_bucket.objects.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_policy" "objects" {
  bucket = aws_s3_bucket.objects.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.objects.arn, "${aws_s3_bucket.objects.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_s3_bucket_lifecycle_configuration" "objects" {
  bucket     = aws_s3_bucket.objects.id
  depends_on = [aws_s3_bucket_versioning.objects]
  rule {
    id     = "bound-old-backups"
    status = "Enabled"
    filter { prefix = "backups/" }
    expiration { days = 30 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
# Prepared queue; the existing pipeline is not connected until worker integration.
resource "aws_sqs_queue" "dead_letter" {
  name                      = "starcast-phase1-processing-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "processing" {
  name                       = "starcast-phase1-processing"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead_letter.arn, maxReceiveCount = 3 })
}
resource "aws_sqs_queue_policy" "tls" {
  for_each  = { processing = aws_sqs_queue.processing, dead_letter = aws_sqs_queue.dead_letter }
  queue_url = each.value.url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Deny", Principal = "*", Action = "sqs:*", Resource = each.value.arn
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/starcast/phase1/backend"
  retention_in_days = 14
}
resource "aws_budgets_budget" "monthly" {
  name         = "starcast-phase1-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  dynamic "notification" {
    for_each = var.alert_email == "" ? {} : { ACTUAL = 80, FORECASTED = 100 }
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.key
      subscriber_email_addresses = [var.alert_email]
    }
  }
  # Additional internal-test alert; retain the ordinary early warnings. This
  # observes AWS charges only, not the independent OpenAI application ledger.
  dynamic "notification" {
    for_each = var.alert_email == "" ? [] : [125]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "ABSOLUTE_VALUE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}
output "artifact_bucket" { value = aws_s3_bucket.objects.id }
output "processing_queue_url" { value = aws_sqs_queue.processing.url }
output "backend_log_group" { value = aws_cloudwatch_log_group.backend.name }
