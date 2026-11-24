/* Halaman Buku Kas tunggal RW: gabungan jimpitan + iuran wajib + pemasukan lainnya − pengeluaran. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;
    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const KS = (App.stKas = { sub: 'buku', dari: '', sampai: '', sumber: '', data: null });
    const SUMBER = { jimpitan: ['Jimpitan', 'blue'], iuran_wajib: ['Iuran Wajib', 'green'], sewa_aset: ['Pemasukan Lainnya', 'amber'], pengeluaran: ['Pengeluaran', 'red'] };

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
        const kantong = (l, v, mid) => `<div class="stat ${v >= 0 ? '' : 'bad'}"><small>${l}</small><b>${rp(v)}</b></div>`;
        const tiles = `<div class="grid cols-4" style="margin-bottom:14px">
            <div class="stat ${k.saldo >= 0 ? 'good' : 'bad'}"><small>Saldo kas RW (total)</small><b>${rp(k.saldo)}</b></div>
            ${kantong('Saldo jimpitan', k.jimpitan)}${kantong('Saldo kas Bendahara RW (iuran wajib + pemasukan lainnya)', k.iuran + k.sewa)}
            ${k.umum ? kantong('Pengeluaran umum (tanpa label)', k.umum) : ''}</div>`;
        if (KS.sub === 'tutup') { $('#kasBody').innerHTML = tiles + '<div id="tbBody">' + App.loading() + '</div>'; tutupBuku(); return; }
        $('#kasBody').innerHTML = tiles + (KS.sub === 'buku' ? vBuku(r) : vPeriode(r));
    }

    function vBuku(r) {
        const pg = App.paginate('kas', r.baris);
        const sumberSel = `<option value="">Semua sumber</option>` + Object.entries(SUMBER).map(([v, [l]]) => `<option value="${v}" ${KS.sumber === v ? 'selected' : ''}>${l}</option>`).join('');
        return `<div class="card no-print"><div class="filters">
                <div><label class="f" for="kDr">Dari</label><input type="date" id="kDr" value="${esc(KS.dari)}" data-change="kasFilter"></div>
                <div><label class="f" for="kSm">Sampai</label><input type="date" id="kSm" value="${esc(KS.sampai)}" max="${App.today()}" data-change="kasFilter"></div>
                <div><label class="f" for="kSb">Sumber</label><select id="kSb" data-change="kasFilter">${sumberSel}</select></div>
            </div><p class="small muted">Jimpitan dan iuran wajib diringkas per tanggal. Jimpitan dicatat Bendahara Jimpitan, iuran wajib oleh Pengurus RT, pemasukan lainnya oleh Bendahara RW. Pengeluaran dicatat Bendahara Jimpitan (dana jimpitan) dan Bendahara RW (dana iuran wajib).</p></div>
            <div class="card">${pg.bar}<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Sumber</th><th>Uraian</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th></tr></thead><tbody>
            ${r.saldo_awal !== null ? `<tr><td colspan="5" class="muted">Saldo awal (sebelum ${tgl(r.dari)})</td><td class="r num"><b>${rp(r.saldo_awal)}</b></td></tr>` : ''}
            ${pg.items.map((b) => `<tr><td>${tgl(b.tanggal)}</td><td><span class="badge ${SUMBER[b.sumber][1]}">${SUMBER[b.sumber][0]}</span></td><td style="white-space:normal;min-width:180px">${esc(b.uraian)}</td>
                <td class="r num">${b.masuk ? rp(b.masuk) : '-'}</td><td class="r num">${b.keluar ? rp(b.keluar) : '-'}</td><td class="r num">${b.saldo !== undefined && r.saldo_awal !== null ? rp(b.saldo) : '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada transaksi pada rentang ini.</td></tr>'}
            <tr><td colspan="3"><b>Jumlah rentang ini</b></td><td class="r num"><b>${rp(r.total_masuk)}</b></td><td class="r num"><b>${rp(r.total_keluar)}</b></td><td class="r num"><b>${r.saldo_akhir !== null ? rp(r.saldo_akhir) : ''}</b></td></tr>
            </tbody></table></div></div>`;
    }

    function vPeriode(r) {
        return `<div class="card"><h3>Ringkasan per kumpulan RW (Rabu Legi, 12 terakhir)</h3>
            <p class="small muted" style="margin-bottom:10px">Laporan kas yang dibacakan pada kumpulan RW. Periode berjalan dihitung sampai hari ini.</p>
            <div class="tbl-wrap"><table><thead><tr><th>Kumpulan</th><th class="r">Jimpitan</th><th class="r">Iuran wajib</th><th class="r">Pemasukan lainnya</th><th class="r">Total masuk</th><th class="r">Pengeluaran</th><th class="r">Selisih</th><th class="r">Saldo akhir</th></tr></thead><tbody>
            ${r.per_periode.slice().reverse().map((p) => `<tr><td>${esc(p.weton)}, ${tgl(p.mulai)}${p.berjalan ? ' <span class="badge blue">berjalan</span>' : ''}</td>
                <td class="r num">${rp(p.jimpitan)}</td><td class="r num">${rp(p.iuran)}</td><td class="r num">${rp(p.sewa)}</td><td class="r num"><b>${rp(p.masuk)}</b></td>
                <td class="r num">${rp(p.keluar)}</td><td class="r num" style="color:var(--${p.selisih >= 0 ? 'green' : 'red'})">${rp(p.selisih)}</td><td class="r num"><b>${rp(p.saldo_akhir)}</b></td></tr>`).join('')}
            </tbody></table></div></div>`;
    }

    /* ---------- Tutup buku per 31 Desember ---------- */
    async function tutupBuku() {
        const [st, sa] = await Promise.all([App.api('/api/tutup-buku'), App.api('/api/saldo-awal')]);
        const tulis = App.has('tutupbuku.tulis');
        const baris = (n) => `<tr><td>Jimpitan</td><td class="r num">${rp(n.jimpitan)}</td></tr><tr><td>Iuran wajib</td><td class="r num">${rp(n.iuran)}</td></tr><tr><td>Pemasukan lainnya</td><td class="r num">${rp(n.sewa)}</td></tr>${n.umum ? `<tr><td>Pengeluaran umum</td><td class="r num">${rp(n.umum)}</td></tr>` : ''}<tr><td><b>Total</b></td><td class="r num"><b>${rp(n.saldo)}</b></td></tr>`;
        $('#tbBody').innerHTML = `
            <div class="card"><h3>Dasar saldo kas</h3>
                ${(() => {
                    const dasar = sa.saldo_awal.find((x) => x.tahun === (st.tahun_ditutup.length ? st.tahun_ditutup[st.tahun_ditutup.length - 1] + 1 : st.tahun_awal)) || sa.saldo_awal[0];
                    return dasar ? `<p>Saldo kas dihitung dari <b>saldo awal ${dasar.tahun}</b> (per 31 Des ${dasar.tahun - 1}, ${dasar.asal === 'tutup_buku' ? 'hasil tutup buku' : 'diisi admin di Pengaturan → Saldo Awal Kas'}), lalu ditambah pemasukan dan dikurangi pengeluaran sejak 1 Januari ${dasar.tahun}. Transaksi sebelum tanggal itu tidak dihitung.</p>
                        <div class="tbl-wrap"><table><tbody>${baris({ jimpitan: dasar.nominal.jimpitan || 0, iuran: dasar.nominal.iuran_wajib || 0, sewa: dasar.nominal.sewa_aset || 0, umum: dasar.nominal.umum || 0, saldo: (dasar.nominal.jimpitan || 0) + (dasar.nominal.iuran_wajib || 0) + (dasar.nominal.sewa_aset || 0) + (dasar.nominal.umum || 0) })}</tbody></table></div>`
                        : '<p class="small">Saldo awal kas belum diisi (Pengaturan → Saldo Awal Kas).</p>';
                })()}
            </div>
            <div class="card"><h3>Status tutup buku</h3>
                <p class="small muted" style="margin-bottom:10px">Tutup buku dilakukan <b>per 31 Desember</b>. Saldo akhir tiap sumber otomatis menjadi <b>saldo awal tahun berikutnya</b>, dan transaksi tahun yang ditutup <b>terkunci</b> (tidak bisa dicatat atau dibatalkan). Admin dapat membuka kembali tahun terakhir bila ada koreksi.</p>
                <p>Tahun yang sudah ditutup: <b>${st.tahun_ditutup.length ? st.tahun_ditutup.join(', ') : 'belum ada'}</b></p>
                ${st.boleh ? `<div class="card" style="margin-top:12px"><h3>Tutup buku ${st.tahun_berikut}</h3>
                    <p class="small muted">Saldo per 31 Desember ${st.tahun_berikut} (akan menjadi saldo awal ${st.tahun_berikut + 1}):</p>
                    <div class="tbl-wrap"><table><tbody>${baris(st.preview)}</tbody></table></div>
                    ${tulis ? `<form data-form="tutupBuku" data-tahun="${st.tahun_berikut}" style="margin-top:12px"><label class="f" for="tbCat">Catatan (opsional)</label><input id="tbCat" name="catatan" maxlength="255">
                        <div class="dlg-actions"><button class="btn primary" type="submit">Tutup buku ${st.tahun_berikut}</button></div></form>` : '<p class="small muted" style="margin-top:8px">Tutup buku dilakukan oleh Bendahara RW.</p>'}</div>`
                    : `<p class="small" style="margin-top:8px">${esc(st.alasan || '')}</p>
                    ${st.sementara ? `<p class="small muted">Saldo sementara hingga hari ini (akan menjadi saldo awal ${st.tahun_berikut + 1} bila tidak ada perubahan):</p><div class="tbl-wrap"><table><tbody>${baris(st.sementara)}</tbody></table></div>` : ''}`}
            </div>
            <div class="card"><h3>Riwayat saldo awal</h3><div class="tbl-wrap"><table>
                <thead><tr><th>Tahun</th><th>Asal</th><th class="r">Jimpitan</th><th class="r">Iuran wajib</th><th class="r">Pemasukan lainnya</th><th class="r">Umum</th></tr></thead>
                <tbody>${sa.saldo_awal.map((x) => `<tr><td>${x.tahun} <span class="small muted">(per 31 Des ${x.tahun - 1})</span></td><td>${x.asal === 'tutup_buku' ? '<span class="badge green">Tutup buku</span>' : '<span class="badge blue">Diisi admin</span>'}</td>
                    <td class="r num">${rp(x.nominal.jimpitan)}</td><td class="r num">${rp(x.nominal.iuran_wajib)}</td><td class="r num">${rp(x.nominal.sewa_aset)}</td><td class="r num">${rp(x.nominal.umum)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada saldo awal.</td></tr>'}</tbody></table></div></div>`;
    }
    App.forms.tutupBuku = async (f) => {
        if (!window.confirm(`Tutup buku ${f.dataset.tahun}? Transaksi s.d. 31 Desember ${f.dataset.tahun} akan terkunci.`)) return;
        await App.api('/api/tutup-buku', { method: 'POST', body: { tahun: Number(f.dataset.tahun), catatan: f.catatan.value } });
        App.toast(`Buku ${f.dataset.tahun} ditutup. Saldo awal ${Number(f.dataset.tahun) + 1} dibuat otomatis.`);
        await muat();
    };

    App.changes.kasFilter = async () => {
        KS.dari = $('#kDr').value; KS.sampai = $('#kSm').value; KS.sumber = $('#kSb').value;
        await muat();
    };
})();
