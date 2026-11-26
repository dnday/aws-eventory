# AWS Evidence (Week 12)

Simpan screenshot di folder ini dengan nama seperti di tabel. Semua diambil dari sandbox AWS Academy Cloud Foundations dalam satu sesi lab. Pastikan region **N. Virginia (us-east-1)** terlihat di pojok kanan atas console.

| No | File | Apa yang di-screenshot | Membuktikan |
|----|------|------------------------|-------------|
| 1 | `01-console.png` | Halaman sandbox AWS Academy (status lab *ready*) dan AWS Console yang terbuka darinya (akun `voclabs` dan region terlihat di kanan atas) | Lingkungan aktif |
| 2 | `02-deploy-output.png` | Output `./scripts/deploy.sh` di CloudShell sampai baris "Website" dan "API" | Provisioning |
| 3 | `03-cloudformation.png` | CloudFormation > Stacks > `eventory`, tab **Resources** (semua `CREATE_COMPLETE`) | Infrastructure as Code |
| 4 | `04-function-urls.png` | Lambda > Functions (tiga fungsi `eventory-*`), lalu `eventory-event-service` > Configuration > Function URL (auth type NONE, CORS) | API endpoint |
| 5 | `05-auth-users.png` | S3 > bucket data > folder `users/` (file akun) dan isi salah satu file yang hanya berisi hash password, bukan password asli | Auth + security |
| 6 | `06-lambda-test.png` | Lambda > `eventory-event-service` > Test dengan event `events/list.json`, hasil `statusCode: 200` (untuk `create.json`, isi dulu token dari `POST /auth/login`) | Function test |
| 7 | `07-lambda-role.png` | Lambda > `eventory-event-service` > Configuration > Permissions, menunjukkan role `LabRole` | IAM |
| 8 | `08-data-bucket.png` | S3 > bucket data > folder `events/` setelah membuat dan menerbitkan acara dari website | Storage |
| 9 | `09-s3-photos.png` | S3 > bucket poster > folder `photos/` berisi poster yang di-upload, plus tab Permissions (Block Public Access: On) | Storage + security |
| 10 | `10-cloudfront.png` | CloudFront > distribusi Eventory > tab Origins (dua origin S3 dengan OAC) | CDN |
| 11 | `11-website.png` | Website lewat URL CloudFront (`https://...cloudfront.net`) login sebagai penyelenggara, menampilkan katalog acara dengan poster dan panel Acara saya | End-to-end |
| 12 | `12-smoke-test.png` | Output `./scripts/smoke_test.sh` dengan baris "Hasil: 21 lulus, 0 gagal" | Konektivitas |
| 13 | `13-cloudwatch-logs.png` | CloudWatch > Log groups > `/aws/lambda/eventory-event-service`, satu log stream terbaru | Logging |
| 14 | `14-alarms.png` | CloudWatch > Alarms (3 alarm `eventory-*-errors` status OK) dan SNS > Topics > `eventory-alerts` (subscription *Confirmed*) | Monitoring |

File teks `smoke-test-output.txt` dibuat otomatis oleh `scripts/smoke_test.sh`. Commit file itu bersama screenshot di atas.
