#!/usr/bin/env bash
# Runs inside LocalStack when it is ready: creates the evidence bucket used by the S3 adapter.
set -euo pipefail
awslocal s3 mb s3://pmd-evidence-local || true
echo "LocalStack ready: s3://pmd-evidence-local"
