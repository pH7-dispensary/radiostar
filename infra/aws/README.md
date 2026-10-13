# AWS foundation

This directory is deliberately declarative only. Applying it creates chargeable AWS resources and requires a separate approved deployment with least-privilege credentials.

Required deployment inputs: VPC/subnets/security groups, `DATABASE_URL` secret in Secrets Manager, alert email, KMS key policy, and a reviewed monthly budget. Do not apply from a developer device with broad credentials.

The production API uses RDS PostgreSQL. S3 and SQS are prepared for permitted artefacts and demand-triggered processing; no worker is created here.

Do not use the pH7 account, network, roles, databases, or production applications. `starcast_account_id` has no default and the provider refuses other accounts. The owner must supply the separately approved account after Cloudvisor confirmation. Neither AWS credit eligibility nor the approximately $15,000 credit allocation is verified for Star Cast.

Local development remains authoritative until a separately authorised deployment. The local SQLite adapter maps episodes/audio variants/transcripts/jobs/intelligence and the budget ledger to the existing PostgreSQL relationships; it is not a production shared worker store. Before migration, add transactional reservations and row-level job claims in PostgreSQL, authenticated listener sessions, SQS idempotency/retry handling, permitted S3 retention/removal policies, Secrets Manager credentials, CloudWatch redacted logs, and cost alarms. Preserve transcript hashes, source URIs, nullable timestamp pairs and all uncertain cost reservations during import. No infrastructure was deployed by the recovery work.
