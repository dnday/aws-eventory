# booking-service (direncanakan)

Service pemesanan tiket. Belum dibangun di Week 12. Konsepnya diambil dari PassGo dan disesuaikan dengan sandbox AWS Academy (tanpa DynamoDB dan SES).

- Data booking di bucket data: `bookings/{bookingId}.json` berisi `eventId`, `userId`, `qty`, `ticketCode` (kode acak unik untuk QR), `status` (VALID / CHECKED_IN / VOID), `createdAt`.
- Route di Function URL sendiri: `POST /events/{id}/bookings` (login), `GET /me/bookings` (login).
- Anti overselling: baca `events/{id}.json` beserta ETag-nya, cek `status = PUBLISHED` dan `sold + qty <= quota`, lalu tulis ulang dengan `If-Match: <ETag>`. Kalau ada pemesanan lain yang lebih dulu mengubah file itu, S3 menolak (412) dan service mencoba lagi dari awal. Kalau kuota habis, API mengembalikan 409. File booking baru ditulis setelah kuota berhasil dikurangi.
- E-tiket ditampilkan di halaman "Tiket saya". Pengiriman email (SES) menunggu akun yang menyediakan SES.
- Pembayaran (Midtrans di PassGo) belum dimasukkan; tahap awal hanya untuk acara gratis atau bayar di tempat.
