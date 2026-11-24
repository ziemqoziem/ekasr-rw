const PDFDocument = require('pdfkit');

/**
 * PDF laporan kumpulan RW (A4) untuk dibagikan ke warga. Memakai font bawaan PDF (Helvetica), tanpa berkas font tambahan.
 */
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (s) => `${Number(String(s).slice(8, 10))} ${BULAN[Number(String(s).slice(5, 7)) - 1]} ${String(s).slice(0, 4)}`;
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const C = { teks: '#1f2937', redup: '#6b7280', garis: '#d1d5db', head: '#e5e7eb', aksen: '#1d4ed8', merah: '#b91c1c', hijau: '#15803d' };

function buatPdf(L, ttd, stream) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 48, right: 48 }, bufferPages: true,
    info: { Title: `Laporan Kumpulan RW ${L.periode.tanggal}`, Author: ttd.nama_web || 'E-Kas RW' } });
  doc.pipe(stream);
  const X = doc.page.margins.left;
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bawah = () => doc.page.height - doc.page.margins.bottom;

  const butuh = (h) => { if (doc.y + h > bawah()) doc.addPage(); };

  function judul(t) {
    butuh(60);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.aksen).text(t, X, doc.y, { width: W });
    doc.moveTo(X, doc.y + 2).lineTo(X + W, doc.y + 2).strokeColor(C.aksen).lineWidth(0.8).stroke();
    doc.moveDown(0.5);
    doc.fillColor(C.teks);
  }
  function catatan(t) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.redup).text(t, X, doc.y, { width: W });
    doc.fillColor(C.teks);
    doc.moveDown(0.3);
  }
  /**
   * Tabel: kolom [{ k: kunci/fungsi, t: judul, w: bobot, a: 'right'|'left' }], baris array objek.
   * Judul kolom diulang di halaman baru.
   */
  function tabel(kolom, baris, opsi = {}) {
    const total = kolom.reduce((a, c) => a + c.w, 0);
    const lebar = kolom.map((c) => (c.w / total) * W);
    const pad = 4;
    const fs = opsi.fs || 9;
    const kepala = () => {
      doc.font('Helvetica-Bold').fontSize(fs - 0.5);
      const th = Math.max(...kolom.map((c, i) => doc.heightOfString(c.t, { width: lebar[i] - pad * 2 }))) + 8;
      butuh(th + 24);
      const y = doc.y;
      doc.rect(X, y, W, th).fill(C.head);
      doc.fillColor(C.teks);
      let x = X;
      kolom.forEach((c, i) => { doc.text(c.t, x + pad, y + 4, { width: lebar[i] - pad * 2, align: c.a || 'left' }); x += lebar[i]; });
      doc.y = y + th + 2;
    };
    kepala();
    if (!baris.length) {
      doc.font('Helvetica').fontSize(9).fillColor(C.redup).text('Tidak ada data.', X + pad, doc.y + 2);
      doc.fillColor(C.teks); doc.y += 14; return;
    }
    baris.forEach((b) => {
      doc.font(b._tebal ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
      const sel = kolom.map((c, i) => String(typeof c.k === 'function' ? c.k(b) : b[c.k] ?? ''));
      const tinggi = Math.max(...sel.map((t, i) => doc.heightOfString(t, { width: lebar[i] - pad * 2 }))) + 6;
      if (doc.y + tinggi > bawah()) { doc.addPage(); kepala(); doc.font(b._tebal ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs); }
      const y = doc.y;
      let x = X;
      sel.forEach((t, i) => { doc.fillColor(kolom[i].warna ? kolom[i].warna(b) : C.teks).text(t, x + pad, y + 3, { width: lebar[i] - pad * 2, align: kolom[i].a || 'left' }); x += lebar[i]; });
      doc.fillColor(C.teks);
      doc.moveTo(X, y + tinggi).lineTo(X + W, y + tinggi).strokeColor(C.garis).lineWidth(0.4).stroke();
      doc.y = y + tinggi;
    });
    doc.moveDown(0.2);
  }
  /** Kartu: [{ l: label, v: nilai, s: keterangan, warna }] disusun per baris sebanyak `n` kartu. */
  function kartu(items, n = 4) {
    const gap = 8;
    const lw = (W - gap * (n - 1)) / n;
    const adaS = items.some((x) => x.s);
    const h = adaS ? 58 : 44;
    for (let i = 0; i < items.length; i += n) {
      butuh(h + 8);
      const y = doc.y;
      items.slice(i, i + n).forEach((c, j) => {
        const x = X + j * (lw + gap);
        doc.roundedRect(x, y, lw, h, 5).fillAndStroke('#f9fafb', C.garis);
        doc.fillColor(C.redup).font('Helvetica').fontSize(7.5).text(String(c.l).toUpperCase(), x + 8, y + 7, { width: lw - 16, lineBreak: false });
        doc.fillColor(c.warna || C.teks).font('Helvetica-Bold').fontSize(11.5).text(c.v, x + 8, y + 19, { width: lw - 16, lineBreak: false });
        if (c.s) doc.fillColor(C.redup).font('Helvetica').fontSize(7.5).text(c.s, x + 8, y + 36, { width: lw - 16 });
      });
      doc.fillColor(C.teks);
      doc.y = y + h + 8;
    }
  }
  const kanan = { a: 'right' };

  /* ---------- Kop ---------- */
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.teks).text(ttd.nama_web || 'E-Kas RW', X, 48, { width: W, align: 'center' });
  if (ttd.subjudul) doc.font('Helvetica').fontSize(9).fillColor(C.redup).text(ttd.subjudul, { width: W, align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(X, doc.y).lineTo(X + W, doc.y).strokeColor(C.teks).lineWidth(1.2).stroke();
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.teks).text('LAPORAN KUMPULAN RW', { width: W, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).text(`${L.periode.weton} (malam Rabu Legi), ${tgl(L.periode.tanggal)}`, { width: W, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(C.redup).text(
    `Kumpulan ke-${L.periode.no || '-'} · cut off ${tgl(L.periode.tanggal)}${L.periode.hari_ini ? ` (kumpulan hari ini, dihitung sampai ${tgl(L.periode.sampai)})` : L.periode.berjalan ? ` (sementara, dihitung sampai ${tgl(L.periode.sampai)})` : ''}`,
    { width: W, align: 'center' });
  doc.fillColor(C.teks);

  /* ---------- Ringkasan kas ---------- */
  if (L.ringkasan) {
    const k = L.ringkasan;
    judul('1. Ringkasan Kas');
    kartu([{ l: 'Saldo awal (saldo periode sebelumnya)', v: rp(k.saldo_awal) }], 1);
    kartu([
      { l: 'Pemasukan jimpitan', v: rp(k.jimpitan) },
      { l: 'Pemasukan iuran', v: rp(k.iuran) },
      { l: 'Pemasukan lainnya', v: rp(k.sewa) }
    ], 3);
    kartu([
      { l: 'Total pemasukan', v: rp(k.masuk), warna: C.hijau },
      { l: 'Total pengeluaran', v: rp(k.keluar), warna: C.merah },
      { l: 'Saldo akhir kas', v: rp(k.saldo_akhir), warna: k.saldo_akhir < 0 ? C.merah : C.aksen }
    ], 3);
    const kt = k.kantong_akhir;
    catatan(`Saldo per kantong: jimpitan ${rp(kt.jimpitan)} · iuran wajib ${rp(kt.iuran)} · pemasukan lainnya ${rp(kt.sewa)}${kt.umum ? ' · umum ' + rp(kt.umum) : ''}.`);
  }

  /* ---------- Pemasukan per RT ---------- */
  judul(L.ringkasan ? '2. Pemasukan per RT' : '1. Pemasukan per RT');
  const rtSet = [...new Set([...L.jimpitan_rt.map((x) => x.rt), ...L.iuran_rt.map((x) => x.rt)])].sort();
  const J = new Map(L.jimpitan_rt.map((x) => [x.rt, x]));
  const Iu = new Map(L.iuran_rt.map((x) => [x.rt, x]));
  const nJ = L.jimpitan_rt.reduce((a, x) => a + x.jumlah, 0), nI = L.iuran_rt.reduce((a, x) => a + x.jumlah, 0);
  if (!rtSet.length) catatan('Tidak ada pemasukan pada kumpulan ini.');
  else kartu([
    { l: 'Total semua RT', v: rp(L.total_jimpitan + L.total_iuran), warna: C.hijau, s: `Jimpitan ${rp(L.total_jimpitan)} (${nJ} setoran)
Iuran ${rp(L.total_iuran)} (${nI} pembayaran)` },
    ...rtSet.map((r) => {
      const j = J.get(r) || { total: 0, jumlah: 0 }, i = Iu.get(r) || { total: 0, jumlah: 0 };
      return { l: `RT ${r}`, v: rp(j.total + i.total), s: `Jimpitan ${rp(j.total)} (${j.jumlah} setoran)
Iuran ${rp(i.total)} (${i.jumlah} pembayaran)` };
    })
  ], 3);

  let no = L.ringkasan ? 3 : 2;
  /* ---------- Sewa & pengeluaran ---------- */
  if (L.ringkasan) {
    judul(`${no++}. Pemasukan Lainnya`);
    tabel([{ k: (b) => tgl(b.tanggal), t: 'Tanggal', w: 1.3 }, { k: 'uraian', t: 'Uraian', w: 3 }, { k: (b) => (b.rt ? 'RT ' + b.rt : 'RW'), t: 'RT', w: 0.8 }, { k: (b) => rp(b.nominal), t: 'Nominal', w: 1.2, ...kanan }], L.sewa);
    judul(`${no++}. Pengeluaran`);
    tabel([{ k: (b) => (b.tanggal ? tgl(b.tanggal) : ''), t: 'Tanggal', w: 1.3 }, { k: 'uraian', t: 'Uraian', w: 3 }, { k: 'kategori', t: 'Kategori', w: 1.4 }, { k: (b) => rp(b.nominal), t: 'Nominal', w: 1.2, ...kanan }],
      L.pengeluaran.concat(L.pengeluaran.length ? [{ tanggal: null, uraian: 'Total pengeluaran', kategori: '', nominal: L.ringkasan.keluar, _tebal: true }] : []));
  }

  /* ---------- Status iuran warga ---------- */
  if (L.status_warga) {
    const sj = L.status_jimpitan, si = L.status_iuran;
    judul(`${no++}. Status Iuran Warga`);
    const ket = [];
    if (sj) ket.push(`Jimpitan per cut off ${tgl(L.periode.sampai)}: ${sj.warga_aktif} warga wajib, ${sj.lunas} lunas, ${sj.menunggak} menunggak (total ${rp(sj.total_tunggakan)}).`);
    if (si) ket.push(`Iuran wajib ${rp(si.nominal)} kumpulan ini: ${si.lunas} lunas, ${si.sebagian} sebagian, ${si.belum} belum bayar.`);
    catatan(`${ket.join(' ')} Kewajiban dan setoran bersifat kumulatif sejak penagihan dimulai sampai cut off (bukan hanya kumpulan ini). Tunggakan = kewajiban - setoran. Nilai dalam Rupiah; hanya warga yang masih memiliki tunggakan.`);
    const n = (v) => Number(v || 0).toLocaleString('id-ID');
    tabel([{ k: (b) => `${b.nama} (RT ${b.rt})`, t: 'Nama (RT)', w: 2.6 },
      { k: (b) => n(b.iuran_kewajiban), t: 'Kewajiban Iuran', w: 1, ...kanan }, { k: (b) => n(b.iuran_setor), t: 'Setoran Iuran', w: 1, ...kanan }, { k: (b) => n(b.iuran_kurang), t: 'Tunggakan Iuran', w: 1, ...kanan },
      { k: (b) => n(b.jimpitan_kewajiban), t: 'Kewajiban Jimpitan', w: 1, ...kanan }, { k: (b) => n(b.jimpitan_setor), t: 'Setoran Jimpitan', w: 1, ...kanan }, { k: (b) => n(b.jimpitan_kurang), t: 'Tunggakan Jimpitan', w: 1, ...kanan },
      { k: (b) => n(b.total), t: 'Total Tunggakan', w: 1.1, ...kanan, warna: () => C.merah }], L.status_warga, { fs: 7.5 });
  }

  /* ---------- Tanda tangan ---------- */
  butuh(130);
  doc.moveDown(1.5);
  const y = doc.y;
  const kol = W / 2;
  doc.font('Helvetica').fontSize(10).fillColor(C.teks);
  doc.text('Ketua RW', X, y, { width: kol, align: 'center' });
  doc.text('Bendahara', X + kol, y, { width: kol, align: 'center' });
  doc.font('Helvetica-Bold');
  doc.text(ttd.ketua_rw || '........................', X, y + 70, { width: kol, align: 'center' });
  doc.text(ttd.nama_bendahara || '........................', X + kol, y + 70, { width: kol, align: 'center' });

  /* ---------- Footer tiap halaman ---------- */
  const hal = doc.bufferedPageRange();
  for (let i = 0; i < hal.count; i++) {
    doc.switchToPage(hal.start + i);
    doc.font('Helvetica').fontSize(8).fillColor(C.redup);
    doc.page.margins.bottom = 0; // agar teks footer tidak memicu halaman baru
    doc.text(`Dicetak ${tgl(L.dibuat)} · ${ttd.nama_web || ''} · Halaman ${i + 1} dari ${hal.count}`, X, doc.page.height - 36, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
}

module.exports = { buatPdf };
