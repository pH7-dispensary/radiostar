# Phase 1: one durable worker. Do not scale replicas against this SQLite store.
# x86 is intentional: the pinned ffprobe-static package has no Linux arm64 binary.
data "aws_ssm_parameter" "ami" { name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64" }
data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "viewer" { name = "Managed-AllViewer" }
data "aws_cloudfront_response_headers_policy" "security" { name = "Managed-SecurityHeadersPolicy" }
variable "private_origin_ready" {
  type        = bool
  default     = true
  description = "Set false ONLY for first creation, then apply true after CloudFront creates its service security group."
}
data "aws_security_group" "cloudfront_service" {
  count  = var.private_origin_ready ? 1 : 0
  vpc_id = aws_vpc.backend.id
  name   = "CloudFront-VPCOrigins-Service-SG"
}
resource "aws_vpc" "backend" {
  cidr_block           = "10.46.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "starcast-phase1" }
}
resource "aws_internet_gateway" "backend" { vpc_id = aws_vpc.backend.id }
resource "aws_subnet" "backend" {
  vpc_id            = aws_vpc.backend.id
  cidr_block        = "10.46.1.0/24"
  availability_zone = "eu-west-2a"
}
resource "aws_route_table" "backend" {
  vpc_id = aws_vpc.backend.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.backend.id
  }
}
resource "aws_route_table_association" "backend" {
  subnet_id      = aws_subnet.backend.id
  route_table_id = aws_route_table.backend.id
}
resource "aws_security_group" "backend" {
  name_prefix = "starcast-phase1-"
  vpc_id      = aws_vpc.backend.id
  description = "Private CloudFront origin ingress; no SSH; HTTPS egress for RSS and OpenAI"
  ingress {
    from_port       = 4173
    to_port         = 4173
    protocol        = "tcp"
    prefix_list_ids = var.private_origin_ready ? [] : [data.aws_ec2_managed_prefix_list.cloudfront.id]
    security_groups = var.private_origin_ready ? [data.aws_security_group.cloudfront_service[0].id] : []
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_secretsmanager_secret" "backend" {
  name                    = "starcast/phase1/backend"
  description             = "Server-only OpenAI key and separate private-pilot device token; value managed outside Terraform"
  recovery_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_iam_role" "backend" {
  name = "starcast-phase1-backend"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "backend" {
  role = aws_iam_role.backend.id
  name = "starcast-scoped-runtime"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${aws_s3_bucket.objects.arn}/releases/*", "${aws_s3_bucket.objects.arn}/seed/*"] },
      { Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${aws_s3_bucket.objects.arn}/backups/*"] },
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.backend.arn },
      { Effect = "Allow", Action = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.processing.arn },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.backend.arn}:*" }
    ]
  })
}
resource "aws_iam_instance_profile" "backend" { role = aws_iam_role.backend.name }
resource "aws_s3_object" "release" {
  bucket      = aws_s3_bucket.objects.id
  key         = "releases/${filesha256("../../.starcast/aws-release.tar.gz")}.tar.gz"
  source      = "../../.starcast/aws-release.tar.gz"
  source_hash = filesha256("../../.starcast/aws-release.tar.gz")
}
resource "aws_s3_object" "seed" {
  bucket      = aws_s3_bucket.objects.id
  key         = "seed/initial.sqlite"
  source      = "../../.starcast/aws-seed.sqlite"
  source_hash = filesha256("../../.starcast/aws-seed.sqlite")
  lifecycle { prevent_destroy = true }
}
resource "aws_instance" "backend" {
  ami                         = data.aws_ssm_parameter.ami.value
  instance_type               = "t3a.small"
  subnet_id                   = aws_subnet.backend.id
  vpc_security_group_ids      = [aws_security_group.backend.id]
  associate_public_ip_address = true # outbound HTTPS without NAT; ingress restricted above
  iam_instance_profile        = aws_iam_instance_profile.backend.name
  disable_api_termination     = true
  credit_specification { cpu_credits = "standard" }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = 30
    delete_on_termination = false
    tags                  = { Project = "StarCast", Environment = "phase1", CostCenter = "RadioStar" }
  }
  user_data = templatefile("${path.module}/bootstrap.sh.tftpl", {
    bucket               = aws_s3_bucket.objects.id
    release_key          = aws_s3_object.release.key
    release_sha          = filesha256("../../.starcast/aws-release.tar.gz")
    secret_arn           = aws_secretsmanager_secret.backend.arn
    log_group            = aws_cloudwatch_log_group.backend.name
    processing_queue_url = aws_sqs_queue.processing.url
  })
  # Code updates use the reviewed SSM release command, not implicit instance replacement.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [ami, user_data]
  }
  depends_on = [aws_route_table_association.backend, aws_iam_role_policy.backend, aws_iam_role_policy_attachment.ssm, aws_s3_object.seed]
  tags       = { Name = "starcast-phase1-backend" }
}
resource "aws_cloudfront_vpc_origin" "backend" {
  vpc_origin_endpoint_config {
    name                   = "starcast-phase1"
    arn                    = aws_instance.backend.arn
    http_port              = 4173
    https_port             = 443
    origin_protocol_policy = "http-only" # private VPC path; viewer connection is HTTPS
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
  depends_on = [aws_internet_gateway.backend]
}
resource "aws_cloudfront_distribution" "api" {
  enabled      = true
  comment      = "Star Cast private Phase 1 API"
  price_class  = "PriceClass_100"
  http_version = "http2and3"
  origin {
    domain_name = aws_instance.backend.private_dns
    origin_id   = "starcast-backend"
    vpc_origin_config { vpc_origin_id = aws_cloudfront_vpc_origin.backend.id }
  }
  default_cache_behavior {
    target_origin_id           = "starcast-backend"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    viewer_protocol_policy     = "https-only"
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.viewer.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
output "instance_id" { value = aws_instance.backend.id }
output "secret_arn" { value = aws_secretsmanager_secret.backend.arn }
output "api_url" { value = "https://${aws_cloudfront_distribution.api.domain_name}" }
