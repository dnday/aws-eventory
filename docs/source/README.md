# Sumber dokumen Week 12 Eventory

Diagram dan dokumen tidak dibuat dengan draw.io. Semuanya dibuat dari kode:

- `architecture_diagram.py`: menggambar diagram arsitektur (Python + reportlab). Posisi ikon ada di method `draw()` (`self.icon(file, x, y, judul, subjudul)`), panah di `self.path([...])`, label di `self.label(...)`. Ikon AWS ada di folder `icons/`.
- `build_docs.js`: membuat `design-brief.docx` dan `architecture-diagram.docx` (npm `docx`, Times New Roman, A4, tanpa footer). Teks setiap bagian langsung ada di file ini.

## Cara membuat ulang

```bash
pip install reportlab pymupdf
npm install docx

# 1. Diagram -> PDF -> PNG
python architecture_diagram.py architecture.pdf
python -c "import pymupdf; p=pymupdf.open('architecture.pdf')[0]; p.get_pixmap(dpi=220).save('architecture-ev.png')"

# 2. Dokumen Word (membaca architecture-ev.png dari folder output)
node build_docs.js .
```

Lalu buka kedua .docx di Word, cek masih 2 halaman, dan export ke PDF (File > Save As > PDF).
Salin hasilnya ke repo: `docs/design-brief.*`, `docs/architecture-diagram.*`, dan `docs/architecture.png` (dari architecture-ev.png).
