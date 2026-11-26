const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  AlignmentType, HeadingLevel, ImageRun, PageOrientation, LevelFormat, Footer, PageNumber, TabStopType,
} = require("docx");

const FONT = "Times New Roman";
const OUT = process.argv[2] || ".";

// ---------------------------------------------------------------- helpers
const run = (text, opts = {}) => new TextRun({ text, font: FONT, ...opts });

// teks dengan **tebal** sederhana
function rich(text, size) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith("**") ? run(part.slice(2, -2), { bold: true, size }) : run(part, { size }));
}

const p = (text, opts = {}) => new Paragraph({
  alignment: opts.align ?? AlignmentType.JUSTIFIED,
  spacing: { after: opts.after ?? 120, line: opts.line ?? 276 },
  keepNext: opts.keepNext,
  children: rich(text, opts.size),
});

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] });

const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(rows, widths, total) {
  const w = widths.map((x) => Math.round(x * total));
  w[w.length - 1] = total - w.slice(0, -1).reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: w,
    rows: rows.map((row, r) => new TableRow({
      tableHeader: r === 0,
      cantSplit: true,
      children: row.map((cell, c) => new TableCell({
        borders,
        width: { size: w[c], type: WidthType.DXA },
        shading: r === 0 ? { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" } : undefined,
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
        children: [new Paragraph({
          spacing: { after: 0, line: 240 },
          children: r === 0 ? [run(cell, { bold: true, size: 22 })] : rich(cell, 22),
        })],
      })),
    })),
  });
}

const gap = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

const styles = {
  default: { document: { run: { font: FONT, size: 24 } } },
  paragraphStyles: [
    { id: "Title", name: "Title", basedOn: "Normal",
      run: { font: FONT, size: 28, bold: true },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 }, keepNext: true } },
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font: FONT, size: 24, bold: true },
      paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 0 } },
  ],
};

const numbering = {
  config: [{ reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
    alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] }],
};

const footer = (label) => new Footer({
  children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
    children: [run(label, { size: 18 }), run("\t", { size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })],
  })],
});

const A4 = { width: 11906, height: 16838 };
const MARGIN = { top: 1440, bottom: 1300, left: 1440, right: 1440 };
const TW = A4.width - MARGIN.left - MARGIN.right; // 9026

// ================================================================= DESIGN BRIEF
const IDENT = [["Nama", "Marcelinus Dinoglide Yoga Prakoso"], ["NIM", "24/533842/TK/59152"], ["Kelas", "B-Teknologi Informasi"]];
const ident = IDENT.map(([k, v]) => new Paragraph({
  spacing: { after: 40 },
  tabStops: [{ type: TabStopType.LEFT, position: 1100 }],
  children: [run(k), run("\t: " + v)],
}));

const brief = [
  new Paragraph({ style: "Title", children: [run("DESIGN BRIEF")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [run("Eventory: Platform Tiket Acara Kampus", { bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [run("Proyek Individu AWS Cloud Computing, Week 12")] }),
  ...ident,
  new Paragraph({ spacing: { after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } }, children: [] }),

  h1("1. Latar Belakang dan Use Case"),
  p("Hampir setiap minggu ada acara di kampus yang diadakan himpunan, BEM, atau UKM, mulai dari seminar, workshop, " +
    "lomba, sampai konser. Sebagian besar panitia masih mengelola pendaftarannya secara manual. Informasi acara " +
    "disebar lewat poster di Instagram dan grup WhatsApp, peserta mendaftar lewat Google Form, mentransfer uang, lalu " +
    "mengirim bukti transfer ke panitia lewat chat."),
  p("Cara ini menimbulkan beberapa masalah. Informasi acara tersebar di banyak tempat, sehingga mahasiswa sering baru " +
    "tahu ada acara setelah pendaftarannya ditutup. Panitia harus merekap pendaftar dan mengecek bukti transfer satu " +
    "per satu, dan karena rekapnya tidak langsung terlihat, jumlah pendaftar bisa melebihi kapasitas ruangan. Platform " +
    "tiket seperti Loket sebenarnya bisa dipakai, tetapi memungut biaya layanan dan terlalu rumit untuk acara kampus " +
    "yang pesertanya hanya puluhan sampai ratusan orang."),
  p("Untuk itu saya membuat **Eventory**, platform tiket acara kampus berbasis web. Idenya saya kembangkan dari " +
    "**PassGo**, platform tiket acara yang saya buat bersama kelompok di mata kuliah Pengembangan Aplikasi Web, lalu " +
    "saya bangun ulang sendiri dalam versi yang lebih sederhana dengan layanan serverless AWS. Pada Week 12, fokusnya " +
    "adalah pengelolaan acara: penyelenggara membuat acara sebagai draf, mengunggah poster, lalu menerbitkannya, " +
    "sedangkan mahasiswa bisa melihat semua acara yang dibuka beserta harga dan sisa kuotanya di satu tempat. Pemesanan " +
    "tiket dengan kuota yang tidak bisa terlampaui dan e-tiket lewat email saya rencanakan untuk minggu berikutnya."),

  h1("2. Track yang Dipilih"),
  p("Saya memilih Track C (Serverless) karena penjualan tiket biasanya hanya ramai sebentar setelah acara diumumkan, " +
    "jadi lebih hemat kalau biaya dihitung per request. Sandbox AWS Academy tidak menyediakan API Gateway, DynamoDB, " +
    "dan Cognito, jadi penggantinya seperti di tabel berikut:",
    { keepNext: true }),
  table([
    ["Di PassGo", "Di Eventory (AWS)", "Fungsi"],
    ["Backend Express", "Lambda + Function URL", "REST API (auth, event, media)"],
    ["MongoDB Atlas", "Amazon S3 (file JSON)", "Menyimpan data acara dan akun"],
    ["Login JWT dan bcrypt", "auth-service", "Daftar, login, peran penyelenggara"],
    ["Supabase Storage", "Amazon S3", "Menyimpan poster acara"],
    ["Azure App Service", "Amazon S3 + CloudFront", "Hosting website lewat HTTPS"],
    ["Log server", "CloudWatch + SNS", "Log dan email kalau ada error"],
    ["GitHub Actions", "AWS SAM (template.yaml)", "Membuat semua resource dengan satu perintah"],
  ], [0.26, 0.32, 0.42], TW),
  gap(20),
  p("Midtrans, tipe tiket bertingkat, dan pemindai QR dari PassGo belum dimasukkan."),

  h1("3. Entitas Data"),
  p("Entitas utamanya adalah **Event**, yaitu satu acara. Setiap acara disimpan sebagai satu file JSON " +
    "events/{eventId}.json di bucket S3 data.", { keepNext: true }),
  table([
    ["Atribut", "Tipe", "Keterangan"],
    ["eventId", "String", "ID acara (UUID), dibuat otomatis"],
    ["title, description", "String", "Nama dan deskripsi acara"],
    ["category", "String", "SEMINAR, WORKSHOP, KONSER, LOMBA, atau LAINNYA"],
    ["venue, startAt", "String", "Tempat dan waktu mulai acara"],
    ["price", "Number", "Harga tiket dalam rupiah, 0 berarti gratis"],
    ["quota, sold", "Number", "Kuota tiket dan jumlah yang sudah terjual"],
    ["posterUrl", "String", "Link poster acara"],
    ["organizerId, organizerName", "String", "ID akun penyelenggara dan nama organisasinya"],
    ["status", "String", "DRAFT, PUBLISHED, atau CANCELLED"],
    ["createdAt, updatedAt", "String", "Waktu dibuat dan terakhir diubah"],
  ], [0.32, 0.12, 0.56], TW),

  h1("4. Endpoint CRUD"),
  p("Keempat endpoint ini ditangani oleh fungsi eventory-event-service.", { keepNext: true }),
  table([
    ["Operasi", "Endpoint", "Siapa yang boleh", "Respons"],
    ["Create", "POST /events", "Penyelenggara", "201 berisi acara baru (status DRAFT)"],
    ["Read", "GET /events/{id}", "Semua orang (draf tidak tampil)", "200 berisi detail acara"],
    ["Update", "PUT /events/{id}", "Penyelenggara pemilik acara", "200 berisi acara yang sudah diubah"],
    ["Delete", "DELETE /events/{id}", "Pemilik, hanya selama DRAFT", "204"],
  ], [0.13, 0.24, 0.3, 0.33], TW),
  gap(20),
  p("Status acara hanya bisa berubah dari DRAFT ke PUBLISHED, lalu ke CANCELLED. Kode error: 400 (input tidak " +
    "valid), 401 (belum login), 403 (tidak punya hak), 404 (tidak ditemukan), dan 409 (perubahan tidak diizinkan). " +
    "Endpoint lainnya: GET /events, GET /me/events, POST /uploads, dan /auth/*."),

  h1("5. Keamanan dan Deployment"),
  p("Password disimpan sebagai hash PBKDF2, token login ditandatangani HMAC, dan ketiga Lambda memakai LabRole " +
    "karena sandbox tidak mengizinkan membuat IAM role. Deploy dari CloudShell dengan scripts/deploy.sh."),
];

const briefDoc = new Document({
  creator: "", title: "Design Brief - Eventory", styles, numbering,
  sections: [{
    properties: { page: { size: A4, margin: MARGIN } },

    children: brief,
  }],
});

// ================================================================= ARCHITECTURE
const img = fs.readFileSync(`${OUT}/architecture-ev.png`);
const LAND_MARGIN = { top: 900, bottom: 900, left: 1000, right: 1000 };
const imgW = 950; // px (96 dpi)
const imgH = Math.round(imgW * 1559 / 2628);

const step = (text) => new Paragraph({
  numbering: { reference: "steps", level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 276 },
  children: rich(text),
});

const archDoc = new Document({
  creator: "", title: "Architecture Diagram - Eventory", styles, numbering,
  sections: [
    {
      properties: { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE },
        margin: LAND_MARGIN } },

      children: [
        new Paragraph({ style: "Title", children: [run("ARCHITECTURE DIAGRAM")] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
          children: [run("Eventory, Track C Serverless, Week 12")] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 },
          children: [new ImageRun({ type: "png", data: img, transformation: { width: imgW, height: imgH },
            altText: { title: "Arsitektur Eventory", description: "Diagram arsitektur AWS", name: "arsitektur" } })] }),
      ],
    },
    {
      properties: { page: { size: A4, margin: MARGIN } },

      children: [
        new Paragraph({ style: "Title", spacing: { after: 200 }, children: [run("PENJELASAN DIAGRAM")] }),
        h1("1. Alur Request dan Data"),
        step("Pengguna membuka website lewat CloudFront (HTTPS). File HTML, CSS, dan JavaScript-nya diambil dari bucket S3."),
        step("Peserta dan penyelenggara daftar lalu login ke auth-service. Akun disimpan di folder users/ pada bucket " +
          "data, dan setelah login browser mendapat token bertanda tangan HMAC yang berisi peran penyelenggara."),
        step("Halaman katalog memanggil GET /events ke Function URL event-service, yang membaca folder events/ di " +
          "bucket data dan hanya mengembalikan acara yang sudah terbit."),
        step("Untuk membuat, mengubah, atau menghapus acara, browser mengirim token di header Authorization. " +
          "event-service memeriksa tanda tangan dan masa berlaku token, peran penyelenggara, dan pemilik acara. " +
          "Perubahan ditulis dengan syarat If-Match supaya dua perubahan bersamaan tidak saling menimpa."),
        step("Untuk poster, browser meminta link upload ke media-service (POST /uploads), lalu mengirim gambar langsung " +
          "ke bucket S3. Posternya ditampilkan lewat CloudFront."),
        h1("2. IAM dan Keamanan"),
        p("Sandbox tidak mengizinkan membuat IAM role, jadi ketiga Lambda memakai LabRole bawaan sandbox. Ini lebih " +
          "longgar dari rencana awal saya (satu role dengan izin minimum per fungsi). Password hanya disimpan sebagai " +
          "hash PBKDF2, dan kunci token dibuat acak saat deploy. Ketiga bucket S3 privat: frontend dan poster hanya " +
          "bisa dibaca CloudFront (OAC), bucket data tidak bisa dibaca dari luar. Link upload poster berlaku 5 menit."),
        h1("3. Network"),
        p("Saya tidak membuat VPC karena tidak ada EC2 atau RDS yang perlu ditaruh di jaringan privat. Semua yang " +
          "diakses dari internet memakai HTTPS, yaitu CloudFront untuk website dan poster dan Lambda Function URL " +
          "untuk API."),
        h1("4. Monitoring dan Biaya"),
        p("Log setiap fungsi masuk ke CloudWatch Logs. Kalau ada Lambda yang error, CloudWatch Alarm mengirim email " +
          "lewat SNS. Biaya dibatasi kredit sandbox, dan resource terhapus saat sesi lab berakhir."),
        h1("5. Yang Direncanakan"),
        p("booking-service (kotak abu-abu di diagram) untuk pemesanan tiket. Kuota dikurangi dengan menulis ulang " +
          "file acara memakai syarat If-Match, sehingga tiket tidak bisa terjual melebihi kuota walaupun banyak orang " +
          "memesan bersamaan. Bagian ini belum dibuat di Week 12."),
      ],
    },
  ],
});

(async () => {
  fs.writeFileSync(`${OUT}/design-brief.docx`, await Packer.toBuffer(briefDoc));
  fs.writeFileSync(`${OUT}/architecture-diagram.docx`, await Packer.toBuffer(archDoc));
  console.log("ok");
})();
