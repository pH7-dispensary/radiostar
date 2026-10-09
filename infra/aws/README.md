# AWS foundation

This directory is deliberately declarative only. Applying it creates chargeable AWS resources and requires a separate approved deployment with least-privilege credentials.

Required deployment inputs: VPC/subnets/security groups, `DATABASE_URL` secret in Secrets Manager, alert email, KMS key policy, and a reviewed monthly budget. Do not apply from a developer device with broad credentials.

The production API uses RDS PostgreSQL. S3 and SQS are prepared for permitted artefacts and demand-triggered processing; no worker is created here.
