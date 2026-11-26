# AWS Evidence (Week 12)

Semua screenshot diambil dari sandbox AWS Academy Cloud Foundations dalam satu sesi lab (26 November 2026), region N. Virginia (us-east-1).

| No | File | Isi | Membuktikan |
|----|------|-----|-------------|
| 1 | `01-console.png` | AWS Console sandbox (akun `voclabs`, region N. Virginia) | Lingkungan aktif |
| 2 | `02-deploy-output.png` | Output `./scripts/deploy.sh` di CloudShell sampai baris "Website" dan "API" | Provisioning |
| 3 | `03-cloudformation.png` | CloudFormation > stack `eventory` > Resources, semua `CREATE_COMPLETE` | Infrastructure as Code |
| 4 | `04a-lambda-functions.png`, `04b-function-url.png` | Tiga fungsi `eventory-*` (Python 3.12) dan Function URL event-service (auth NONE, CORS) | API endpoint |
| 5 | `05a-auth-users.png`, `05b-user-hash.png` | Folder `users/` di bucket data dan isi file akun demo yang hanya berisi salt + hash PBKDF2 | Auth + security |
| 6 | `06-lambda-test.png` | Test `eventory-event-service` dengan event `GET /events`, hasil `statusCode: 200` | Function test |
| 7 | `07-lambda-role.png` | Lambda > Configuration > Permissions, role `LabRole` | IAM |
| 8 | `08-data-bucket.png` | Folder `events/` di bucket data | Storage |
| 9 | `09a-s3-buckets.png`, `09b-s3-photos.png`, `09c-s3-block-public.png` | Daftar bucket, poster di `photos/`, dan Block Public Access: On | Storage + security |
| 10 | `10-cloudfront.png` | CloudFront > distribusi Eventory > Origins (dua origin S3 dengan OAC) | CDN |
| 11 | `11-website.png`, `11b-website-organizer.png` | Website lewat URL CloudFront: katalog dengan dua acara terbit berposter, dan panel penyelenggara (Buat acara + Acara saya) setelah login sebagai akun demo | End-to-end |
| 12 | `12-smoke-test.png` | Output `./scripts/smoke_test.sh`, "Hasil: 21 lulus, 0 gagal" | Konektivitas |
| 13 | `13-cloudwatch-logs.png` | Log group `/aws/lambda/eventory-event-service` dengan log stream terbaru | Logging |
| 14 | `14a-alarms.png`, `14b-sns.png` | Tiga alarm `eventory-*-errors` status OK dan topik `eventory-alerts` (subscription *Confirmed*) | Monitoring |

File teks `smoke-test-output.txt` adalah output lengkap `scripts/smoke_test.sh` dari CloudShell.
