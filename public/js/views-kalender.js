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
                <p class="small mb-md">Pilih warga untuk melihat riwayatnya per tanggal.
                    <span class="cal-key cal-hijau">Hijau</span> = sudah setor, <span class="cal-key cal-merah">Merah</span> = belum setor.</p>
                <div class="filters">
                    <div><label class="f" for="kRt">RT</label><select id="kRt" data-change="kalenderRt" ${App.rtKunci() ? 'disabled' : ''}>${App.optRt(KS.rt)}</select></div>
                    <div><label class="f" for="kCari">Cari nama</label><input id="kCari" placeholder="Nama" value="${esc(KS.q)}" data-input="kalenderCari" maxlength="60"></div>
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

    /* ================= RIWAYAT IURAN: matriks nama × K1/K2/K3… ================= */
    const RI = (App.stRiwayatIuran = { rt: '', q: '', status: '', data: null });
    const RI_LABEL = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum bayar', luar: 'Belum ditagih' };
    const RI_SIM = { lunas: '✓', sebagian: '◐', belum: '✕', luar: '–' };
    const riTgl = (t) => App.tglId(t);

    async function tampilRiwayat(root) {
        if (App.rtKunci()) RI.rt = App.user.rt || '';
        root.innerHTML = `
            <h2 class="title">Riwayat Iuran Warga</h2>
            ${tabsKal()}
            <div id="riOut">${App.loading()}</div>`;
        await muatRiwayat();
    }

    async function muatRiwayat() {
        const r = await App.api('/api/iuran-wajib?' + App.qs({ rt: RI.rt }));
        RI.data = r;
        App.pgReset('riwayatiuran');
        gambarRiwayat();
    }

    function gambarRiwayat() {
        const r = RI.data;
        if (!r || !$('#riOut')) return;
        App.pgRedraw.riwayatiuran = gambarRiwayat;
        const kunci = App.rtKunci();
        const tabRt = (kunci ? [[RI.rt, 'RT ' + RI.rt]] : [['', 'Semua RT'], ...RTS.map((x) => [x, 'RT ' + x])])
            .map(([v, l]) => `<button class="tab ${RI.rt === v ? 'active' : ''}" data-act="riwRt" data-nilai="${v}">${l}</button>`).join('');

        if (!r.aktif) {
            $('#riOut').innerHTML = `<div class="subtabs">${tabRt}</div>
                <div class="card empty">${esc(r.pesan || 'Iuran wajib belum diaktifkan.')}</div>`;
            return;
        }

        const cari = RI.q.trim().toLowerCase();
        const rows = r.warga.filter((w) => (!cari || w.nama.toLowerCase().includes(cari)) && (!RI.status || w.status === RI.status));
        const pg = App.paginate('riwayatiuran', rows);
        const s = r.ringkasan || {};
        const kolomSemua = r.kolom || [];
        const hp = window.innerWidth <= 640;
        RI.ukuranKey = hp ? 'm' : Math.floor(window.innerWidth / 40);

        let badan = '';
        if (!rows.length) {
            badan = '<div class="card empty">Tidak ada warga yang cocok.</div>';
        } else if (hp) {
            badan = `<div class="iu-m">${pg.items.map((w) => {
                const chip = w.riwayat.map((h, i) => {
                    const k = kolomSemua[i];
                    return `<span class="iu-k rw-${h.status}${k && k.terpilih ? ' sel' : ''}" title="${esc(riTgl(h.mulai))}: ${esc(RI_LABEL[h.status] || '')}">K${k ? k.no : i + 1} ${RI_SIM[h.status] || '–'}</span>`;
                }).join('');
                return `<div class="iu-card st-${w.status}">
                    <div class="iu-top">
                        <div class="iu-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span>
                            <div class="small muted">${esc(RI_LABEL[w.status] || w.status)}${w.kurang > 0 ? ` · kurang ${rp(w.kurang)}` : w.lebih > 0 ? ` · titipan ${rp(w.lebih)}` : ''}</div></div>
                        <button class="link-setor iu-sum" data-act="riwDetail" data-id="${w.id}"><small>Iuran</small>${rp(w.total_setor)}</button>
                    </div>
                    <div class="iu-riw">${chip}</div></div>`;
            }).join('')}
            <p class="small muted pad-sm">K = kumpulan RW. ✓ lunas · ◐ sebagian · ✕ belum · – belum ditagih. Warna menyala = kumpulan berjalan.</p></div>`;
        } else {
            const lebar = ($('#riOut') && $('#riOut').clientWidth) || window.innerWidth;
            const maxK = Math.max(lebar < 600 ? 2 : 4, Math.floor((lebar - 250) / 34));
            const nK = Math.min(kolomSemua.length, maxK);
            const iSel = Math.max(0, kolomSemua.findIndex((k) => k.terpilih));
            const mulaiK = Math.max(0, Math.min(kolomSemua.length - nK, iSel - Math.floor(nK * 0.3)));
            const kolom = kolomSemua.slice(mulaiK, mulaiK + nK);
            const riw = (w) => w.riwayat.slice(mulaiK, mulaiK + nK);
            const kepala = kolom.map((k) => `<th class="c-per${k.terpilih ? ' sel' : ''}" title="Kumpulan ke-${k.no} · ${esc(riTgl(k.mulai))}">K${k.no}</th>`).join('');
            const baris = pg.items.map((w) => {
                const sel = riw(w).map((h, i) => `<td class="c-per${kolom[i] && kolom[i].terpilih ? ' sel' : ''}"><span class="rw rw-${h.status}" title="K${kolom[i] ? kolom[i].no : ''} · ${esc(riTgl(h.mulai))}: ${esc(RI_LABEL[h.status] || '')}">${RI_SIM[h.status] || '–'}</span></td>`).join('');
                return `<tr class="st-${w.status}"><td class="c-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span></td>
                    ${sel}
                    <td class="r num c-sum"><button class="link-setor" data-act="riwDetail" data-id="${w.id}" title="Rincian setoran">${rp(w.total_setor)}</button></td></tr>`;
            }).join('');
            const ketK = nK < kolomSemua.length ? ` Menampilkan K${kolom[0].no}–K${kolom[kolom.length - 1].no} dari ${kolomSemua.length} kumpulan.` : '';
            badan = `<div class="card tbl-card"><div class="tbl-wrap tbl-satu"><table class="tbl-iuran"><thead><tr>
                <th class="c-nama">Nama (RT)</th>${kepala}<th class="r c-sum">Iuran</th></tr></thead>
                <tbody>${baris}</tbody></table></div>
                <p class="small muted pad-note">K = kumpulan RW. ✓ lunas · ◐ sebagian · ✕ belum bayar · – belum ditagih. Kolom berwarna = kumpulan berjalan. Klik angka iuran untuk rincian setoran.${ketK}</p></div>`;
        }

        $('#riOut').innerHTML = `
            <div class="subtabs">${tabRt}</div>
            <div class="grid cols-4 grid-stats">
                <div class="stat good"><small>Lunas</small><b>${s.lunas || 0}</b></div>
                <div class="stat warn"><small>Sebagian</small><b>${s.sebagian || 0}</b></div>
                <div class="stat bad"><small>Belum bayar</small><b>${s.belum || 0}</b></div>
                <div class="stat"><small>Iuran / kumpulan</small><b>${rp(r.nominal || 0)}</b></div></div>
            <div class="card">
                <p class="small mb-md">Status tiap kumpulan RW (K1, K2, K3, …) per warga. Alokasi pembayaran ke kumpulan tertua lebih dulu.</p>
                <div class="filters">
                    <div class="grow"><label class="f" for="riCari">Cari nama</label><input id="riCari" placeholder="Nama" value="${esc(RI.q)}" data-input="riwCari" maxlength="60"></div>
                    <div><label class="f" for="riSt">Status kumpulan berjalan</label><select id="riSt" data-change="riwStatus">
                        ${[['', 'Semua'], ['belum', 'Belum bayar'], ['sebagian', 'Sebagian'], ['lunas', 'Lunas']].map(([v, l]) => `<option value="${v}" ${RI.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                </div>
            </div>
            ${pg.bar}
            ${badan}`;
    }

    App.actions.riwRt = (el) => { RI.rt = el.dataset.nilai; return muatRiwayat(); };
    App.changes.riwStatus = (el) => { RI.status = el.value; App.pgReset('riwayatiuran'); gambarRiwayat(); };
    App.changes.riwCari = (inp) => {
        RI.q = inp.value;
        App.pgReset('riwayatiuran');
        gambarRiwayat();
        const e = $('#riCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    };
    App.actions.riwDetail = (el) => {
        const w = RI.data && RI.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w) return;
        const baris = (w.setoran_semua || []).map((x) => `<tr><td>${esc(riTgl(x.tanggal))}</td><td class="r num">${rp(x.nominal)}</td></tr>`).join('');
        App.dialog(`
            <h3>Setoran iuran — ${esc(w.nama)} (RT ${esc(w.rt)})</h3>
            <p class="small muted mb-md">Total iuran <b>${rp(w.total_setor)}</b>${w.kurang > 0 ? ` · tunggakan <b>${rp(w.kurang)}</b>` : w.lebih > 0 ? ` · titipan <b>${rp(w.lebih)}</b>` : ''}.</p>
            <div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th></tr></thead><tbody>
            ${baris || '<tr><td colspan="2" class="muted">Belum ada setoran.</td></tr>'}</tbody></table></div>
            <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Tutup</button></div>`);
    };
    let riUkuran = null;
    window.addEventListener('resize', () => {
        clearTimeout(riUkuran);
        riUkuran = setTimeout(() => {
            const key = window.innerWidth <= 640 ? 'm' : Math.floor(window.innerWidth / 40);
            const mengetik = document.activeElement && document.activeElement.matches && document.activeElement.matches('input');
            if (KS.mode === 'iuran' && RI.data && $('#riOut') && key !== RI.ukuranKey && !mengetik) gambarRiwayat();
        }, 200);
    });

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
                <div class="row mt-md">${status}<span class="small muted">Tarif ${rp(d.tarif_harian)}/hari · dihitung sejak ${App.tglId(d.mulai)}</span></div>
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
                <p class="small muted mb-md">3 bulan terakhir. Hijau = sudah setor, merah = belum setor.</p>
                ${App.kalenderHtml(d, false)}
                <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>`);
        } catch (e) {
            App.closeDialog();
            App.fail(e);
        }
    };
})();
