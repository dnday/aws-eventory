#!/usr/bin/env bash
# Uji end-to-end: daftar/masuk (auth-service), 4 operasi CRUD, peran penyelenggara, alur status acara,
# validasi, upload poster via S3 + CloudFront, lalu cek isi bucket data dan CloudWatch Logs.
# Output disimpan ke docs/evidence/smoke-test-output.txt.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.stack-outputs.env" ] || { echo "Jalankan scripts/deploy.sh dulu."; exit 1; }
# shellcheck disable=SC1091
source "$ROOT/.stack-outputs.env"
export AWS_DEFAULT_REGION="$REGION"
OUT="$ROOT/docs/evidence/smoke-test-output.txt"
PASS=0; FAIL=0

check() {  # check <nama> <status-diharapkan> <status-didapat>
  if [ "$2" = "$3" ]; then echo "  OK    $1 -> $3"; PASS=$((PASS+1));
  else echo "  GAGAL $1 -> dapat $3, harusnya $2"; FAIL=$((FAIL+1)); fi
}
call() {  # call <method> <url> <token|-> [body]  -> isi $CODE dan $BODY
  local args=(-s -w '\n%{http_code}' -X "$1" "$2")
  [ "$3" != "-" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-H 'content-type: application/json' -d "$4")
  local res; res=$(curl "${args[@]}")
  CODE=$(tail -n1 <<<"$res"); BODY=$(sed '$d' <<<"$res")
  echo "> $1 ${2#https://*/} ${4:-}"; echo "< $CODE $(cut -c1-160 <<<"$BODY")"
}
json() { python3 -c 'import sys,json; print(json.loads(sys.argv[1])[sys.argv[2]])' "$BODY" "$1" 2>/dev/null; }

# Tiga user uji: O = penyelenggara, O2 = penyelenggara lain, P = peserta biasa
PW="uji$(date +%s)a1"
token_for() {
  local email="$1"
  local cred="{\"email\":\"$email\",\"password\":\"$PW\"}"
  curl -s -o /dev/null -X POST "$AUTH_URL/auth/register" -H 'content-type: application/json' -d "$cred"
  [ "${2:-}" = "penyelenggara" ] && "$ROOT/scripts/add_organizer.sh" "$email" >/dev/null
  curl -s -X POST "$AUTH_URL/auth/login" -H 'content-type: application/json' -d "$cred" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))'
}
USER_O="smoke-org@eventory.test"; USER_O2="smoke-org2@eventory.test"; USER_P="smoke-peserta@eventory.test"
TOKEN_O=$(token_for "$USER_O" penyelenggara); TOKEN_O2=$(token_for "$USER_O2" penyelenggara); TOKEN_P=$(token_for "$USER_P")
NEW='{"title":"Seminar Cloud Computing 2026","category":"SEMINAR","venue":"Auditorium Merapi","startAt":"2026-12-10T09:00","price":25000,"quota":150}'

{
echo "Smoke test Eventory  |  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Events: $EVENTS_URL   Website: $WEBSITE_URL"
echo
echo "[1] Auth dan peran"
call POST "$AUTH_URL/auth/login" - "{\"email\":\"$USER_P\",\"password\":\"salah-password1\"}"
check "Login dengan password salah ditolak" 401 "$CODE"
call POST "$EVENTS_URL/events" - "$NEW";          check "POST tanpa token ditolak" 401 "$CODE"
call POST "$EVENTS_URL/events" "$TOKEN_P" "$NEW"; check "POST oleh peserta biasa ditolak" 403 "$CODE"

echo; echo "[2] Create"
call POST "$EVENTS_URL/events" "$TOKEN_O" "$NEW"
check "POST /events oleh penyelenggara" 201 "$CODE"
ID=$(json eventId)
call GET "$EVENTS_URL/events/$ID" -;            check "Draf belum terlihat publik" 404 "$CODE"
call GET "$EVENTS_URL/me/events" "$TOKEN_O";      check "GET /me/events (draf milik sendiri)" 200 "$CODE"

echo; echo "[3] Update dan alur status"
call PUT "$EVENTS_URL/events/$ID" "$TOKEN_O" '{"status":"PUBLISHED","quota":200}'
check "Publikasikan acara" 200 "$CODE"
call PUT "$EVENTS_URL/events/$ID" "$TOKEN_O2" '{"price":1}'
check "PUT oleh penyelenggara lain ditolak" 403 "$CODE"
call PUT "$EVENTS_URL/events/$ID" "$TOKEN_O" '{"status":"DRAFT"}'
check "Kembali ke DRAFT ditolak" 409 "$CODE"

echo; echo "[4] Read (publik)"
call GET "$EVENTS_URL/events/$ID" -;  check "GET /events/{id}" 200 "$CODE"
call GET "$EVENTS_URL/events" -;        check "GET /events (katalog)" 200 "$CODE"

echo; echo "[5] Validasi"
call POST "$EVENTS_URL/events" "$TOKEN_O" '{"title":"X","category":"SEMINAR","venue":"A","startAt":"2026-12-10T09:00","price":-5000,"quota":10}'
check "POST harga negatif" 400 "$CODE"

echo; echo "[6] Upload poster (media-service -> S3 -> CloudFront)"
call POST "$MEDIA_URL/uploads" "$TOKEN_O" '{"contentType":"image/png"}'
check "POST /uploads (presigned URL)" 200 "$CODE"
UPLOAD_URL=$(json uploadUrl); PHOTO_URL=$(json photoUrl)
IMG=$(mktemp); base64 -d > "$IMG" <<<"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'content-type: image/png' --data-binary "@$IMG" "$UPLOAD_URL")
check "PUT poster ke S3 lewat presigned URL" 200 "$C"
sleep 2
C=$(curl -s -o /dev/null -w '%{http_code}' "$PHOTO_URL")
check "GET poster lewat CloudFront (HTTPS)" 200 "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' "https://$PHOTO_BUCKET.s3.amazonaws.com/${PHOTO_URL#*.net/}")
check "Akses langsung ke bucket S3 diblokir" 403 "$C"

echo; echo "[7] Delete"
call DELETE "$EVENTS_URL/events/$ID" "$TOKEN_O";   check "Hapus acara yang sudah terbit ditolak" 409 "$CODE"
call PUT "$EVENTS_URL/events/$ID" "$TOKEN_O" '{"status":"CANCELLED"}'
check "Batalkan acara" 200 "$CODE"
call POST "$EVENTS_URL/events" "$TOKEN_O" "$NEW"; ID2=$(json eventId)
call DELETE "$EVENTS_URL/events/$ID2" "$TOKEN_O";  check "DELETE draf" 204 "$CODE"
call GET "$EVENTS_URL/events/$ID2" -;              check "GET setelah dihapus" 404 "$CODE"

echo; echo "[8] Website"
C=$(curl -s -o /dev/null -w '%{http_code}' "$WEBSITE_URL/")
check "Frontend lewat CloudFront" 200 "$C"

echo; echo "[9] Storage dan log"
echo "Acara di bucket data       : $(aws s3 ls "s3://$DATA_BUCKET/events/" | wc -l)"
echo "Akun di bucket data        : $(aws s3 ls "s3://$DATA_BUCKET/users/" | wc -l)"
echo "Objek di bucket poster     : $(aws s3 ls "s3://$PHOTO_BUCKET/photos/" --recursive | wc -l)"
echo "Log event-service terakhir:"
aws logs tail /aws/lambda/eventory-event-service --since 10m 2>/dev/null | tail -n 4

echo; echo "Hasil: $PASS lulus, $FAIL gagal"
} | tee "$OUT"

for u in "$USER_O" "$USER_O2" "$USER_P"; do
  aws s3 rm "s3://$DATA_BUCKET/users/$u.json" >/dev/null 2>&1
done
rm -f "${IMG:-}"
echo "Output tersimpan di docs/evidence/smoke-test-output.txt"
