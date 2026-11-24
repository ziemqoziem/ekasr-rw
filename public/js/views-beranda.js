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
        const ir = d.iuran;
        const bl = `${BULAN[Number(d.bulan.slice(5, 7)) - 1]} ${d.bulan.slice(0, 4)}`;
        const nmLalu = BULAN[(Number(d.bulan.slice(5, 7)) + 10) % 12].slice(0, 3);
        const persenMenyetor = d.total_warga ? Math.round((d.warga_menyetor / d.total_warga) * 100) : 0;
        const tgl = (t) => App.tglId(t);

        /* ---- 1) Saldo kas: total + tiap kantong ---- */
        const kunci = { jimpitan: (b) => b.jimpitan, bendahara_rw: (b) => b.iuran + b.sewa };
        const kantongTiles = k.kantong.filter((x) => x.kode !== 'umum' || x.saldo !== 0).map((x) => {
            if (x.kode === 'umum') return D.tile({ label: x.nama, value: rp(x.saldo), tone: 'bad', sub: 'Pengeluaran yang tidak dikaitkan ke satu sumber dana' });
            const ini = kunci[x.kode](k.bulan_ini), lalu = kunci[x.kode](k.bulan_lalu);
            return D.tile({
                label: `Saldo ${x.nama}`, value: rp(x.saldo), tone: x.saldo < 0 ? 'bad' : 'good',
                delta: D.delta(ini, lalu, true, nmLalu),
                sub: `Masuk ${bl.split(' ')[0].slice(0, 3)} ${compact(ini)} · total masuk ${compact(x.awal + x.masuk)} · keluar ${compact(x.keluar)}`
            });
        });
        const tilesKas = [
            D.tile({ hero: true, label: 'Saldo kas RW (seluruh sumber)', value: rp(k.saldo), tone: k.saldo < 0 ? 'bad' : 'good',
                sub: `Total masuk ${compact(k.masuk)} · total keluar ${compact(k.keluar)} · bulan ini masuk ${compact(k.bulan_ini.masuk)} / keluar ${compact(k.bulan_ini.keluar)}${k.tahun_basis ? ' · saldo awal tahun ' + k.tahun_basis : ''}` }),
            ...kantongTiles
        ];

        const komp = [
            { name: 'Kas Jimpitan', value: Math.max(0, k.kantong[0].saldo), color: C.s[0] },
            { name: 'Kas Bendahara RW', value: Math.max(0, k.kantong[1].saldo), color: C.s[2] }
        ];
        reg.komp = () => K.donut({ parts: komp, centerTop: compact(k.saldo), centerBottom: 'saldo kas', aria: 'Komposisi saldo kas per sumber' });
        reg.trenkas = (w) => K.columns({
            labels: k.tren.map((t) => K.bulanPendek(t.bulan)),
            series: [
                { name: 'Jimpitan', color: C.s[0], values: k.tren.map((t) => t.jimpitan) },
                { name: 'Iuran wajib', color: C.s[2], values: k.tren.map((t) => t.iuran) },
                { name: 'Pemasukan lainnya', color: C.s[3], values: k.tren.map((t) => t.sewa) },
                { name: 'Pengeluaran', color: C.s[7], values: k.tren.map((t) => t.keluar) }
            ],
            tipTitle: (i) => D.labelBulan(k.tren[i].bulan), height: 220, aria: 'Pemasukan per sumber dan pengeluaran 6 bulan terakhir'
        }, w);
        reg.masukbulan = () => K.hbars({ items: [
            { name: 'Jimpitan', value: k.bulan_ini.jimpitan, color: C.s[0] },
            { name: 'Iuran wajib', value: k.bulan_ini.iuran, color: C.s[2] },
            { name: 'Pemasukan lainnya', value: k.bulan_ini.sewa, color: C.s[3] },
            { name: 'Pengeluaran', value: k.bulan_ini.keluar, color: C.s[7] }
        ] });
        // Kas per kumpulan RW (cut off): saldo awal + pemasukan − pengeluaran = saldo akhir
        const periodeRows = k.per_periode.slice().reverse().map((p) => `
            <tr><td><b>Kumpulan ke-${p.no}</b><div class="small muted">${tgl(p.tanggal)}${p.berjalan ? ' <span class="badge blue">berjalan</span>' : ''}</div></td>
            <td class="r num">${rp(p.saldo_awal)}</td>
            <td class="r num">${rp(p.jimpitan)}</td><td class="r num">${rp(p.iuran)}</td><td class="r num">${rp(p.sewa)}</td>
            <td class="r num">${rp(p.keluar)}</td><td class="r num"><b>${rp(p.saldo_akhir)}</b></td></tr>`).join('');

        /* ---- 2) Jimpitan ---- */
        const tilesJ = [
            D.tile({ label: `Jimpitan ${bl}`, value: rp(d.total_bulan_ini), delta: D.delta(d.total_bulan_ini, d.total_bulan_lalu, true, nmLalu) }),
            D.tile({ label: 'Jimpitan hari ini', value: rp(d.jimpitan_hari_ini.total), sub: `${d.jimpitan_hari_ini.warga} warga menyetor hari ini` }),
            D.tile({ label: 'Tunggakan jimpitan', value: rp(d.tunggakan.total), tone: d.tunggakan.total > 0 ? 'bad' : 'good', sub: `${d.tunggakan.warga_menunggak} warga · ${d.tunggakan.persen_lunas}% bebas tunggakan · titipan ${compact(d.tunggakan.titipan || 0)}` })
        ];
        // Gauge partisipasi per RT
        const gaugeRt = d.rt.map((r) => K.gauge({
            value: r.persen, label: `RT ${r.rt}`, sub: `${r.warga_menyetor_bulan_ini} dari ${r.warga_aktif} warga · ${rp(r.total_bulan_ini)}`,
            detail: `RT ${r.rt}: ${r.warga_menyetor_bulan_ini} dari ${r.warga_aktif} warga menyetor bulan ini`
        })).join('');
        const tarifStrip = d.tarif.map((t) => `<span class="tarif-pill"><b>Jimpitan harian</b> ${t.nominal > 0 ? rp(t.nominal) : '<i class="muted">belum ditentukan</i>'}</span>`).join('');

        /* ---- 3) Iuran wajib (kas RW) ---- */
        let htmlIuran;
        if (ir && ir.aktif) {
            const parts = [
                { name: 'Lunas', value: ir.lunas, color: C.good }, { name: 'Sebagian', value: ir.sebagian, color: C.warn }, { name: 'Belum bayar', value: ir.belum, color: C.crit }
            ];
            reg.iuranst = () => K.donut({ parts, fmt: (v) => `${v} KK`, centerTop: `${ir.persen_lunas}%`, centerBottom: 'lunas', aria: 'Status iuran wajib kumpulan berjalan' });
            const tilesI = [
                D.tile({ label: 'Kumpulan RW berjalan', value: esc(tgl(ir.periode.mulai)), sub: `${esc(ir.periode.weton)} · iuran ${rp(ir.nominal)}/KK` }),
                D.tile({ label: 'Diterima kumpulan ini', value: rp(ir.diterima_periode), sub: `${ir.lunas} lunas · ${ir.sebagian} sebagian · ${ir.belum} belum dari ${ir.warga_wajib} KK` }),
                D.tile({ label: 'Tunggakan iuran wajib', value: rp(ir.tunggakan_total), tone: ir.tunggakan_total > 0 ? 'bad' : 'good', sub: `${ir.warga_menunggak} KK · titipan ${compact(ir.titipan || 0)}` })
            ];
            htmlIuran = `<div class="kpi-grid n3">${tilesI.join('')}</div>
                ${D.chartCard('iuranst', 'Status iuran wajib kumpulan berjalan', `${ir.periode.weton}, ${tgl(ir.periode.mulai)}`, D.tbl([{ h: 'Status' }, { h: 'KK', r: 1 }], parts.map((p) => [esc(p.name), p.value])), 'cc-narrow')}`;
        } else {
            htmlIuran = '<div class="card empty">Iuran wajib per kumpulan RW belum diaktifkan oleh pengurus.</div>';
        }

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
            <div class="kpi-grid n4">${tilesKas.join('')}</div>

            <h3 class="sec-title">Kas per periode kumpulan RW</h3>
            <section class="card">
                <div class="tbl-wrap"><table><thead><tr><th>Kumpulan</th><th class="r">Saldo awal</th><th class="r">Jimpitan</th><th class="r">Iuran</th><th class="r">Lainnya</th><th class="r">Keluar</th><th class="r">Saldo akhir</th></tr></thead><tbody>${periodeRows || '<tr><td colspan="7" class="muted">Belum ada kumpulan.</td></tr>'}</tbody></table></div>
                <p class="small muted" style="margin-top:8px">Saldo awal + jimpitan + iuran + lainnya − keluar = saldo akhir. Dihitung sampai tanggal kumpulan (cut off); kumpulan berjalan dihitung sampai hari ini.</p>
            </section>

            <div class="dash-grid g-2">
                ${D.chartCard('komp', 'Komposisi saldo kas', 'Saldo tiap sumber dana', D.tbl([{ h: 'Sumber' }, { h: 'Saldo', r: 1 }], k.kantong.map((x) => [esc(x.nama), rp(x.saldo)])))}
                ${D.chartCard('trenkas', 'Pemasukan & pengeluaran 6 bulan', 'Jimpitan, iuran wajib, pemasukan lainnya, dan pengeluaran', D.tbl([{ h: 'Bulan' }, { h: 'Jimpitan', r: 1 }, { h: 'Iuran', r: 1 }, { h: 'Lainnya', r: 1 }, { h: 'Keluar', r: 1 }], k.tren.map((t) => [D.labelBulan(t.bulan), rp(t.jimpitan), rp(t.iuran), rp(t.sewa), rp(t.keluar)])))}
            </div>
            <div class="dash-grid" style="grid-template-columns:1fr">
                ${D.chartCard('masukbulan', `Kas bulan ${bl}`, 'Pemasukan per sumber vs pengeluaran', D.tbl([{ h: 'Pos' }, { h: 'Nominal', r: 1 }], [['Jimpitan', rp(k.bulan_ini.jimpitan)], ['Iuran wajib', rp(k.bulan_ini.iuran)], ['Pemasukan lainnya', rp(k.bulan_ini.sewa)], ['Pengeluaran', rp(k.bulan_ini.keluar)]]))}
            </div>

            <h3 class="sec-title">Kas Jimpitan</h3>
            <div class="kpi-grid n3">${tilesJ.join('')}</div>
            <section class="card">
                <h3>Partisipasi per RT — ${esc(bl)}</h3>
                <div class="gauges">${gaugeRt || '<div class="empty">Belum ada data RT.</div>'}</div>
                <div class="tarif-strip"><span class="small muted">Tarif:</span>${tarifStrip}</div>
            </section>

            <h3 class="sec-title">Kas Iuran Wajib (per kumpulan RW)</h3>
            ${htmlIuran}

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
