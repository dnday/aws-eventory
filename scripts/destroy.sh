#!/usr/bin/env bash
# Hapus seluruh resource Eventory (stack CloudFormation + isi bucket) supaya kredit tidak terpakai.
# Data acara, akun, dan poster ikut terhapus permanen.
set -uo pipefail
REGION="${REGION:-us-east-1}"
STACK="${STACK:-eventory}"
export AWS_DEFAULT_REGION="$REGION"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

read -r -p "Hapus stack $STACK beserta data acara, poster, dan user? (ketik ya) " ans
[ "$ans" = "ya" ] || { echo "Dibatalkan."; exit 0; }

out() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}
for key in FrontendBucketName PhotoBucketName DataBucketName; do
  b=$(out "$key")
  [ -n "$b" ] && [ "$b" != "None" ] && aws s3 rm "s3://$b" --recursive >/dev/null && echo "Bucket $b dikosongkan"
done

aws cloudformation delete-stack --stack-name "$STACK"
echo "Menghapus stack (CloudFront butuh beberapa menit)..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK" && echo "Stack dihapus"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS="eventory-artifacts-${ACCOUNT_ID}-${REGION}"
aws s3 rb "s3://$ARTIFACTS" --force >/dev/null 2>&1 && echo "Bucket artefak dihapus"
rm -f "$ROOT/.stack-outputs.env"
