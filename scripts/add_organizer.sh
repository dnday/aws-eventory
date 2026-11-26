#!/usr/bin/env bash
# Jadikan akun yang sudah terdaftar sebagai penyelenggara (isOrganizer=true di users/{email}.json).
# Contoh: ./scripts/add_organizer.sh hmti@contoh.ac.id
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.stack-outputs.env"
export AWS_DEFAULT_REGION="$REGION"
EMAIL=$(tr '[:upper:]' '[:lower:]' <<<"${1:?pakai: ./scripts/add_organizer.sh email}")
KEY="s3://$DATA_BUCKET/users/$EMAIL.json"

USER_JSON=$(aws s3 cp "$KEY" - 2>/dev/null) || { echo "Akun $EMAIL belum terdaftar. Daftar dulu lewat website."; exit 1; }
python3 -c 'import json,sys; u=json.loads(sys.argv[1]); u["isOrganizer"]=True; print(json.dumps(u))' "$USER_JSON" \
  | aws s3 cp - "$KEY" --content-type application/json
echo "$EMAIL sekarang penyelenggara. Minta dia logout lalu login lagi supaya tokennya diperbarui."
