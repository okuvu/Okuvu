terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.72"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }

  # Remote state is intentionally left commented out: the state bucket and lock
  # table do not exist yet, and a local backend keeps `init -backend=false`
  # usable without any AWS account.
  #
  # backend "s3" {
  #   bucket         = "okuvu-terraform-state"
  #   key            = "evia/beta/terraform.tfstate"
  #   region         = "ap-south-1"
  #   encrypt        = true
  #   dynamodb_table = "okuvu-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

data "aws_caller_identity" "current" {}
