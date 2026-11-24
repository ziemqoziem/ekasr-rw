/* Beranda publik: KPI, grafik ringkas, dan pengecekan tunggakan berdasarkan nama. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, $ } = App;
    const K = App.charts;
    const { C, rp, compact } = K;
    const D = App.dash;

    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const RT_WARNA = { '007': C.s[0], '008': C.s[1], '009': C.s[2] };

    App.views.beranda = async (root) => {
        const d = await App.api('/api/publik');
        const reg = {};
        const k = d.kas;
        const tgl = (t) => App.tglId(t);
        const bl = `${BULAN[Number(d.bulan.slice(5, 7)) - 1]} ${d.bulan.slice(0, 4)}`;

        /* ---- 1) Saldo Kas RW: kartu saldo utama + kantong ---- */
        const kantong = k.kantong.filter((x) => x.kode !== 'umum' || x.saldo !== 0);
        const positif = kantong.filter((x) => x.saldo > 0).reduce((a, x) => a + x.saldo, 0);
        const WARNA_KANTONG = { jimpitan: 'bk-biru', bendahara_rw: 'bk-ungu', umum: 'bk-merah' };
        const kartuKantong = kantong.map((x) => {
            const bagian = positif > 0 && x.saldo > 0 ? Math.round((x.saldo / positif) * 100) : 0;
            const ket = x.kode === 'umum' ? 'Pengeluaran yang tidak dikaitkan ke satu sumber dana'
                : `Masuk ${compact(x.awal + x.masuk)} · keluar ${compact(x.keluar)}`;
            return `<div class="bk-kantong ${WARNA_KANTONG[x.kode] || ''}">
                <div class="bk-k-head"><span>${esc(x.nama)}</span>${x.kode === 'umum' ? '' : `<em>${bagian}%</em>`}</div>
                <div class="bk-k-val">${rp(x.saldo)}</div>
                ${x.kode === 'umum' ? '' : `<div class="bk-bar"><i style="width:${bagian}%"></i></div>`}
                <div class="bk-k-sub">${ket}</div></div>`;
        }).join('');
        const saldoKas = `<div class="bk">
            <div class="bk-utama ${k.saldo < 0 ? 'neg' : ''}">
                <div class="bk-label">Saldo kas RW · seluruh sumber</div>
                <div class="bk-saldo">${rp(k.saldo)}</div>
                <div class="bk-stats">
                    <div><small>Total masuk</small><b>${rp(k.masuk)}</b></div>
                    <div><small>Total keluar</small><b>${rp(k.keluar)}</b></div>
                    <div><small>Masuk ${esc(bl)}</small><b>${rp(k.bulan_ini.masuk)}</b></div>
                    <div><small>Keluar ${esc(bl)}</small><b>${rp(k.bulan_ini.keluar)}</b></div>
                </div>
                ${k.tahun_basis ? `<div class="bk-foot">Termasuk saldo awal tahun ${esc(k.tahun_basis)}</div>` : ''}
            </div>
            <div class="bk-samping">${kartuKantong}</div></div>`;

        /* ---- 2) Kas per kumpulan RW (cut off): saldo awal + pemasukan − pengeluaran = saldo akhir ---- */
        const periodeRows = k.per_periode.slice().reverse().map((p) => `
            <tr><td data-l="Kumpulan"><b>Kumpulan ke-${p.no}</b><div class="small muted">${tgl(p.tanggal)}${p.berjalan ? ' <span class="badge blue">berjalan</span>' : ''}</div></td>
            <td class="r num" data-l="Saldo awal">${rp(p.saldo_awal)}</td>
            <td class="r num in" data-l="Jimpitan">${rp(p.jimpitan)}</td><td class="r num in" data-l="Iuran">${rp(p.iuran)}</td><td class="r num in" data-l="Lainnya">${rp(p.sewa)}</td>
            <td class="r num out" data-l="Keluar">${rp(p.keluar)}</td><td class="r num sa" data-l="Saldo akhir"><b>${rp(p.saldo_akhir)}</b></td></tr>`).join('');
        const tabelPeriode = `<section class="card bk-periode">
            <div class="tbl-wrap"><table class="tbl-kas"><thead><tr><th>Kumpulan</th><th class="r">Saldo awal</th><th class="r">Jimpitan</th><th class="r">Iuran</th><th class="r">Lainnya</th><th class="r">Keluar</th><th class="r">Saldo akhir</th></tr></thead>
            <tbody>${periodeRows || '<tr><td colspan="7" class="muted">Belum ada kumpulan.</td></tr>'}</tbody></table></div>
            <p class="small muted" style="margin-top:10px">Saldo awal + jimpitan + iuran + lainnya − keluar = saldo akhir. Dihitung sampai tanggal kumpulan (cut off); kumpulan berjalan dihitung sampai hari ini.</p></section>`;

        /* ---- 3) Pemasukan & pengeluaran 12 bulan ---- */
        const masuk12 = k.tren.reduce((a, t) => a + t.jimpitan + t.iuran + t.sewa, 0);
        const keluar12 = k.tren.reduce((a, t) => a + t.keluar, 0);
        reg.trenkas = (w) => K.columns({
            labels: k.tren.map((t) => K.bulanPendek(t.bulan)),
            series: [
                { name: 'Jimpitan', color: C.s[0], values: k.tren.map((t) => t.jimpitan) },
                { name: 'Iuran wajib', color: C.s[2], values: k.tren.map((t) => t.iuran) },
                { name: 'Pemasukan lainnya', color: C.s[3], values: k.tren.map((t) => t.sewa) },
                { name: 'Pengeluaran', color: C.s[7], values: k.tren.map((t) => t.keluar) }
            ],
            tipTitle: (i) => D.labelBulan(k.tren[i].bulan), height: 260, aria: 'Pemasukan per sumber dan pengeluaran 12 bulan terakhir'
        }, w);
        const grafik12 = `<div class="bk-ring"><span class="in">Pemasukan 12 bulan <b>${rp(masuk12)}</b></span><span class="out">Pengeluaran 12 bulan <b>${rp(keluar12)}</b></span></div>
            ${D.chartCard('trenkas', 'Pemasukan & pengeluaran 12 bulan', 'Jimpitan, iuran wajib, pemasukan lainnya, dan pengeluaran per bulan', D.tbl([{ h: 'Bulan' }, { h: 'Jimpitan', r: 1 }, { h: 'Iuran', r: 1 }, { h: 'Lainnya', r: 1 }, { h: 'Keluar', r: 1 }], k.tren.map((t) => [D.labelBulan(t.bulan), rp(t.jimpitan), rp(t.iuran), rp(t.sewa), rp(t.keluar)])))}`;

        root.innerHTML = `
            <section class="home-hero">
                <div class="home-hero-text">
                    <div class="eyebrow-h">E-Kas · Transparansi Kas RW</div>
                    <h2>Kas RW 03 terbuka dan mudah dipantau.</h2>
                    <p>Lihat saldo kas, jimpitan, iuran wajib, dan pemasukan lainnya secara real-time. Cek status iuran Anda cukup dengan mengetik nama.</p>
                </div>
                <div class="home-clock">
                    <div class="time" id="clkTime">00<i>:</i>00<i>:</i>00 <small>WIB</small></div>
                    <div class="date" id="clkDate">Memuat tanggal…</div>
                </div>
            </section>

            ${d.cek_tunggakan_aktif ? `
            <section class="card cek-card">
                <div class="row between" style="margin-bottom:8px">
                    <div>
                        <h3>Cek Status Iuran Warga</h3>
                        <p class="small muted">Ketik nama untuk melihat status <b>iuran jimpitan</b> dan <b>iuran wajib (kas RW)</b> Anda: tunggakan, saldo titipan, dan riwayat.</p>
                    </div>
                </div>
                <form data-form="cekTunggakan" class="cek-form" autocomplete="off">
                    <div class="grow">
                        <label class="f" for="cekNama">Nama warga</label>
                        <input id="cekNama" name="q" required minlength="3" maxlength="40" placeholder="Ketik minimal 3 huruf, misal: Budi">
                    </div>
                    <div>
                        <label class="f" for="cekRt">RT</label>
                        <select id="cekRt" name="rt">
                            <option value="">Semua RT</option>
                            <option value="007">RT 007</option>
                            <option value="008">RT 008</option>
                            <option value="009">RT 009</option>
                        </select>
                    </div>
                    <button class="btn primary" type="submit">${App.icon('search')} Cek Status</button>
                    <button class="btn ghost" type="button" data-act="cekReset" title="Kosongkan pencarian dan hasil">Reset</button>
                </form>
                <div id="cekOut" aria-live="polite"></div>
            </section>` : ''}

            <h3 class="sec-title">Saldo Kas RW</h3>
            ${saldoKas}

            <h3 class="sec-title">Kas per periode kumpulan RW</h3>
            ${tabelPeriode}

            <h3 class="sec-title">Pemasukan &amp; pengeluaran 12 bulan</h3>
            ${grafik12}

            <p class="small muted note">Tampilan publik hanya memuat angka ringkasan. ${d.cek_tunggakan_aktif ? 'Pengecekan status menampilkan data warga yang dicari saja.' : ''}
            ${App.user ? '' : 'Pengurus dan bendahara silakan <a href="#" data-act="loginDialog">masuk</a> untuk mengelola data.'}</p>`;

        K.mountAll(root, reg);

        // Jam digital WIB
        const tick = () => {
            const n = new Date(Date.now() + 7 * 3600 * 1000);
            const p = (x) => String(x).padStart(2, '0');
            const t = $('#clkTime');
            if (!t) return;
            t.innerHTML = `${p(n.getUTCHours())}<i>:</i>${p(n.getUTCMinutes())}<i>:</i>${p(n.getUTCSeconds())} <small>WIB</small>`;
            $('#clkDate').textContent = `${HARI[n.getUTCDay()]}, ${n.getUTCDate()} ${BULAN[n.getUTCMonth()]} ${n.getUTCFullYear()}`;
        };
        tick();
        App.timers.push(setInterval(tick, 1000));
    };

    /* ---------- cek status iuran (jimpitan + iuran wajib) ---------- */
    const tglP = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : '-');
    function panel(judul, ikon, badge, total, isi, kelas) {
        return `<div class="cek-panel ${kelas || ''}"><div class="row between"><b>${ikon} ${esc(judul)}</b>${badge}</div>${total}${isi}</div>`;
    }
    function panelJimpitan(h) {
        if (h.jimpitan_wajib === false) {
            return panel('Iuran Jimpitan', '', '<span class="badge">Tidak wajib</span>', '', '<p class="small muted">Warga ini tidak wajib iuran jimpitan.</p>');
        }
        if (h.status === 'menunggak') {
            return panel('Iuran Jimpitan', '', '<span class="badge red">▲ Ada tunggakan</span>', `<div class="cek-total bad">${rp(h.kurang)}</div>`,
                `<ul class="cek-detail">
                ${h.berjalan_kurang ? `<li><span>Kewajiban harian belum tertutup (≈ ${h.hari_kurang} hari)</span><b class="num">${rp(h.berjalan_kurang)}</b></li>` : ''}
                ${h.lama_sisa ? `<li><span>Tunggakan lama</span><b class="num">${rp(h.lama_sisa)}</b></li>` : ''}</ul>
                <p class="small muted">Setoran terakhir: ${h.terakhir_bayar ? tglP(h.terakhir_bayar) : 'belum ada'}</p>`, 'warn');
        }
        if (h.status === 'titipan') {
            return panel('Iuran Jimpitan', '', '<span class="badge green">✔ Ada saldo lebih</span>', `<div class="cek-total good">+${rp(h.lebih)}</div>`,
                `<p class="small muted">Menutup ±${h.hari_tertutup} hari ke depan (lunas sampai ${tglP(h.lunas_sampai)}).</p><p class="small muted">Setoran terakhir: ${h.terakhir_bayar ? tglP(h.terakhir_bayar) : 'belum ada'}</p>`, 'ok');
        }
        return panel('Iuran Jimpitan', '', '<span class="badge green">✔ Lunas</span>', '<div class="cek-total good">Rp 0</div>',
            `<p class="small muted">Tidak ada tunggakan jimpitan.</p><p class="small muted">Setoran terakhir: ${h.terakhir_bayar ? tglP(h.terakhir_bayar) : 'belum ada'}</p>`, 'ok');
    }
    function panelIuran(h) {
        const i = h.iuran;
        const judul = 'Iuran Wajib (Kas RW)';
        if (!i) return panel(judul, '', '<span class="badge">Belum ditagih</span>', '', '<p class="small muted">Iuran wajib per kumpulan RW belum diaktifkan oleh pengurus.</p>');
        if (i.bebas) return panel(judul, '', '<span class="badge">Tidak wajib</span>', '', '<p class="small muted">Warga ini tidak wajib iuran kas.</p>');
        const kotak = (i.riwayat || []).map((x) => {
            const cls = x.status === 'lunas' ? 'cal-hijau' : x.status === 'sebagian' ? 'cal-berjalan' : (x.selesai ? 'cal-merah' : 'cal-berjalan');
            return `<i class="cal-dot ${cls}" title="Kumpulan ${tglP(x.mulai)}: ${x.status === 'lunas' ? 'lunas' : x.status === 'sebagian' ? 'sebagian' : 'belum bayar'}"></i>`;
        }).join('');
        const hist = kotak ? `<p class="small muted" style="margin-top:6px">Riwayat kumpulan (lama → baru): <span class="mini-hist">${kotak}</span></p>` : '';
        const akhir = `<p class="small muted">Pembayaran terakhir: ${i.terakhir_bayar ? tglP(i.terakhir_bayar) : 'belum ada'} · iuran ${rp(i.nominal)}/kumpulan</p>`;
        if (i.kurang > 0) {
            return panel(judul, '', '<span class="badge red">▲ Ada tunggakan</span>', `<div class="cek-total bad">${rp(i.kurang)}</div>`,
                `<p class="small muted">${i.periode_kurang} kumpulan belum lunas${i.status_berjalan && i.status_berjalan !== 'lunas' ? ' · periode berjalan juga belum lunas' : ''}.</p>${hist}${akhir}`, 'warn');
        }
        if (i.status_berjalan === 'lunas') {
            return panel(judul, '', '<span class="badge green">✔ Lunas periode ini</span>', i.lebih > 0 ? `<div class="cek-total good">+${rp(i.lebih)}</div>` : '<div class="cek-total good">Rp 0</div>',
                `<p class="small muted">${i.lebih > 0 ? `Titipan menutup ±${i.periode_lebih} kumpulan berikutnya.` : 'Tidak ada tunggakan iuran wajib.'}</p>${hist}${akhir}`, 'ok');
        }
        return panel(judul, '', `<span class="badge amber">${i.status_berjalan === 'sebagian' ? '◐ Dibayar sebagian' : '○ Belum bayar periode ini'}</span>`,
            `<div class="cek-total" style="color:var(--amber)">${rp(i.tagihan_berjalan)}</div>`,
            `<p class="small muted">Tagihan kumpulan terakhir (belum jatuh tempo; jatuh tempo pada kumpulan berikutnya). Tidak ada tunggakan dari kumpulan sebelumnya.</p>${hist}${akhir}`, 'ok');
    }
    function kartuHasil(h) {
        const iuranKurang = h.iuran && h.iuran.kurang > 0;
        const ok = h.status !== 'menunggak' && !iuranKurang;
        // Kartu jimpitan (biru) memuat tombol kalender di dalamnya; kartu iuran wajib (ungu)
        const tombol = h.jimpitan_wajib === false ? '' : `<button class="btn sm cek-aksi" data-act="kalenderPublik" data-nama="${esc(h.nama)}" data-rt="${esc(h.rt)}">${App.icon('cal')} Lihat kalender jimpitan</button>`;
        const pj = panelJimpitan(h).replace('class="cek-panel ', 'class="cek-panel cek-jimpitan ').replace(/<\/div>$/, tombol + '</div>');
        const pi = panelIuran(h).replace('class="cek-panel ', 'class="cek-panel cek-iuran ');
        return `<article class="cek-result ${ok ? 'ok' : 'warn'}">
            <div class="row between">
                <div><b class="cek-name">${esc(h.nama)}</b> <span class="badge">RT ${esc(h.rt)}</span> <span class="badge blue">jimpitan ${esc(h.jenis)}</span></div>
            </div>
            <div class="cek-grid">${pj}${pi}</div>
        </article>`;
    }

    // Reset pencarian: kosongkan nama, RT, dan hasil
    App.actions.cekReset = () => {
        const n = $('#cekNama'), r = $('#cekRt'), o = $('#cekOut');
        if (n) n.value = '';
        if (r) r.value = '';
        if (o) o.innerHTML = '';
        if (n) n.focus();
    };

    App.forms.cekTunggakan = async (f) => {
        const out = $('#cekOut');
        const btn = $('button[type=submit]', f);
        btn.disabled = true;
        out.innerHTML = App.loading('Mencari…');
        try {
            const r = await App.api('/api/cek-tunggakan?' + App.qs({ q: f.q.value.trim(), rt: f.rt.value }));
            if (!r.hasil.length) {
                out.innerHTML = '<div class="empty">Nama tidak ditemukan. Periksa ejaan atau pilih RT yang sesuai.</div>';
            } else {
                out.innerHTML = `${r.hasil.map(kartuHasil).join('')}
                    ${r.terpotong ? '<p class="small muted">Hasil dibatasi 8 nama. Persempit pencarian dengan nama yang lebih lengkap atau pilih RT.</p>' : ''}
                    <p class="small muted">Jimpitan dihitung harian (Rp ${Number(r.tarif_harian).toLocaleString('id-ID')}/hari) sejak ${App.tglId(r.dihitung_dari)}; nominal setoran bebas dan sisanya menjadi saldo. Bila ada ketidaksesuaian, hubungi petugas RT.</p>`;
            }
        } catch (e) {
            out.innerHTML = `<div class="notice">${esc(e.message)}</div>`;
        } finally {
            btn.disabled = false;
        }
    };

    // Beranda gabungan: tamu melihat ringkasan publik; pengguna login melihat analisis lengkap (ex-Dashboard).
    const berandaPublik = App.views.beranda;
    App.views.beranda = (root) => (App.user && App.has('dashboard.lihat') ? App.views.dashboard(root) : berandaPublik(root));
})();
