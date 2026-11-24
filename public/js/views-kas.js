/* Halaman Buku Kas tunggal RW: gabungan jimpitan + iuran wajib + pemasukan lainnya − pengeluaran. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;
    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const KS = (App.stKas = { sub: 'buku', dari: '', sampai: '', sumber: '', data: null });
    const SUMBER = { jimpitan: ['Jimpitan', 'blue'], iuran_wajib: ['Iuran Wajib', 'green'], sewa_aset: ['Pemasukan Lainnya', 'amber'], pengeluaran: ['Pengeluaran', 'red'] };
    const stat = (cls, l, v, ket, warna) => `<div class="stat ${cls}"><small>${l}</small><b${warna ? ` style="color:${warna}"` : ''}>${v}</b>${ket ? `<span class="small muted" style="display:block;margin-top:4px">${ket}</span>` : ''}</div>`;

    App.views.kas = async (root) => {
        if (!App.has('kas.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        root.innerHTML = `
            <div class="row between"><h2 class="title">Buku Kas RW</h2><button class="btn sm no-print" data-act="laporanCetak">Cetak</button></div>
            <div class="subtabs">${[['buku', 'Buku Kas'], ['periode', 'Per Periode Kumpulan'], ['tutup', 'Tutup Buku']].map(([id, l]) => `<button class="tab ${KS.sub === id ? 'active' : ''}" data-act="kasSub" data-sub="${id}">${l}</button>`).join('')}</div>
            <div id="kasBody">${App.loading()}</div>`;
        await muat();
    };
    App.actions.kasSub = (el) => { KS.sub = el.dataset.sub; return App.render(); };

    async function muat() {
        const r = await App.api('/api/kas?' + App.qs({ dari: KS.dari, sampai: KS.sampai, sumber: KS.sumber }));
        KS.data = r;
        KS.dari = r.dari; KS.sampai = r.sampai;
        App.pgReset('kas');
        App.pgRedraw.kas = tampil;
        tampil();
    }

    function tampil() {
        const r = KS.data;
        const k = r.saldo_kas;
        const tiles = `<div class="rk-baris" style="margin-bottom:14px">
            ${stat('rk-c0', 'Saldo kas RW (total)', rp(k.saldo), 'seluruh sumber dana', k.saldo < 0 ? '#f43f5e' : '')}
            ${stat('rk-c1', 'Saldo jimpitan', rp(k.jimpitan), '', k.jimpitan < 0 ? '#f43f5e' : '')}
            ${stat('rk-c2', 'Kas Bendahara RW', rp(k.iuran + k.sewa), 'iuran wajib + pemasukan lainnya', k.iuran + k.sewa < 0 ? '#f43f5e' : '')}
            ${k.umum ? stat('rk-c3', 'Pengeluaran umum', rp(k.umum), 'tanpa label dana', k.umum < 0 ? '#f43f5e' : '') : ''}</div>`;
        if (KS.sub === 'tutup') { $('#kasBody').innerHTML = tiles + '<div id="tbBody">' + App.loading() + '</div>'; tutupBuku(); return; }
        $('#kasBody').innerHTML = tiles + (KS.sub === 'buku' ? vBuku(r) : vPeriode(r));
    }

    /* ---------- Buku Kas ---------- */
    function vBuku(r) {
        const pg = App.paginate('kas', r.baris, { selalu: true });
        const sumberSel = '<option value="">Semua sumber</option>' + Object.entries(SUMBER).map(([v, [l]]) => `<option value="${v}" ${KS.sumber === v ? 'selected' : ''}>${l}</option>`).join('');
        const selisih = r.total_masuk - r.total_keluar;
        const ringkas = `<div class="rk-baris" style="margin-bottom:14px">
            ${r.saldo_awal !== null ? stat('rk-c0', 'Saldo awal', rp(r.saldo_awal), `sebelum ${tgl(r.dari)}`) : stat('rk-c0', 'Rentang', `${tgl(r.dari)}`, `s.d. ${tgl(r.sampai)}`)}
            ${stat('rk-c1', 'Total masuk', '+ ' + rp(r.total_masuk), '', '#10b981')}
            ${stat('rk-c2', 'Total keluar', '− ' + rp(r.total_keluar), '', '#f43f5e')}
            ${r.saldo_akhir !== null ? stat('rk-c3', 'Saldo akhir', rp(r.saldo_akhir), `selisih ${selisih >= 0 ? '+' : '−'} ${rp(Math.abs(selisih))}`) : stat('rk-c3', 'Selisih', (selisih >= 0 ? '+ ' : '− ') + rp(Math.abs(selisih)), 'masuk − keluar')}</div>`;
        const filter = `<div class="card bar-satu no-print">
            <div class="bs-filter bs-multi">
                <label class="f" for="kDr">Dari</label><input type="date" id="kDr" value="${esc(KS.dari)}" data-change="kasFilter">
                <label class="f" for="kSm">Sampai</label><input type="date" id="kSm" value="${esc(KS.sampai)}" max="${App.today()}" data-change="kasFilter">
                <label class="f" for="kSb">Sumber</label><select id="kSb" data-change="kasFilter">${sumberSel}</select>
            </div>
            <div class="bs-pager">${pg.bar}</div></div>`;
        const baris = pg.items.map((b) => `<tr>
            <td style="white-space:nowrap" data-l="Tanggal">${tgl(b.tanggal)}</td>
            <td data-l="Sumber"><span class="badge ${SUMBER[b.sumber][1]}">${SUMBER[b.sumber][0]}</span></td>
            <td style="white-space:normal;min-width:180px" data-l="Uraian">${esc(b.uraian)}</td>
            <td class="r num" data-l="Masuk">${b.masuk ? `<span style="color:#10b981;font-weight:600">+ ${rp(b.masuk)}</span>` : '<span class="muted">-</span>'}</td>
            <td class="r num" data-l="Keluar">${b.keluar ? `<span style="color:#f43f5e;font-weight:600">− ${rp(b.keluar)}</span>` : '<span class="muted">-</span>'}</td>
            <td class="r num" data-l="Saldo">${b.saldo !== undefined && r.saldo_awal !== null ? `<b>${rp(b.saldo)}</b>` : '<span class="muted">-</span>'}</td></tr>`).join('');
        return `${ringkas}${filter}
            <div class="card tbl-card"><div class="tbl-wrap"><table class="tbl-peng"><thead><tr><th>Tanggal</th><th>Sumber</th><th>Uraian</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th></tr></thead><tbody>
            ${r.saldo_awal !== null ? `<tr class="kas-awal"><td colspan="5" class="muted">Saldo awal (sebelum ${tgl(r.dari)})</td><td class="r num"><b>${rp(r.saldo_awal)}</b></td></tr>` : ''}
            ${baris || '<tr><td colspan="6" class="muted">Tidak ada transaksi pada rentang ini.</td></tr>'}
            </tbody><tfoot><tr><td colspan="3"><b>Jumlah rentang ini</b></td><td class="r num"><b>${rp(r.total_masuk)}</b></td><td class="r num"><b>${rp(r.total_keluar)}</b></td><td class="r num"><b>${r.saldo_akhir !== null ? rp(r.saldo_akhir) : ''}</b></td></tr></tfoot></table></div></div>
            <p class="small muted" style="margin-top:8px">Jimpitan dan iuran wajib diringkas per tanggal. Saldo berjalan dihitung dari saldo awal rentang.</p>`;
    }

    /* ---------- Per Periode Kumpulan ---------- */
    function vPeriode(r) {
        const ps = r.per_periode;           // terbaru di indeks 0
        const b = ps.find((p) => p.berjalan) || ps[0];
        const kartu = b ? `<div class="rk-baris" style="margin-bottom:14px">
            ${stat('rk-c0', `Saldo awal kumpulan ke-${b.no}`, rp(b.saldo_awal), 'saldo akhir kumpulan sebelumnya')}
            ${stat('rk-c1', 'Pemasukan', '+ ' + rp(b.masuk), `jimpitan ${rp(b.jimpitan)} · iuran ${rp(b.iuran)} · lainnya ${rp(b.sewa)}`, '#10b981')}
            ${stat('rk-c2', 'Pengeluaran', '− ' + rp(b.keluar), '', '#f43f5e')}
            ${stat('rk-c3', 'Saldo akhir', rp(b.saldo_akhir), `selisih ${b.selisih >= 0 ? '+' : '−'} ${rp(Math.abs(b.selisih))}`)}</div>` : '';
        const baris = ps.map((p) => `<tr>
            <td data-l="Kumpulan"><span class="kn">K${p.no}</span> <b>${tgl(p.tanggal)}</b><div class="small muted">${esc(p.weton)}${p.berjalan ? ' <span class="badge blue">berjalan</span>' : ''}</div></td>
            <td class="r num" data-l="Saldo periode sebelumnya">${rp(p.saldo_awal)}</td>
            <td class="r num in" data-l="Jimpitan">${rp(p.jimpitan)}</td><td class="r num in" data-l="Iuran wajib">${rp(p.iuran)}</td><td class="r num in" data-l="Lainnya">${rp(p.sewa)}</td>
            <td class="r num in" data-l="Total masuk"><b>${rp(p.masuk)}</b></td>
            <td class="r num out" data-l="Pengeluaran">${rp(p.keluar)}</td>
            <td class="r num sa" data-l="Saldo akhir"><b>${rp(p.saldo_akhir)}</b></td></tr>`).join('');
        return `${kartu}<section class="card bk-periode bk-modern">
            <div class="tbl-wrap"><table class="tbl-kas"><thead><tr><th>Kumpulan</th><th class="r">Saldo periode sebelumnya</th><th class="r">Jimpitan</th><th class="r">Iuran wajib</th><th class="r">Lainnya</th><th class="r">Total masuk</th><th class="r">Pengeluaran</th><th class="r">Saldo akhir</th></tr></thead>
            <tbody>${baris || '<tr><td colspan="8" class="muted">Belum ada kumpulan.</td></tr>'}</tbody></table></div>
            <p class="small muted" style="margin-top:10px">Saldo periode sebelumnya + pemasukan − pengeluaran = saldo akhir. Dihitung sampai tanggal kumpulan (cut off), sama dengan halaman Laporan; kumpulan berjalan dihitung sampai hari ini. 12 kumpulan terakhir.</p></section>`;
    }

    /* ---------- Tutup buku per 31 Desember ---------- */
    // Daftar saldo per kantong dengan batang proporsi
    const KANTONG = [['jimpitan', 'Jimpitan', '#3b82f6'], ['iuran', 'Iuran wajib', '#10b981'], ['sewa', 'Pemasukan lainnya', '#f59e0b'], ['umum', 'Pengeluaran umum', '#f43f5e']];
    function daftarKantong(n) {
        const maks = Math.max(1, ...KANTONG.map(([k]) => Math.abs(n[k] || 0)));
        return `<ul class="tb-kantong">${KANTONG.filter(([k]) => k !== 'umum' || n.umum).map(([k, l, w]) => `<li><div><span><i style="background:${w}"></i>${l}</span><b>${rp(n[k] || 0)}</b></div><u><em style="width:${Math.max(2, Math.round((Math.abs(n[k] || 0) / maks) * 100))}%;background:${w}"></em></u></li>`).join('')}
            <li class="tot"><div><span>Total saldo</span><b>${rp(n.saldo)}</b></div></li></ul>`;
    }
    async function tutupBuku() {
        const [st, sa] = await Promise.all([App.api('/api/tutup-buku'), App.api('/api/saldo-awal')]);
        const tulis = App.has('tutupbuku.tulis');
        const buka = App.has('tutupbuku.buka');
        const terakhir = st.tahun_ditutup.length ? st.tahun_ditutup[st.tahun_ditutup.length - 1] : null;
        const dasar = sa.saldo_awal.find((x) => x.tahun === (terakhir !== null ? terakhir + 1 : st.tahun_awal)) || sa.saldo_awal[0];
        const nDasar = dasar ? { jimpitan: dasar.nominal.jimpitan || 0, iuran: dasar.nominal.iuran_wajib || 0, sewa: dasar.nominal.sewa_aset || 0, umum: dasar.nominal.umum || 0 } : null;
        if (nDasar) nDasar.saldo = nDasar.jimpitan + nDasar.iuran + nDasar.sewa + nDasar.umum;

        // Banner status tahun yang berikutnya ditutup
        const banner = st.tahun_berikut === null
            ? `<div class="rw-status bad"><span class="rw-ic">!</span><div><small>Status</small><b>Saldo awal belum diisi</b><em>${esc(st.alasan || '')}</em></div></div>`
            : st.boleh
                ? `<div class="rw-status good"><span class="rw-ic">✓</span><div><small>Siap ditutup</small><b>Buku ${st.tahun_berikut}</b><em>Tahun ${st.tahun_berikut} sudah berakhir dan dapat ditutup sekarang.</em></div></div>`
                : `<div class="rw-status warn"><span class="rw-ic">⏳</span><div><small>Belum waktunya</small><b>Buku ${st.tahun_berikut} berjalan</b><em>${esc(st.alasan || '')}</em></div></div>`;

        // Langkah-langkah (stepper)
        const langkah = [
            ['Saldo awal', nDasar ? `${dasar.tahun} · ${dasar.asal === 'tutup_buku' ? 'tutup buku' : 'diisi admin'}` : 'belum diisi', nDasar ? 'ok' : 'now'],
            ['Tahun berjalan', st.tahun_berikut !== null ? `Buku ${st.tahun_berikut}` : '-', st.boleh ? 'ok' : 'now'],
            ['Tutup buku 31 Des', st.boleh ? 'siap dilakukan' : 'menunggu', st.boleh ? 'now' : ''],
            ['Saldo awal berikut', st.tahun_berikut !== null ? `otomatis ${st.tahun_berikut + 1}` : '-', '']
        ];
        const stepper = `<ol class="tb-steps">${langkah.map(([j, s, c], i) => `<li class="${c}"><span>${i + 1}</span><b>${j}</b><small>${esc(s)}</small></li>`).join('')}</ol>`;

        const preview = st.boleh ? st.preview : st.sementara;
        const kartuPreview = st.tahun_berikut === null || !preview ? '' : `<div class="card tb-card">
            <h3>${st.boleh ? `Saldo per 31 Desember ${st.tahun_berikut}` : 'Saldo sementara hingga hari ini'}</h3>
            <p class="small muted" style="margin:0 0 10px">${st.boleh ? `Akan menjadi saldo awal ${st.tahun_berikut + 1}.` : `Akan menjadi saldo awal ${st.tahun_berikut + 1} bila tidak ada perubahan.`}</p>
            ${daftarKantong(preview)}
            ${st.boleh ? (tulis ? `<form data-form="tutupBuku" data-tahun="${st.tahun_berikut}" style="margin-top:14px"><label class="f" for="tbCat">Catatan (opsional)</label><input id="tbCat" name="catatan" maxlength="255" placeholder="mis. disetujui pada rapat RW">
                <div class="dlg-actions" style="margin-top:10px"><button class="btn primary btn-3d" type="submit">Tutup buku ${st.tahun_berikut}</button></div></form>` : '<p class="small muted" style="margin-top:10px">Tutup buku dilakukan oleh Bendahara RW.</p>') : ''}</div>`;
        const kartuDasar = `<div class="card tb-card">
            <h3>Dasar saldo kas${dasar ? ` · awal ${dasar.tahun}` : ''}</h3>
            ${nDasar ? `<p class="small muted" style="margin:0 0 10px">Per 31 Des ${dasar.tahun - 1} (${dasar.asal === 'tutup_buku' ? 'hasil tutup buku' : 'diisi admin di Pengaturan → Saldo Awal Kas'}). Transaksi sebelum 1 Januari ${dasar.tahun} tidak dihitung.</p>${daftarKantong(nDasar)}`
                : '<p class="small">Saldo awal kas belum diisi (Pengaturan → Saldo Awal Kas).</p>'}</div>`;

        const ditutup = `<div class="card tb-card"><h3>Tahun yang sudah ditutup</h3>
            ${st.tahun_ditutup.length ? `<div class="tb-chips">${st.tahun_ditutup.map((t) => `<span class="tb-chip">🔒 ${t}${t === terakhir && buka ? ` <button type="button" class="tb-buka" data-act="kasBukaBuku" data-tahun="${t}" title="Buka kembali tahun ${t}">Buka kembali</button>` : ''}</span>`).join('')}</div>
                <p class="small muted" style="margin-top:8px">Transaksi pada tahun yang ditutup terkunci (tidak bisa dicatat atau dibatalkan). Hanya admin yang dapat membuka kembali tahun terakhir untuk koreksi.</p>`
                : '<p class="small muted">Belum ada tahun yang ditutup.</p>'}</div>`;

        $('#tbBody').innerHTML = `
            ${banner}${stepper}
            <div class="tb-grid">${kartuDasar}${kartuPreview}</div>
            ${ditutup}
            <div class="card tbl-card"><div class="tbl-wrap"><table><caption class="tb-cap">Riwayat saldo awal</caption>
                <thead><tr><th>Tahun</th><th>Asal</th><th class="r">Jimpitan</th><th class="r">Iuran wajib</th><th class="r">Pemasukan lainnya</th><th class="r">Umum</th></tr></thead>
                <tbody>${sa.saldo_awal.map((x) => `<tr><td data-l="Tahun"><b>${x.tahun}</b> <span class="small muted">(per 31 Des ${x.tahun - 1})</span></td><td data-l="Asal">${x.asal === 'tutup_buku' ? '<span class="badge green">Tutup buku</span>' : '<span class="badge blue">Diisi admin</span>'}</td>
                    <td class="r num" data-l="Jimpitan">${rp(x.nominal.jimpitan)}</td><td class="r num" data-l="Iuran wajib">${rp(x.nominal.iuran_wajib)}</td><td class="r num" data-l="Lainnya">${rp(x.nominal.sewa_aset)}</td><td class="r num" data-l="Umum">${rp(x.nominal.umum)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada saldo awal.</td></tr>'}</tbody></table></div></div>`;
    }
    App.forms.tutupBuku = async (f) => {
        if (!window.confirm(`Tutup buku ${f.dataset.tahun}? Transaksi s.d. 31 Desember ${f.dataset.tahun} akan terkunci.`)) return;
        await App.api('/api/tutup-buku', { method: 'POST', body: { tahun: Number(f.dataset.tahun), catatan: f.catatan.value } });
        App.toast(`Buku ${f.dataset.tahun} ditutup. Saldo awal ${Number(f.dataset.tahun) + 1} dibuat otomatis.`);
        await muat();
    };
    App.actions.kasBukaBuku = async (el) => {
        const t = el.dataset.tahun;
        if (!window.confirm(`Buka kembali buku ${t}? Saldo awal ${Number(t) + 1} hasil tutup buku akan dihapus dan transaksi ${t} bisa diubah lagi.`)) return;
        await App.api('/api/tutup-buku?tahun=' + encodeURIComponent(t), { method: 'DELETE' });
        App.toast(`Buku ${t} dibuka kembali.`);
        await muat();
    };

    App.changes.kasFilter = async () => {
        KS.dari = $('#kDr').value; KS.sampai = $('#kSm').value; KS.sumber = $('#kSb').value;
        await muat();
    };
})();
