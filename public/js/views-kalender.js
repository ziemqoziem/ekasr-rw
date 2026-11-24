/* Halaman Kalender: visualisasi setoran per warga (hijau = sudah setor, merah = belum). */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const KS = (App.stKalender = { rt: '', q: '', warga: 0, bulan: '', daftar: [], data: null, mode: 'kalender' });
    const RTS = ['007', '008', '009'];
    const STATUS = {
        hijau: ['Sudah setor (hari tertutup)', 'cal-hijau'],
        merah: ['Belum setor (sudah jatuh tempo)', 'cal-merah'],
        berjalan: ['Belum jatuh tempo', 'cal-berjalan'],
        depan: ['Belum tiba', 'cal-depan'],
        luar: ['Di luar masa iuran', 'cal-luar']
    };

    const geser = (bulan, n) => {
        const d = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)) - 1 + n, 1));
        return d.toISOString().slice(0, 7);
    };

    // Penyaji kalender bersama (halaman Kalender & Beranda publik). interaktif=true → tanggal bisa diklik.
    App.kalenderHtml = function (d, interaktif) {
        const hdr = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => `<div class="cal-h">${h}</div>`).join('');
        const bulanHtml = d.bulan.map((b) => {
            const [y, m] = b.bulan.split('-').map(Number);
            const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
            const sel = b.hari.map((x) => {
                const n = Number(x.tanggal.slice(8));
                const cls = `${STATUS[x.status][1]} ${x.tanggal === d.today ? 'cal-today' : ''}`;
                const label = `${n} ${BULAN[m - 1]}: ${STATUS[x.status][0]}`;
                return interaktif
                    ? `<button class="cal-d ${cls}" data-act="kalenderHari" data-tgl="${x.tanggal}" aria-label="${esc(label)}"><span>${n}</span>${x.setoran ? '<i class="cal-pt"></i>' : ''}</button>`
                    : `<div class="cal-d ${cls}" role="img" aria-label="${esc(label)}"><span>${n}</span></div>`;
            }).join('');
            const r = b.ringkas;
            return `<section class="cal-month">
                <div class="cal-title"><b>${BULAN[m - 1]} ${y}</b><span class="small"><span class="cal-n cal-hijau">${r.hijau}</span> <span class="cal-n cal-merah">${r.merah}</span></span></div>
                <div class="cal-grid">${hdr}${'<div class="cal-d cal-kosong"></div>'.repeat(offset)}${sel}</div>
            </section>`;
        }).join('');
        const legend = `<div class="cal-legend small">
            <span><i class="cal-dot cal-hijau"></i> Sudah setor</span>
            <span><i class="cal-dot cal-merah"></i> Belum setor</span>
            <span><i class="cal-dot cal-berjalan"></i> Belum jatuh tempo</span>
            <span><i class="cal-dot cal-depan"></i> Belum tiba / di luar masa iuran</span></div>`;
        return `<div class="cal-months">${bulanHtml}</div>${legend}`;
    };

    App.views.kalender = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        if (!KS.bulan) KS.bulan = App.today().slice(0, 7);
        if (App.rtKunci()) KS.rt = App.user.rt || '';
        if (!App.has('iuran.lihat')) KS.mode = 'kalender';
        if (KS.mode === 'iuran') return tampilRiwayat(root);
        root.innerHTML = `
            <h2 class="title">Kalender Setoran Warga</h2>
            ${tabsKal()}
            <div class="card">
                <p class="small" style="margin-bottom:10px">Pilih warga untuk melihat riwayatnya per tanggal.
                    <span class="cal-key cal-hijau">Hijau</span> = sudah setor, <span class="cal-key cal-merah">Merah</span> = belum setor.</p>
                <div class="filters">
                    <div><label class="f" for="kRt">RT</label><select id="kRt" data-change="kalenderRt" ${App.rtKunci() ? 'disabled' : ''}>${App.optRt(KS.rt)}</select></div>
                    <div><label class="f" for="kCari">Cari nama</label><input id="kCari" placeholder="Ketik nama…" value="${esc(KS.q)}" data-input="kalenderCari" maxlength="60"></div>
                    <div><label class="f" for="kWarga">Warga</label><select id="kWarga" data-change="kalenderWarga"></select></div>
                </div>
            </div>
            <div id="kBody"></div>`;
        const r = await App.api('/api/warga?' + App.qs({ rt: KS.rt }));
        KS.daftar = r.warga;
        isiPilihan();
        await muatKalender();
    };

    // Tab halaman: Kalender jimpitan | Riwayat iuran
    function tabsKal() {
        if (!App.has('iuran.lihat')) return '';
        return `<div class="subtabs">${[['kalender', 'Kalender Jimpitan'], ['iuran', 'Riwayat Iuran']].map(([v, l]) => `<button class="tab ${KS.mode === v ? 'active' : ''}" data-act="kalMode" data-nilai="${v}">${l}</button>`).join('')}</div>`;
    }
    App.actions.kalMode = (el) => { KS.mode = el.dataset.nilai; return App.render(); };

    /* ================= RIWAYAT IURAN (per tab RT) ================= */
    const RI = (App.stRiwayatIuran = { rt: '', q: '', status: '', data: null });

    async function tampilRiwayat(root) {
        if (App.rtKunci()) RI.rt = App.user.rt || '';
        root.innerHTML = `
            <h2 class="title">Riwayat Iuran Warga</h2>
            ${tabsKal()}
            <div id="riOut">${App.loading()}</div>`;
        await muatRiwayat();
    }

    async function muatRiwayat() {
        const r = await App.api('/api/riwayat-iuran?' + App.qs({ rt: RI.rt, status: RI.status }));
        RI.data = r;
        App.pgReset('riwayatiuran');
        gambarRiwayat();
    }

    function gambarRiwayat() {
        const r = RI.data;
        if (!r || !$('#riOut')) return;
        App.pgRedraw.riwayatiuran = gambarRiwayat;
        const kunci = App.rtKunci();
        const totalRt = new Map(r.per_rt.map((x) => [x.rt, x]));
        const semuaTot = r.per_rt.reduce((a, x) => a + x.total, 0);
        const tabRt = (kunci ? [[RI.rt, 'RT ' + RI.rt]] : [['', 'Semua RT'], ...RTS.map((x) => [x, 'RT ' + x])])
            .map(([v, l]) => `<button class="tab ${RI.rt === v ? 'active' : ''}" data-act="riwRt" data-nilai="${v}">${l}</button>`).join('');
        const cari = RI.q.trim().toLowerCase();
        const rows = r.riwayat.filter((x) => !cari || x.nama.toLowerCase().includes(cari));
        const pg = App.paginate('riwayatiuran', rows);
        const sah = rows.filter((x) => x.status === 'sah');
        const total = sah.reduce((a, x) => a + x.nominal, 0);
        const ringRt = kunci ? '' : `<p class="small muted" style="margin:-4px 0 10px">Total iuran sah: ${[...totalRt.values()].map((x) => `RT ${esc(x.rt)} <b>${rp(x.total)}</b>`).join(' · ')} · Semua <b>${rp(semuaTot)}</b></p>`;
        $('#riOut').innerHTML = `
            <div class="subtabs">${tabRt}</div>
            ${ringRt}
            <div class="card">
                <div class="filters">
                    <div class="grow"><label class="f" for="riCari">Cari nama</label><input id="riCari" placeholder="Ketik nama…" value="${esc(RI.q)}" data-input="riwCari" maxlength="60"></div>
                    <div><label class="f" for="riSt">Status</label><select id="riSt" data-change="riwStatus">
                        ${[['', 'Semua'], ['sah', 'Sah'], ['batal', 'Dibatalkan']].map(([v, l]) => `<option value="${v}" ${RI.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                </div>
                <p class="small muted" style="margin-top:8px">${sah.length} pembayaran sah · total <b>${rp(total)}</b>${rows.length - sah.length ? ` · ${rows.length - sah.length} dibatalkan` : ''}${r.terpotong ? ' · menampilkan 1.000 terbaru' : ''}</p>
            </div>
            ${pg.bar}
            ${rows.length ? `<div class="card tbl-card"><div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Nama (RT)</th><th class="r">Nominal</th><th>Petugas</th><th>Status</th></tr></thead><tbody>
                ${pg.items.map((x) => `<tr style="${x.status === 'batal' ? 'opacity:.55' : ''}"><td>${App.tglId(x.tanggal)}</td><td><b>${esc(x.nama)}</b> <span class="badge">RT ${esc(x.rt)}</span></td>
                    <td class="r num">${rp(x.nominal)}</td><td>${esc(x.petugas)}</td>
                    <td>${x.status === 'sah' ? '<span class="badge green">sah</span>' : `<span class="badge red" title="${esc(x.alasan_batal || '')}">batal${x.alasan_batal ? ': ' + esc(x.alasan_batal) : ''}</span>`}</td></tr>`).join('')}
                </tbody></table></div></div>` : '<div class="card empty">Belum ada riwayat iuran.</div>'}`;
    }

    App.actions.riwRt = (el) => { RI.rt = el.dataset.nilai; return muatRiwayat(); };
    App.changes.riwStatus = (el) => { RI.status = el.value; return muatRiwayat(); };
    App.changes.riwCari = (inp) => {
        RI.q = inp.value;
        App.pgReset('riwayatiuran');
        gambarRiwayat();
        const e = $('#riCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    };

    function isiPilihan() {
        const q = KS.q.trim().toLowerCase();
        const list = KS.daftar.filter((w) => !q || w.nama.toLowerCase().includes(q));
        if (list.length && !list.some((w) => w.id === KS.warga)) KS.warga = list[0].id;
        $('#kWarga').innerHTML = list.length
            ? list.map((w) => `<option value="${w.id}" ${w.id === KS.warga ? 'selected' : ''}>${esc(w.nama)} · RT ${esc(w.rt)} · ${esc(w.jenis)}</option>`).join('')
            : '<option value="">(tidak ada warga)</option>';
        if (!list.length) KS.warga = 0;
    }

    async function muatKalender() {
        const body = $('#kBody');
        if (!body) return;
        if (!KS.warga) { body.innerHTML = '<div class="card empty">Tidak ada warga yang cocok.</div>'; return; }
        body.innerHTML = App.loading();
        KS.data = await App.api('/api/kalender?' + App.qs({ warga_id: KS.warga, bulan: KS.bulan, jumlah: 3 }));
        tampil();
    }

    function tampil() {
        const d = KS.data;
        const s = d.saldo;
        const status = s.kurang > 0 ? `<span class="badge red">Kurang ${rp(s.kurang)}</span>`
            : s.lebih > 0 ? `<span class="badge green">Titipan ${rp(s.lebih)} · lunas s.d. ${App.tglId(s.lunas_sampai)}</span>`
            : '<span class="badge">Lunas sampai hari ini</span>';
        const akhir = d.bulan[d.bulan.length - 1].bulan;
        const awal = d.bulan[0].bulan;
        const lblB = (b) => `${BULAN[Number(b.slice(5, 7)) - 1].slice(0, 3)} ${b.slice(0, 4)}`;
        $('#kBody').innerHTML = `
            <div class="card">
                <div class="row between" style="margin-bottom:10px;flex-wrap:nowrap">
                    <button class="btn sm" data-act="kalenderGeser" data-n="-1" aria-label="Bulan sebelumnya">‹</button>
                    <div style="text-align:center"><b>${esc(d.warga.nama)}</b> <span class="small muted">RT ${esc(d.warga.rt)} · ${esc(d.warga.jenis)}</span>
                        <div class="small muted">${lblB(awal)} – ${lblB(akhir)}</div></div>
                    <button class="btn sm" data-act="kalenderGeser" data-n="1" aria-label="Bulan berikutnya">›</button>
                </div>
                ${App.kalenderHtml(d, true)}
                <div class="row" style="margin-top:12px">${status}<span class="small muted">Tarif ${rp(d.tarif_harian)}/hari · dihitung sejak ${App.tglId(d.mulai)}</span></div>
                <p class="small muted" style="margin-top:6px">Titik putih pada tanggal = ada setoran dicatat hari itu; sentuh tanggal untuk rinciannya. Warga mingguan/bulanan baru merah setelah lewat jatuh tempo.</p>
            </div>`;
    }

    App.changes.kalenderRt = async () => {
        if (!App.rtKunci()) KS.rt = $('#kRt').value;
        const r = await App.api('/api/warga?' + App.qs({ rt: KS.rt }));
        KS.daftar = r.warga;
        isiPilihan();
        await muatKalender();
    };
    App.changes.kalenderCari = () => { KS.q = $('#kCari').value; isiPilihan(); return muatKalender(); };
    App.changes.kalenderWarga = () => { KS.warga = Number($('#kWarga').value) || 0; return muatKalender(); };
    App.actions.kalenderGeser = (el) => {
        const batas = App.today().slice(0, 7);
        const b = geser(KS.bulan, Number(el.dataset.n));
        if (b > batas) return;
        KS.bulan = b;
        return muatKalender();
    };
    App.actions.kalenderHari = (el) => {
        const x = KS.data.bulan.flatMap((b) => b.hari).find((h) => h.tanggal === el.dataset.tgl);
        if (!x) return;
        App.dialog(`
            <h3>${App.tglId(x.tanggal)}</h3>
            <p><b>${esc(KS.data.warga.nama)}</b> — ${esc(STATUS[x.status][0])}</p>
            <p class="small muted" style="margin-top:6px">${x.setoran ? `Setoran dicatat pada tanggal ini: ${rp(x.setoran)} .` : 'Tidak ada setoran dicatat pada tanggal ini.'}
            ${x.status === 'hijau' && !x.setoran ? ' Hari ini tertutup oleh setoran/titipan di tanggal lain.' : ''}</p>
            <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>`);
    };
    // Dari halaman Setor: buka kalender warga tertentu
    App.actions.kalenderWarga = (el) => {
        KS.warga = Number(el.dataset.id);
        KS.q = '';
        KS.bulan = App.today().slice(0, 7);
        App.go('kalender');
    };

    // Kalender publik (dari hasil cek tunggakan di Beranda): 3 bulan terakhir, tanpa nominal
    App.actions.kalenderPublik = async (el) => {
        App.dialog(`<h3>Kalender setoran</h3>${App.loading()}`);
        try {
            const d = await App.api('/api/kalender-publik?' + App.qs({ nama: el.dataset.nama, rt: el.dataset.rt }));
            App.dialog(`
                <h3>${esc(d.warga.nama)} <span class="small muted">RT ${esc(d.warga.rt)} · ${esc(d.warga.jenis)}</span></h3>
                <p class="small muted" style="margin-bottom:10px">3 bulan terakhir. Hijau = sudah setor, merah = belum setor.</p>
                ${App.kalenderHtml(d, false)}
                <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>`);
        } catch (e) {
            App.closeDialog();
            App.fail(e);
        }
    };
})();
