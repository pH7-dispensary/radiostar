# Created after the initial foundation, then migrated from local state.
# No secret values are managed by this Terraform configuration.
terraform {
  backend "s3" {
    bucket              = "starcast-phase1-208096650030-eu-west-2"
    key                 = "infra/terraform.tfstate"
    region              = "eu-west-2"
    profile             = "radiostar"
    allowed_account_ids = ["208096650030"]
    encrypt             = true
    use_lockfile        = true
  }
}
