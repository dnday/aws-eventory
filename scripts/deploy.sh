#!/usr/bin/env bash
# Deploy seluruh Eventory dari template.yaml (AWS SAM / CloudFormation), lalu upload frontend.
# Jalankan dari CloudShell / VS Code IDE sandbox AWS Academy:   ALERT_EMAIL=emailkamu@contoh.com ./scripts/deploy.sh
# Aman dijalankan ulang: CloudFormation hanya menerapkan perubahan.
set -euo pipefail

REGION="${REGION:-us-east-1}"
STACK="${STACK:-eventory}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AWS_DEFAULT_REGION="$REGION"

if [ -z "${ALERT_EMAIL:-}" ]; then
  read -r -p "Email untuk notifikasi alarm: " ALERT_EMAIL
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS="eventory-artifacts-${ACCOUNT_ID}-${REGION}"
echo "Account: $ACCOUNT_ID   Region: $REGION   Stack: $STACK"

# 1. Bucket untuk artefak deploy (kode Lambda yang di-zip)
if ! aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  echo "[s3] membuat bucket artefak $ARTIFACTS"
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$ARTIFACTS" >/dev/null
  else
    aws s3api create-bucket --bucket "$ARTIFACTS" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$ARTIFACTS" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

# 2. Package + deploy template (SAM transform dijalankan oleh CloudFormation)
mkdir -p "$ROOT/build"
echo "[cfn] package kode Lambda"
aws cloudformation package --template-file "$ROOT/template.yaml" \
  --s3-bucket "$ARTIFACTS" --s3-prefix "$STACK" \
  --output-template-file "$ROOT/build/packaged.yaml" >/dev/null

# Kunci token login dibuat sekali saat stack pertama dibuat; deploy ulang memakai nilai lama.
PARAMS=("AlertEmail=$ALERT_EMAIL")
if ! aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  PARAMS+=("TokenSecret=$(openssl rand -hex 32)")
fi

echo "[cfn] deploy stack $STACK (pertama kali sekitar 5-10 menit karena CloudFront)"
aws cloudformation deploy --template-file "$ROOT/build/packaged.yaml" --stack-name "$STACK" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides "${PARAMS[@]}" \
  --tags project=eventory \
  --no-fail-on-empty-changeset

# 3. Simpan output stack untuk script lain
out() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
AUTH_URL=$(out AuthUrl); AUTH_URL=${AUTH_URL%/}
EVENTS_URL=$(out EventsUrl); EVENTS_URL=${EVENTS_URL%/}
MEDIA_URL=$(out MediaUrl); MEDIA_URL=${MEDIA_URL%/}
WEBSITE_URL=$(out WebsiteUrl)
DIST_ID=$(out DistributionId)
FRONTEND_BUCKET=$(out FrontendBucketName)
cat > "$ROOT/.stack-outputs.env" <<EOF
REGION=$REGION
STACK=$STACK
AUTH_URL=$AUTH_URL
EVENTS_URL=$EVENTS_URL
MEDIA_URL=$MEDIA_URL
WEBSITE_URL=$WEBSITE_URL
DIST_ID=$DIST_ID
FRONTEND_BUCKET=$FRONTEND_BUCKET
PHOTO_BUCKET=$(out PhotoBucketName)
DATA_BUCKET=$(out DataBucketName)
EOF

# 4. Upload frontend dengan config.js berisi alamat Function URL
echo "[s3] upload frontend ke $FRONTEND_BUCKET"
TMP=$(mktemp -d)
cp "$ROOT"/frontend/* "$TMP/"
cat > "$TMP/config.js" <<EOF
window.APP_CONFIG = {
  authUrl: "$AUTH_URL",
  eventsUrl: "$EVENTS_URL",
  mediaUrl: "$MEDIA_URL"
};
EOF
aws s3 sync "$TMP" "s3://$FRONTEND_BUCKET" --delete >/dev/null
rm -rf "$TMP"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
echo "[cloudfront] cache di-refresh"

echo
echo "Selesai."
echo "  Website : $WEBSITE_URL"
echo "  API     : $EVENTS_URL (acara), $AUTH_URL (akun), $MEDIA_URL (poster)"
echo "Cek inbox $ALERT_EMAIL dan klik 'Confirm subscription' dari AWS Notifications agar alarm terkirim."
echo "Jadikan akun penyelenggara: ./scripts/add_organizer.sh email@penyelenggara"
echo "Lanjutkan dengan: ./scripts/smoke_test.sh"
