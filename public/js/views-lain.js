/* Halaman: Laporan, Pengeluaran */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    /* ================= LAPORAN PER KUMPULAN RW (Selasa Kliwon, malam Rabu Legi) ================= */
    const LS = (App.stLaporan = { periode: '' });

    App.views.laporan = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        root.innerHTML = `
            <h2 class="title no-print">Laporan per Kumpulan RW</h2>
            <div class="card no-print">
                <div class="filters">
                    <div class="grow"><label class="f" for="lPer">Kumpulan RW (Selasa Kliwon, malam Rabu Legi)</label><select id="lPer" data-change="laporanPilihPer"></select></div>
                </div>
                <div class="row">
                    <button class="btn primary sm" data-act="laporanPdf">Unduh PDF</button>
                    <button data-act="laporanBagikan" id="lBagikan" class="btn sm hidden">Bagikan</button>
                    <button class="btn sm" data-act="laporanCetak">Cetak</button>
                    <button class="btn sm" data-act="laporanCsv">CSV setoran</button>
                </div>
                <p class="small muted">PDF berisi laporan kumpulan yang dipilih dan siap dibagikan ke grup warga. Jimpitan dihitung per tanggal cut off kumpulan; iuran per hari ini.</p>
            </div>
            <div id="lOut">${App.loading()}</div>`;
        // Tombol Bagikan hanya bila perangkat mendukung berbagi berkas (umumnya HP)
        try {
            const uji = new File([''], 'a.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [uji] })) $('#lBagikan').classList.remove('hidden');
        } catch (e) { /* tidak didukung */ }
        await loadLaporan();
    };

    async function loadLaporan() {
        const r = await App.api('/api/laporan?' + App.qs({ periode: LS.periode }));
        LS.periode = r.laporan.periode.tanggal;
        $('#lPer').innerHTML = r.daftar_periode.map((p) =>
            `<option value="${esc(p.tanggal)}" ${p.tanggal === LS.periode ? 'selected' : ''}>Kumpulan ke-${p.no} · ${esc(p.weton)} ${App.tglId(p.tanggal)}${p.hari_ini ? ' · hari ini' : p.berjalan ? ' · belum tiba' : ''}</option>`).join('');
        tampilLaporan(r);
    }

    function tampilLaporan(r) {
        const L = r.laporan, p = L.periode, k = L.ringkasan;
        const kecil = (a, n) => a.length === 0 ? `<tr><td colspan="${n}" class="muted">Tidak ada data.</td></tr>` : '';
        const sj = L.status_jimpitan, si = L.status_iuran;
        const nf = (v) => Number(v || 0).toLocaleString('id-ID');
        $('#lOut').innerHTML = `
            <div class="print-only" style="margin-bottom:12px;text-align:center">
                <h2>${esc(r.ttd.nama_web)}</h2>
                <div><b>Laporan Kumpulan RW — ${esc(p.weton)} (malam Rabu Legi), ${App.tglId(p.tanggal)}</b></div>
                <div>Kumpulan ke-${p.no} · cut off ${App.tglId(p.tanggal)}</div>
            </div>
            ${p.hari_ini ? `<div class="notice no-print">Hari ini adalah kumpulan RW; angka dihitung sampai hari ini (${App.tglId(p.sampai)}). Transaksi yang dicatat setelah ini akan ikut masuk bila laporan dibuka ulang.</div>` : p.berjalan ? `<div class="notice no-print">Kumpulan ini belum tiba; angka dihitung sampai ${App.tglId(p.sampai)}.</div>` : ''}
            ${k ? `<h3 class="sec-title">Ringkasan kas</h3>
            ${(() => {
                // Kartu yang bisa diklik menuju halaman rinciannya (hanya bila akun punya izin melihat halaman itu)
                const IZIN = { iuran: 'iuran.lihat', jimpitan: 'jimpitan.lihat', pengeluaran: 'pengeluaran.lihat' };
                const TUJUAN = { iuran: 'Iuran Wajib', jimpitan: 'Rekap Jimpitan', pengeluaran: 'Pengeluaran' };
                const kartu = (kls, label, nilai, sub, ke) => ke && App.has(IZIN[ke])
                    ? `<button type="button" class="kas-card kas-link ${kls}" data-act="laporanKe" data-ke="${ke}" title="Buka ${TUJUAN[ke]}"><small>${label}</small><b>${nilai}</b>${sub ? `<span class="kas-sub">${sub}</span>` : ''}<span class="kas-go">${TUJUAN[ke]} →</span></button>`
                    : `<div class="kas-card ${kls}"><small>${label}</small><b>${nilai}</b>${sub ? `<span class="kas-sub">${sub}</span>` : ''}</div>`;
                const blok = (judul, kas, ket, kls, keMasuk) => `<section class="kas-blok ${kls}">
                    <header><b>${judul}</b><span>Saldo akhir <b>${rp(kas.akhir)}</b></span></header>
                    <div class="kas-grid">
                        <div class="kas-card"><small>Saldo periode sebelumnya</small><b>${rp(kas.awal)}</b><span class="kas-sub">${k.sejak_saldo_awal ? 'Saldo awal Pengaturan' : 'Saldo akhir kumpulan sebelumnya'}</span></div>
                        ${kartu('in', 'Total pemasukan', rp(kas.masuk), ket, keMasuk)}
                        ${kartu('out', 'Total pengeluaran', rp(kas.keluar), '', 'pengeluaran')}
                        <div class="kas-card akhir${kas.akhir < 0 ? ' neg' : ''}"><small>Saldo akhir</small><b>${rp(kas.akhir)}</b><span class="kas-sub">Cut off ${App.tglId(p.sampai)}</span></div>
                    </div></section>`;
                const tot = { awal: k.kas_rw.awal + k.kas_jimpitan.awal, masuk: k.kas_rw.masuk + k.kas_jimpitan.masuk, keluar: k.kas_rw.keluar + k.kas_jimpitan.keluar, akhir: k.kas_rw.akhir + k.kas_jimpitan.akhir };
                return blok('KAS IURAN RW', k.kas_rw, `Iuran ${rp(k.kas_rw.iuran)} · Lainnya ${rp(k.kas_rw.lainnya)}`, 'kas-rw', 'iuran') + blok('KAS JIMPITAN', k.kas_jimpitan, '', 'kas-jimpitan', 'jimpitan')
                    + blok('TOTAL KAS', tot, `Jimpitan ${rp(k.kas_jimpitan.masuk)} · Iuran RW ${rp(k.kas_rw.masuk)}`, 'kas-total');
            })()}
            <p class="small muted" style="margin:-4px 0 14px">Total Kas = Kas Iuran RW + Kas Jimpitan. Pemasukan dan pengeluaran = transaksi bertanggal ${App.tglId(p.dari)} s.d. ${App.tglId(p.sampai)}; yang sudah dilaporkan pada kumpulan sebelumnya sudah masuk saldo periode sebelumnya. Pengeluaran tanpa label dana dibebankan ke Kas Iuran RW.</p>` : ''}
            <h3 class="sec-title">Pemasukan per RT</h3>
            ${(() => {
                const rts = [...new Set([...L.jimpitan_rt.map((x) => x.rt), ...L.iuran_rt.map((x) => x.rt)])].sort();
                if (!rts.length) return '<div class="card empty" style="margin-bottom:14px">Tidak ada pemasukan pada kumpulan ini.</div>';
                const nJ = L.jimpitan_rt.reduce((a, x) => a + x.jumlah, 0), nI = L.iuran_rt.reduce((a, x) => a + x.jumlah, 0);
                const kartuRt = (judul, j, i, nj, ni, cls) => `<div class="stat ${cls || ''}"><small>${judul}</small><b>${rp(j + i)}</b>
                    <span class="small muted" style="display:block;margin-top:4px">Jimpitan ${rp(j)} (${nj} setoran)<br>Iuran ${rp(i)} (${ni} pembayaran)</span></div>`;
                return `<div class="grid cols-4" style="margin-bottom:14px">${kartuRt('Total semua RT', L.total_jimpitan, L.total_iuran, nJ, nI, 'good')}${rts.map((rt) => {
                    const j = L.jimpitan_rt.find((x) => x.rt === rt) || { total: 0, jumlah: 0 }, i = L.iuran_rt.find((x) => x.rt === rt) || { total: 0, jumlah: 0 };
                    return kartuRt('RT ' + esc(rt), j.total, i.total, j.jumlah, i.jumlah);
                }).join('')}</div>`;
            })()}
            ${k ? `<div class="card"><h3>Pemasukan lainnya</h3><div class="tbl-wrap"><table>
                <thead><tr><th>Tanggal</th><th>Uraian</th><th>RT</th><th class="r">Nominal</th></tr></thead><tbody>
                ${L.sewa.map((x) => `<tr><td>${App.tglId(x.tanggal)}</td><td style="white-space:normal">${esc(x.uraian)}</td><td>${x.rt ? 'RT ' + esc(x.rt) : 'RW'}</td><td class="r num">${rp(x.nominal)}</td></tr>`).join('')}${kecil(L.sewa, 4)}
                </tbody></table></div></div>
            <div class="card"><h3>Pengeluaran</h3><div class="tbl-wrap"><table>
                <thead><tr><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th class="r">Nominal</th></tr></thead><tbody>
                ${L.pengeluaran.map((x) => `<tr><td>${App.tglId(x.tanggal)}</td><td style="white-space:normal">${esc(x.uraian)}</td><td>${esc(x.kategori)}</td><td class="r num">${rp(x.nominal)}</td></tr>`).join('')}${kecil(L.pengeluaran, 4)}
                </tbody></table></div></div>` : ''}
            ${L.status_warga ? `<h3 class="sec-title">Status iuran warga</h3>
            <p class="small muted" style="margin-bottom:10px">${sj ? `Jimpitan per cut off ${App.tglId(p.sampai)}: ${sj.warga_aktif} warga wajib, ${sj.lunas} lunas, ${sj.menunggak} menunggak (total ${rp(sj.total_tunggakan)}). ` : ''}${si ? `Iuran wajib ${rp(si.nominal)} kumpulan ini: ${si.lunas} lunas, ${si.sebagian} sebagian, ${si.belum} belum bayar. ` : ''}Kewajiban dan setoran <b>kumulatif</b> sejak penagihan dimulai sampai cut off. <span class="sel-min">Merah = tunggakan</span> · <span class="sel-plus">hijau = kelebihan (titipan)</span>.</p>
            ${(() => {
                const sel = (v) => v === 0 ? '<span class="sel-nol">Lunas</span>' : v < 0 ? `<span class="sel-min">−${nf(-v)}</span>` : `<span class="sel-plus">+${nf(v)}</span>`;
                const grup = new Map();
                for (const x of L.status_warga) { if (!grup.has(x.rt)) grup.set(x.rt, []); grup.get(x.rt).push(x); }
                if (!grup.size) return '<div class="card empty" style="margin-bottom:14px">Tidak ada warga wajib.</div>';
                return [...grup.entries()].map(([rt, list]) => {
                    const tg = list.reduce((a, x) => a + x.tunggakan, 0), kl = list.reduce((a, x) => a + x.kelebihan, 0);
                    const n = list.filter((x) => x.tunggakan > 0).length;
                    return `<section class="rt-blok">
                        <header class="rt-head"><h4>RT ${esc(rt)}</h4>
                            <span class="rt-chip">${list.length} warga</span>
                            <span class="rt-chip ${n ? 'bad' : 'good'}">${n ? `${n} menunggak · ${rp(tg)}` : 'Tidak ada tunggakan'}</span>
                            ${kl ? `<span class="rt-chip good">Kelebihan ${rp(kl)}</span>` : ''}</header>
                        <div class="tbl-wrap"><table class="tbl-rt"><thead><tr><th>Nama</th><th class="r">Kewajiban Iuran</th><th class="r">Tunggakan / Kelebihan Iuran</th><th class="r">Kewajiban Jimpitan</th><th class="r">Tunggakan / Kelebihan Jimpitan</th></tr></thead><tbody>
                        ${list.map((x) => `<tr class="${x.tunggakan > 0 ? 'menunggak' : ''}"><td>${esc(x.nama)}</td>
                            <td class="r num" title="Setoran ${nf(x.iuran_setor)}">${x.iuran_kewajiban ? nf(x.iuran_kewajiban) : '-'}</td><td class="r num">${x.iuran_kewajiban || x.iuran_setor ? sel(x.iuran_selisih) : '-'}</td>
                            <td class="r num" title="Setoran ${nf(x.jimpitan_setor)}">${x.jimpitan_kewajiban ? nf(x.jimpitan_kewajiban) : '-'}</td><td class="r num">${x.jimpitan_kewajiban || x.jimpitan_setor ? sel(x.jimpitan_selisih) : '-'}</td></tr>`).join('')}
                        </tbody></table></div></section>`;
                }).join('');
            })()}` : ''}
            <div class="print-only small" style="margin-top:36px">
                <div style="display:flex;justify-content:space-around;text-align:center">
                    <div>Ketua RW<br><br><br><br><b>${esc(r.ttd.ketua_rw || '........................')}</b></div>
                    <div>Bendahara<br><br><br><br><b>${esc(r.ttd.nama_bendahara || '........................')}</b></div>
                </div>
                <div style="margin-top:16px">Dicetak ${App.tglId(App.today())}</div>
            </div>`;
    }

    // PDF diambil sebagai blob (butuh token login), lalu diunduh atau dibagikan
    async function ambilPdf() {
        const res = await fetch('/api/laporan?' + App.qs({ periode: LS.periode, format: 'pdf' }), { headers: App.token ? { Authorization: 'Bearer ' + App.token } : {} });
        if (!res.ok) throw new Error('Gagal membuat PDF.');
        return res.blob();
    }
    const namaPdf = () => `laporan-kumpulan-${LS.periode}.pdf`;
    App.changes.laporanPilihPer = async (el) => { LS.periode = el.value; await loadLaporan(); };
    App.actions.laporanPdf = async (btn) => {
        btn.disabled = true;
        try { await App.download('/api/laporan?' + App.qs({ periode: LS.periode, format: 'pdf' }), namaPdf()); }
        finally { btn.disabled = false; }
    };
    App.actions.laporanBagikan = async (btn) => {
        btn.disabled = true;
        try {
            const file = new File([await ambilPdf()], namaPdf(), { type: 'application/pdf' });
            await navigator.share({ files: [file], title: 'Laporan Kumpulan RW' });
        } catch (e) {
            if (e && e.name !== 'AbortError') App.toast(e.message || 'Gagal membagikan.', 'err');
        } finally { btn.disabled = false; }
    };
    App.actions.laporanCsv = async () => {
        await App.download('/api/laporan?' + App.qs({ periode: LS.periode, format: 'csv' }), `setoran-kumpulan-${LS.periode}.csv`);
    };
    App.actions.laporanCetak = () => window.print();
    // Kartu laporan → halaman rincian; kumpulan yang sama ikut terpilih di Iuran Wajib / Rekap Jimpitan
    App.actions.laporanKe = (el) => {
        const ke = el.dataset.ke;
        if (ke === 'iuran') { App.stIuran.periode = LS.periode; App.go('iuran'); }
        else if (ke === 'jimpitan') { App.stRekap.periode = LS.periode; App.stSetoran.jenis = 'rekap'; App.go('setoran'); }
        else App.go('pengeluaran');
    };

    /* ================= PENGELUARAN ================= */
    const KATEGORI = ['Santunan / Sosial', 'Keamanan / Ronda', 'Kebersihan', 'Fasilitas Lingkungan', 'Kegiatan Warga', 'Administrasi', 'Lainnya'];

    App.views.pengeluaran = async (root) => {
        if (!App.has('pengeluaran.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        root.innerHTML = `
            <div class="row between"><h2 class="title">Pengeluaran Dana</h2>
            ${App.has('pengeluaran.tulis') ? '<button class="btn primary" data-act="pengeluaranForm">+ Catat pengeluaran</button>' : '<span class="badge">Hanya lihat · dicatat oleh bendahara</span>'}</div>
            <div id="pList">${App.loading()}</div>`;
        await loadPengeluaran();
    };

    async function loadPengeluaran() {
        const r = await App.api('/api/pengeluaran');
        PG.data = r.pengeluaran;
        PG.dana = r.dana || 'umum';
        PG.semua = !!r.lihat_semua;
        App.pgReset('pengeluaran');
        App.pgRedraw.pengeluaran = tampilPengeluaran;
        tampilPengeluaran();
    }
    const PG = { data: [], dana: 'umum', semua: false };
    const NAMA_DANA = { umum: 'Umum (tidak dikaitkan ke satu dana)', jimpitan: 'Dana Jimpitan', iuran_wajib: 'Dana Iuran Wajib', sewa_aset: 'Dana Pemasukan Lainnya' };

    const DANA_PENDEK = { umum: 'Umum', jimpitan: 'Dana Jimpitan', iuran_wajib: 'Dana Iuran Wajib', sewa_aset: 'Dana Pemasukan Lainnya' };

    function tampilPengeluaran() {
        const data = PG.data;
        const tulis = App.has('pengeluaran.tulis');
        const sah = data.filter((p) => p.status === 'sah');
        const total = sah.reduce((a, p) => a + p.nominal, 0);
        // Kartu per jenis (kategori): hanya yang ada isinya, terbesar dulu
        const perJenis = new Map();
        for (const p of sah) {
            const g = perJenis.get(p.kategori) || { n: 0, c: 0 };
            g.n += p.nominal; g.c += 1;
            perJenis.set(p.kategori, g);
        }
        const jenis = [...perJenis.entries()].sort((a, b) => b[1].n - a[1].n);
        const kartu = `<div class="rk-baris" style="margin-bottom:14px">
            <div class="stat rk-c0"><small>Total pengeluaran</small><b style="color:#f43f5e">${rp(total)}</b><span class="small muted" style="display:block;margin-top:4px">${sah.length} pengeluaran${PG.semua ? '' : ' · ' + esc(NAMA_DANA[PG.dana])}</span></div>
            ${jenis.map(([k, g], i) => `<div class="stat rk-c${(i % 3) + 1}"><small>${esc(k)}</small><b>${rp(g.n)}</b><span class="small muted" style="display:block;margin-top:4px">${g.c} pengeluaran · ${total ? Math.round((g.n / total) * 100) : 0}%</span></div>`).join('')}
        </div>`;
        const pg = App.paginate('pengeluaran', data);
        $('#pList').innerHTML = `
            ${kartu}
            ${tulis ? `<p class="small" style="margin-bottom:6px">Pengeluaran yang Anda catat otomatis diambil dari <b>${esc(NAMA_DANA[PG.dana])}</b>.</p>` : ''}
            <p class="small muted" style="margin-bottom:10px">${PG.semua ? '' : 'Hanya menampilkan pengeluaran dari ' + esc(NAMA_DANA[PG.dana]) + ' · '}500 transaksi terakhir</p>
            ${pg.bar}
            ${data.length ? `<div class="card tbl-card"><div class="tbl-wrap"><table class="tbl-peng"><thead><tr><th>Tanggal</th><th>Uraian</th><th>Kategori</th><th>Dana</th><th class="r">Nominal</th>${tulis ? '<th></th>' : ''}</tr></thead><tbody>
                ${pg.items.map((p) => `<tr style="${p.status === 'batal' ? 'opacity:.55' : ''}">
                    <td style="white-space:nowrap">${App.tglId(p.tanggal)}</td>
                    <td style="white-space:normal;min-width:180px"><b>${esc(p.uraian)}</b><div class="small muted">${p.bukti ? 'bukti ' + esc(p.bukti) + ' · ' : ''}oleh ${esc(p.petugas)}${p.status === 'batal' ? ` · <span class="badge red">batal: ${esc(p.alasan_batal || '')}</span>` : ''}</div></td>
                    <td>${esc(p.kategori)}</td>
                    <td><span class="badge">${esc(DANA_PENDEK[p.sumber] || 'Umum')}</span></td>
                    <td class="r num"><b>${rp(p.nominal)}</b></td>
                    ${tulis ? `<td class="r" style="white-space:nowrap">${p.boleh_ubah && p.status !== 'batal' ? `<button class="btn sm" data-act="pengeluaranForm" data-id="${esc(p.id)}">Ubah</button> <button class="btn sm danger" data-act="pengeluaranHapus" data-id="${esc(p.id)}">Hapus</button>` : ''}</td>` : ''}</tr>`).join('')}
                </tbody><tfoot><tr><td colspan="4"><b>Total halaman ini</b></td><td class="r num"><b>${rp(pg.items.filter((p) => p.status === 'sah').reduce((a, p) => a + p.nominal, 0))}</b></td>${tulis ? '<td></td>' : ''}</tr></tfoot></table></div></div>`
            : '<div class="card empty">Belum ada pengeluaran.</div>'}`;
    }

    App.actions.pengeluaranForm = (el) => {
        const e = el && el.dataset && el.dataset.id ? PG.data.find((x) => x.id === el.dataset.id) : null;
        const v = e || { tanggal: App.today(), kategori: KATEGORI[0], uraian: '', nominal: '', bukti: '', sumber: 'umum' };
        const kat = KATEGORI.includes(v.kategori) ? KATEGORI : [v.kategori, ...KATEGORI];
        App.dialog(`
            <h3>${e ? 'Ubah pengeluaran' : 'Catat pengeluaran'}</h3>
            <form data-form="pengeluaran" data-id="${e ? esc(e.id) : ''}">
                <div class="form-grid">
                    <div><label class="f" for="pgTgl">Tanggal</label><input type="date" id="pgTgl" name="tanggal" value="${esc(App.ymd(v.tanggal))}" max="${App.today()}" required></div>
                    <div><label class="f" for="pgKat">Kategori</label><select id="pgKat" name="kategori">${kat.map((k) => `<option ${k === v.kategori ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
                    <div class="full"><label class="f" for="pgUr">Uraian</label><input id="pgUr" name="uraian" value="${esc(v.uraian)}" required minlength="3" maxlength="255" placeholder="mis. Santunan warga sakit"></div>
                    <div class="full"><label class="f">Diambil dari dana</label>
                        <div class="badge blue" style="padding:8px 12px">${esc(NAMA_DANA[e ? e.sumber : PG.dana] || NAMA_DANA.umum)}</div>
                        <p class="small muted" style="margin-top:4px">${e ? 'Dana asal tidak berubah saat pengeluaran diubah.' : 'Ditentukan otomatis menurut peran pencatat.'}</p></div>
                    <div><label class="f" for="pgNom">Nominal (Rp)</label><input type="number" id="pgNom" name="nominal" value="${esc(v.nominal)}" min="1" required inputmode="numeric"></div>
                    <div class="full"><label class="f" for="pgBukti">No. bukti / nota</label><input id="pgBukti" name="bukti" value="${esc(v.bukti || '')}" maxlength="100"></div>
                </div>
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Batal</button>
                    <button type="submit" class="btn primary">${e ? 'Simpan perubahan' : 'Simpan'}</button>
                </div>
            </form>`);
    };
    App.forms.pengeluaran = async (f) => {
        const body = { tanggal: f.tanggal.value, kategori: f.kategori.value, uraian: f.uraian.value, nominal: Number(f.nominal.value), bukti: f.bukti.value };
        if (f.dataset.id) await App.api('/api/pengeluaran', { method: 'PUT', body: { id: f.dataset.id, ...body } });
        else await App.api('/api/pengeluaran', { method: 'POST', body });
        App.closeDialog();
        App.toast(f.dataset.id ? 'Pengeluaran diperbarui.' : 'Pengeluaran tercatat.');
        await loadPengeluaran();
    };
    App.actions.pengeluaranHapus = (el) => {
        const e = PG.data.find((x) => x.id === el.dataset.id);
        App.dialog(`
            <h3>Hapus pengeluaran</h3>
            <p class="small muted" style="margin-bottom:12px">${e ? esc(e.uraian) + ' — ' + rp(e.nominal) + ' (' + App.tglId(e.tanggal) + ')' : ''}<br>
            Data dihapus permanen dari daftar dan saldo kas dihitung ulang. Isi lengkapnya tetap tersimpan di Log Aktivitas.</p>
            <form data-form="pengeluaranHapus" data-id="${esc(el.dataset.id)}">
                <label class="f" for="phAlasan">Alasan penghapusan</label>
                <input id="phAlasan" name="alasan" required minlength="3" maxlength="255" placeholder="mis. salah input / ganda">
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Kembali</button>
                    <button type="submit" class="btn danger">Hapus permanen</button>
                </div>
            </form>`);
    };
    App.forms.pengeluaranHapus = async (f) => {
        await App.api('/api/pengeluaran?id=' + encodeURIComponent(f.dataset.id) + '&alasan=' + encodeURIComponent(f.alasan.value), { method: 'DELETE' });
        App.closeDialog();
        App.toast('Pengeluaran dihapus.');
        await loadPengeluaran();
    };
})();
