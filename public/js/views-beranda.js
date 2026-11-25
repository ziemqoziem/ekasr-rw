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
        // Rumus: saldo awal + pemasukan − pengeluaran = saldo kas (jumlah seluruh kantong)
        const awalTotal = k.kantong.reduce((t, x) => t + (x.awal || 0), 0);
        const masukTrx = k.kantong.reduce((t, x) => t + (x.masuk || 0), 0);
        const keluarTrx = k.kantong.reduce((t, x) => t + (x.keluar || 0), 0);
        const maks = Math.max(1, Math.abs(awalTotal), masukTrx, keluarTrx);
        const lebar = (v) => Math.max(2, Math.round((Math.abs(v) / maks) * 100));
        const saldoKas = `<div class="bk">
            <div class="bk-lite ${k.saldo < 0 ? 'neg' : ''}">
                <div class="bl-kiri">
                    <div class="bl-label">Saldo kas RW <em>per ${esc(tgl(App.today()))}</em></div>
                    <div class="bl-saldo">${rp(k.saldo)}</div>
                    <div class="bl-sub">Gabungan seluruh sumber dana</div>
                    <div class="bl-bulan">
                        <div class="in"><small>Masuk ${esc(bl)}</small><b>${rp(k.bulan_ini.masuk)}</b></div>
                        <div class="out"><small>Keluar ${esc(bl)}</small><b>${rp(k.bulan_ini.keluar)}</b></div>
                    </div>
                </div>
                <ul class="bl-rincian">
                    <li class="awal"><div><span>Saldo awal${k.tahun_basis ? ' ' + esc(k.tahun_basis) : ''}</span><b>${rp(awalTotal)}</b></div><i style="width:${lebar(awalTotal)}%"></i></li>
                    <li class="masuk"><div><span>Pemasukan</span><b>+ ${rp(masukTrx)}</b></div><i style="width:${lebar(masukTrx)}%"></i></li>
                    <li class="keluar"><div><span>Pengeluaran</span><b>− ${rp(keluarTrx)}</b></div><i style="width:${lebar(keluarTrx)}%"></i></li>
                    <li class="total"><div><span>Saldo kas</span><b>${rp(k.saldo)}</b></div></li>
                </ul>
            </div>
            <div class="bk-samping">${kartuKantong}</div></div>`;

        /* ---- 2) Kas per kumpulan RW (cut off): saldo awal + pemasukan − pengeluaran = saldo akhir ---- */
        const periodeRows = k.per_periode.slice().reverse().map((p) => `
            <tr class="${p.berjalan ? 'jalan' : ''}"><td data-l="Kumpulan"><div class="kn-box"><span class="kn">${p.no}</span><div><b>Kumpulan ke-${p.no}</b><div class="small muted">${tgl(p.tanggal)}${p.berjalan ? ' <span class="kn-jalan">berjalan</span>' : ''}</div></div></div></td>
            <td class="r num" data-l="Saldo periode sebelumnya">${rp(p.saldo_awal)}</td>
            <td class="r num in" data-l="Jimpitan">${rp(p.jimpitan)}</td><td class="r num in" data-l="Iuran">${rp(p.iuran)}</td><td class="r num in" data-l="Lainnya">${rp(p.sewa)}</td>
            <td class="r num out" data-l="Keluar">${rp(p.keluar)}</td><td class="r num sa" data-l="Saldo akhir"><b>${rp(p.saldo_akhir)}</b></td></tr>`).join('');
        const tabelPeriode = `<section class="card bk-periode bk-modern">
            <div class="tbl-wrap"><table class="tbl-kas"><thead><tr><th>Kumpulan</th><th class="r">Saldo periode sebelumnya</th><th class="r h-in">Jimpitan</th><th class="r h-in">Iuran</th><th class="r h-in">Lainnya</th><th class="r h-out">Keluar</th><th class="r h-akhir">Saldo akhir</th></tr></thead>
            <tbody>${periodeRows || '<tr><td colspan="7" class="muted">Belum ada kumpulan.</td></tr>'}</tbody></table></div>
            <p class="small muted" style="margin-top:10px">Saldo periode sebelumnya + jimpitan + iuran + lainnya − keluar = saldo akhir. Dihitung sampai tanggal kumpulan (cut off); kumpulan berjalan dihitung sampai hari ini.</p></section>`;

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
                    <div class="cek-aksi-grup">
                        <button class="btn-3d btn-cari" type="submit"><span class="ic">${App.icon('search')}</span>Cari</button>
                        <button class="btn-3d btn-reset" type="button" data-act="cekReset" title="Kosongkan pencarian dan hasil"><span class="ic">${App.icon('reset')}</span>Reset</button>
                    </div>
                </form>
                <div id="cekOut" aria-live="polite"></div>
            </section>` : ''}

            <h3 class="sec-title">Saldo Kas RW</h3>
            ${saldoKas}

            <h3 class="sec-title">Kas per periode kumpulan RW</h3>
            ${tabelPeriode}
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
        const dt = `data-nama="${esc(h.nama)}" data-rt="${esc(h.rt)}" data-jenis="${esc(h.jenis)}"`;
        const tombol = h.jimpitan_wajib === false ? '' : `<div class="cek-aksi-dua"><button class="btn sm cek-aksi" data-act="riwayatPublik" data-tab="${h.jenis === 'harian' ? 'b' : 't'}" ${dt}>${App.icon('book')} Riwayat</button><button class="btn sm cek-aksi" data-act="riwayatPublik" data-tab="b" ${dt}>${App.icon('chart')} Riwayat bulanan</button></div>`;
        const pj = panelJimpitan(h).replace('class="cek-panel ', 'class="cek-panel cek-jimpitan ').replace(/<\/div>$/, tombol + '</div>');
        const tombolI = h.iuran && !h.iuran.bebas ? `<div class="cek-aksi-dua"><button class="btn sm cek-aksi" data-act="riwayatIuranPublik" data-tab="k" ${dt}>${App.icon('book')} Riwayat iuran</button><button class="btn sm cek-aksi" data-act="riwayatIuranPublik" data-tab="t" ${dt}>${App.icon('cash')} Pembayaran</button></div>` : '';
        const pi = panelIuran(h).replace('class="cek-panel ', 'class="cek-panel cek-iuran ').replace(/<\/div>$/, tombolI + '</div>');
        return `<article class="cek-result ${ok ? 'ok' : 'warn'}">
            <div class="row between">
                <div><b class="cek-name">${esc(h.nama)}</b> <span class="badge">RT ${esc(h.rt)}</span> <span class="badge blue">jimpitan ${esc(h.jenis)}</span></div>
            </div>
            <div class="cek-grid">${pj}${pi}</div>
        </article>`;
    }

    // Riwayat jimpitan publik: tab Bulanan (saldo akhir bulan) dan Transaksi (setoran terakhir)
    const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    App.actions.riwayatPublik = async (el) => {
        const r = await App.api('/api/riwayat-publik?' + App.qs({ nama: el.dataset.nama, rt: el.dataset.rt }));
        const kurang = Math.max(0, -r.saldo), lebih = Math.max(0, r.saldo);
        const status = kurang > 0
            ? `<div class="rw-status bad"><span class="rw-ic">!</span><div><small>Kekurangan</small><b>${rp(kurang)}</b><em>≈ ${r.tarif_harian > 0 ? Math.ceil(kurang / r.tarif_harian) : 0} hari · dihitung sejak ${tglP(r.mulai_hitung)}</em></div></div>`
            : `<div class="rw-status good"><span class="rw-ic">${lebih > 0 ? '+' : '✓'}</span><div><small>${lebih > 0 ? 'Kelebihan (titipan)' : 'Status'}</small><b>${lebih > 0 ? rp(lebih) : 'Lunas'}</b><em>Jimpitan ${rp(r.tarif_harian)}/hari sejak ${tglP(r.mulai_hitung)}</em></div></div>`;
        const lencana = { kurang: '<span class="badge red">kurang</span>', titipan: '<span class="badge green">titipan</span>', lunas: '<span class="badge green">lunas</span>' };
        const bulanan = r.bulanan.length ? `<div class="tbl-wrap"><table><thead><tr><th>Bulan</th><th class="r">Kewajiban</th><th class="r">Setoran</th><th class="r">Saldo akhir bulan</th><th>Status</th></tr></thead><tbody>
            ${r.bulanan.map((x) => `<tr><td style="white-space:nowrap"><b>${BLN[Number(x.bulan.slice(5, 7)) - 1]} ${x.bulan.slice(0, 4)}</b><div class="small muted">${x.berjalan ? 'berjalan, s.d. ' : 'per '}${tglP(x.tanggal)}</div></td>
                <td class="r num">${rp(x.kewajiban)}</td><td class="r num">${x.setoran ? rp(x.setoran) : '-'}</td>
                <td class="r num"><b style="color:${x.saldo < 0 ? '#f43f5e' : '#10b981'}">${x.saldo < 0 ? '− ' + rp(-x.saldo) : rp(x.saldo)}</b></td><td>${lencana[x.status]}</td></tr>`).join('')}
            </tbody></table></div><p class="small muted" style="margin-top:8px">Saldo akhir bulan bersifat kumulatif: setoran sejak awal dikurangi seluruh kewajiban sampai akhir bulan itu.${r.tunggakan_lama ? ` Termasuk tunggakan lama ${rp(r.tunggakan_lama)}.` : ''}</p>`
            : '<div class="empty">Belum ada data bulanan.</div>';
        const transaksi = r.transaksi.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th></tr></thead><tbody>
            ${r.transaksi.map((x) => `<tr><td>${tglP(x.tanggal)}</td><td class="r num">${rp(x.nominal)}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:8px">30 setoran terakhir.</p>`
            : '<div class="empty">Belum ada setoran.</div>';
        const tabB = el.dataset.tab !== 't';
        App.dialog(`
            <div class="rw-dlg">
                <div class="rw-head"><div class="rw-ava">${esc((r.warga.nama || '?').trim().charAt(0).toUpperCase())}</div>
                    <div><h3>${esc(r.warga.nama)}</h3><div class="small muted">RT ${esc(r.warga.rt)} · jimpitan ${esc(r.warga.jenis)}</div></div></div>
                ${status}
                <div class="subtabs rw-tabs">
                    <button type="button" class="tab ${tabB ? 'active' : ''}" data-act="riwTab" data-nilai="b">Bulanan</button>
                    <button type="button" class="tab ${tabB ? '' : 'active'}" data-act="riwTab" data-nilai="t">Transaksi</button>
                </div>
                <div class="rw-pane" data-pane="b" ${tabB ? '' : 'hidden'}>${bulanan}</div>
                <div class="rw-pane" data-pane="t" ${tabB ? 'hidden' : ''}>${transaksi}</div>
                <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>
            </div>`);
    };

    // Riwayat iuran wajib publik: tab Per kumpulan (status tiap kumpulan RW) dan Pembayaran
    App.actions.riwayatIuranPublik = async (el) => {
        const r = await App.api('/api/riwayat-iuran-publik?' + App.qs({ nama: el.dataset.nama, rt: el.dataset.rt }));
        const status = r.tagihan_berjalan > 0
            ? `<div class="rw-status bad"><span class="rw-ic">!</span><div><small>Kekurangan</small><b>${rp(r.tagihan_berjalan)}</b><em>${r.periode_kurang ? `${r.periode_kurang} kumpulan sudah lewat belum lunas (${rp(r.kurang)}) · ` : ''}iuran ${rp(r.nominal)}/kumpulan</em></div></div>`
            : `<div class="rw-status good"><span class="rw-ic">${r.lebih > 0 ? '+' : '✓'}</span><div><small>${r.lebih > 0 ? 'Kelebihan (titipan)' : 'Status'}</small><b>${r.lebih > 0 ? rp(r.lebih) : 'Lunas'}</b><em>${r.lebih > 0 ? `Menutup ±${r.periode_lebih} kumpulan berikutnya · ` : ''}iuran ${rp(r.nominal)}/kumpulan</em></div></div>`;
        const pc = r.kewajiban > 0 ? Math.min(100, Math.round((r.terbayar / r.kewajiban) * 100)) : 100;
        const prog = `<div class="rw-prog"><div class="rw-prog-t"><span>Terbayar ${rp(r.terbayar)}</span><span>dari ${rp(r.kewajiban)} · <b>${pc}%</b></span></div><div class="rw-bar ${pc >= 100 ? 'ok' : ''}"><i style="width:${pc}%"></i></div></div>`;
        const lb = { lunas: '<span class="badge green">lunas</span>', sebagian: '<span class="badge amber">sebagian</span>', belum: '<span class="badge red">belum</span>' };
        const kump = r.periode.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kumpulan</th><th class="r">Iuran</th><th class="r">Dibayar</th><th>Status</th></tr></thead><tbody>
            ${r.periode.map((x) => `<tr><td style="white-space:nowrap"><b>K${x.no}</b> <span class="small muted">${tglP(x.mulai)}${x.selesai ? '' : ' · berjalan'}</span></td><td class="r num">${rp(x.nominal)}</td><td class="r num">${x.dibayar ? rp(x.dibayar) : '-'}</td><td>${lb[x.status] || ''}</td></tr>`).join('')}
            </tbody></table></div><p class="small muted" style="margin-top:8px">Pembayaran dialokasikan ke kumpulan tertua lebih dulu. Menampilkan ${r.periode.length} kumpulan terbaru.</p>` : '<div class="empty">Belum ada kumpulan yang ditagih.</div>';
        const trx = r.transaksi.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th></tr></thead><tbody>
            ${r.transaksi.map((x) => `<tr><td>${tglP(x.tanggal)}</td><td class="r num">${rp(x.nominal)}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:8px">30 pembayaran terakhir.</p>` : '<div class="empty">Belum ada pembayaran iuran wajib.</div>';
        const tabK = el.dataset.tab !== 't';
        App.dialog(`
            <div class="rw-dlg">
                <div class="rw-head"><div class="rw-ava">${esc((r.warga.nama || '?').trim().charAt(0).toUpperCase())}</div>
                    <div><h3>${esc(r.warga.nama)}</h3><div class="small muted">RT ${esc(r.warga.rt)} · iuran wajib (kas RW)</div></div></div>
                ${status}${prog}
                <div class="subtabs rw-tabs">
                    <button type="button" class="tab ${tabK ? 'active' : ''}" data-act="riwTab" data-nilai="k">Per kumpulan</button>
                    <button type="button" class="tab ${tabK ? '' : 'active'}" data-act="riwTab" data-nilai="t">Pembayaran</button>
                </div>
                <div class="rw-pane" data-pane="k" ${tabK ? '' : 'hidden'}>${kump}</div>
                <div class="rw-pane" data-pane="t" ${tabK ? 'hidden' : ''}>${trx}</div>
                <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>
            </div>`);
    };

    // Reset pencarian: kosongkan nama, RT, dan hasil
    App.actions.cekReset = () => {
        const n = $('#cekNama'), o = $('#cekOut');
        if (n) n.value = '';
        if (o) o.innerHTML = '';
        if (n) n.focus();
    };

    App.forms.cekTunggakan = async (f) => {
        const out = $('#cekOut');
        const btn = $('button[type=submit]', f);
        btn.disabled = true;
        out.innerHTML = App.loading('Mencari…');
        try {
            const r = await App.api('/api/cek-tunggakan?' + App.qs({ q: f.q.value.trim() }));
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
