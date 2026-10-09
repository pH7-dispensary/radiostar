terraform { required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } } }
variable "region" { type = string } variable "alert_email" { type = string } variable "monthly_budget_usd" { type = number default = 250 }
provider "aws" { region = var.region }
resource "aws_s3_bucket" "objects" { bucket_prefix = "star-cast-objects-" }
resource "aws_s3_bucket_public_access_block" "objects" { bucket = aws_s3_bucket.objects.id block_public_acls = true block_public_policy = true ignore_public_acls = true restrict_public_buckets = true }
resource "aws_sqs_queue" "processing" { name = "star-cast-processing" visibility_timeout_seconds = 300 message_retention_seconds = 1209600 }
resource "aws_budgets_budget" "monthly" { name = "star-cast-monthly-protection" budget_type = "COST" limit_amount = tostring(var.monthly_budget_usd) limit_unit = "USD" time_unit = "MONTHLY" notification { comparison_operator = "GREATER_THAN" threshold = 80 threshold_type = "PERCENTAGE" notification_type = "ACTUAL" subscriber_email_addresses = [var.alert_email] } }
