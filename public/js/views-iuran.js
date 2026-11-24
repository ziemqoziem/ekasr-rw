/* Halaman Iuran Wajib: per periode kumpulan RW (tiap Rabu Legi, 35 hari). Pola pembayaran seperti jimpitan. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const IS = (App.stIuran = { periode: '', rt: '', status: '', q: '', tanggal: '', data: null, nominal: new Map() });
    const LABEL = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum bayar', luar: 'Belum ditagih' };
    const WARNA = { lunas: 'hijau', sebagian: 'berjalan', belum: 'merah', luar: 'luar' };

    App.views.iuran = async (root) => {
        if (!App.has('iuran.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        if (!IS.tanggal) IS.tanggal = App.today();
        if (App.rtKunci()) IS.rt = App.user.rt || '';
        root.innerHTML = `
            <h2 class="title">Iuran Wajib Warga</h2>
            <div id="iRingkas"></div>
            ${App.rtKunci() || !App.has('iuran.tulis') ? `<p class="small" style="margin-bottom:10px">${App.rtKunci() ? `<b>Menampilkan warga RT ${esc(App.user.rt || '')} saja.</b> ` : ''}${App.has('iuran.tulis') ? '' : '<b>Anda hanya dapat melihat.</b> Pencatatan iuran wajib dilakukan Pengurus RT.'}</p>` : ''}
            <div class="card">
                <div class="filters">
                    <div class="full-m"><label class="f" for="iPer">Kumpulan RW (tanggal)</label><select id="iPer" data-change="iuranFilter"></select></div>
                    <div><label class="f" for="iRt">RT</label><select id="iRt" data-change="iuranFilter" ${App.rtKunci() ? 'disabled' : ''}>${App.optRt(IS.rt)}</select></div>
                    <div><label class="f" for="iSt">Status</label><select id="iSt" data-change="iuranFilter">
                        ${[['', 'Semua'], ['belum', 'Belum bayar'], ['sebagian', 'Sebagian'], ['lunas', 'Lunas']].map(([v, l]) => `<option value="${v}" ${IS.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                    <div><label class="f" for="iCari">Cari nama</label><input id="iCari" placeholder="Ketik nama…" value="${esc(IS.q)}" data-input="iuranCari" maxlength="60"></div>
                    ${App.has('iuran.tulis') ? `<div><label class="f" for="iTgl">Tanggal diterima</label><input type="date" id="iTgl" value="${esc(IS.tanggal)}" max="${App.today()}" data-change="iuranTgl"></div>` : ''}
                </div>
            </div>
            <div id="iPg"></div>
            <div id="iList" class="list"></div>
            <div class="savebar" id="iBar"></div>`;
        await muat();
    };

    async function muat() {
        $('#iList').innerHTML = App.loading();
        IS.nominal.clear();
        const r = await App.api('/api/iuran-wajib?' + App.qs({ periode: IS.periode, rt: IS.rt }));
        IS.data = r;
        IS.periode = r.periode.mulai;
        $('#iPer').innerHTML = r.periode_daftar.map((p) => `<option value="${p.mulai}" ${p.mulai === IS.periode ? 'selected' : ''}>${esc(p.weton)}, ${tgl(p.mulai)}${p.berjalan ? ' (berjalan)' : ''}</option>`).join('');
        App.pgReset('iuran');
        tampil();
    }

    function tampil() {
        const r = IS.data;
        if (!r || !$('#iList')) return;
        App.pgRedraw.iuran = tampil;
        if (!r.aktif) {
            $('#iRingkas').innerHTML = '';
            $('#iList').innerHTML = `<div class="card empty">${esc(r.pesan)}${App.can('admin') ? '<br><button class="btn primary" style="margin-top:10px" data-act="go" data-tab="pengaturan">Buka Pengaturan</button>' : ''}</div>`;
            $('#iPg').innerHTML = ''; $('#iBar').innerHTML = '';
            return;
        }
        const s = r.ringkasan;
        $('#iRingkas').innerHTML = `<div class="grid cols-4" style="margin-bottom:12px">
            <div class="stat good"><small>Lunas</small><b>${s.lunas}</b></div>
            <div class="stat warn"><small>Sebagian</small><b>${s.sebagian}</b></div>
            <div class="stat bad"><small>Belum bayar</small><b>${s.belum}</b></div>
            <div class="stat"><small>Diterima untuk kumpulan ini</small><b>${rp(s.total_masuk)}</b></div></div>
            <p class="small muted" style="margin-bottom:12px">Iuran per periode: <b>${rp(r.nominal)}</b> · Total tunggakan (kumpulan sebelumnya yang belum lunas): <b>${rp(s.total_kurang)}</b></p>`;
        const cari = ($('#iCari').value || '').trim().toLowerCase();
        const rows = r.warga.filter((w) => (!cari || w.nama.toLowerCase().includes(cari)) && (!IS.status || w.status === IS.status));
        const pg = App.paginate('iuran', rows);
        $('#iPg').innerHTML = pg.bar;
        const tulis = App.has('iuran.tulis');
        $('#iList').innerHTML = rows.length ? pg.items.map((w) => {
            const chips = w.setoran.map((x) => `<span class="chip ok-chip">${rp(x.nominal)}${tulis ? ` <button class="chip-x" data-act="batalIuran" data-id="${esc(x.id)}" data-nama="${esc(w.nama)}" aria-label="Batalkan">✕</button>` : ''}</span>`).join('');
            const sisa = w.status === 'sebagian' ? ` ${rp(w.dibayar_periode)} dari ${rp(w.nominal)}` : '';
            const info = w.kurang > 0 ? `<span class="badge red">Tunggakan ${rp(w.kurang)} (${w.periode_kurang} periode)</span>`
                : w.lebih > 0 ? `<span class="badge green">Titipan ${rp(w.lebih)}${w.periode_lebih ? ` · ±${w.periode_lebih} periode` : ''}</span>` : '';
            const mini = w.riwayat.map((h) => `<i class="cal-dot cal-${WARNA[h.status]}" title="${esc(tgl(h.mulai))}: ${esc(LABEL[h.status])}"></i>`).join('');
            return `<div class="item st-${w.status}" data-row="${w.id}">
                <div class="grow">
                    <div class="name">${esc(w.nama)} <span class="badge st-badge st-${w.status}">${esc(LABEL[w.status])}${esc(sisa)}</span></div>
                    <div class="meta"><span class="badge">RT ${esc(w.rt)}</span> ${info} <span class="mini-hist" title="6 periode terakhir (lama → baru)">${mini}</span></div>
                    ${chips ? `<div class="chips" style="margin-top:6px">${chips}</div>` : ''}
                </div>
                ${tulis ? `<div class="nominal-box">
                    <input type="number" inputmode="numeric" min="1" step="1" placeholder="Rp 0" aria-label="Nominal iuran ${esc(w.nama)}" data-input="iuranNominal" data-id="${w.id}" value="${IS.nominal.get(w.id) || ''}">
                    <button class="btn sm" data-act="iuranSaran" data-id="${w.id}" title="Isi saran">${w.saran ? '+' + (App.charts ? App.charts.compact(w.saran) : w.saran) : '—'}</button>
                    <button class="btn sm primary" data-act="iuranSetor" data-id="${w.id}">Bayar</button>
                </div>` : ''}
            </div>`;
        }).join('') : '<div class="card empty">Tidak ada warga yang cocok.</div>';
        barSimpan();
    }

    function barSimpan() {
        const bar = $('#iBar');
        if (!bar) return;
        if (!App.has('iuran.tulis') || !IS.data || !IS.data.aktif) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
        bar.style.display = '';
        let n = 0, total = 0;
        for (const v of IS.nominal.values()) if (v > 0) { n += 1; total += v; }
        const belum = IS.data.warga.filter((w) => w.status !== 'lunas' && w.saran > 0).length;
        bar.innerHTML = `
            <div class="row" style="gap:8px"><span class="badge blue"><b>${n}</b> warga dipilih</span>
                <span style="font-weight:700;font-size:1.15rem;font-variant-numeric:tabular-nums">${rp(total)}</span></div>
            <div class="row">
                <button class="btn sm" data-act="iuranIsiSemua" ${belum ? '' : 'disabled'}>Isi saran (${belum})</button>
                <button class="btn sm ghost" data-act="iuranReset" ${n ? '' : 'disabled'}>Reset</button>
                <button class="btn primary" data-act="iuranSimpan" ${n ? '' : 'disabled'}>Simpan</button>
            </div>`;
    }

    App.changes.iuranFilter = async () => {
        IS.periode = $('#iPer').value; if (!App.rtKunci()) IS.rt = $('#iRt').value; IS.status = $('#iSt').value;
        await muat();
    };
    App.changes.iuranTgl = () => { IS.tanggal = $('#iTgl').value || App.today(); };
    App.changes.iuranCari = () => { IS.q = $('#iCari').value; App.pgReset('iuran'); tampil(); };
    App.changes.iuranNominal = (inp) => {
        const v = Math.floor(Number(inp.value));
        if (v > 0) IS.nominal.set(Number(inp.dataset.id), v); else IS.nominal.delete(Number(inp.dataset.id));
        barSimpan();
    };
    App.actions.iuranSaran = (el) => {
        const w = IS.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w || !w.saran) return;
        IS.nominal.set(w.id, w.saran);
        const inp = $(`input[data-input="iuranNominal"][data-id="${w.id}"]`);
        if (inp) inp.value = w.saran;
        barSimpan();
    };
    App.actions.iuranIsiSemua = () => {
        for (const w of IS.data.warga) if (w.status !== 'lunas' && w.saran > 0) IS.nominal.set(w.id, w.saran);
        tampil();
    };
    App.actions.iuranReset = () => { IS.nominal.clear(); tampil(); };

    async function kirim(items, abaikan) {
        return App.api('/api/iuran-wajib-massal', { method: 'POST', body: { tanggal: IS.tanggal, items, abaikan_duplikat: !!abaikan } });
    }
    async function simpan(items) {
        const nama = new Map(IS.data.warga.map((w) => [w.id, w.nama]));
        const r = await kirim(items, false);
        const dup = r.gagal.filter((g) => g.kode === 'DUPLIKAT');
        const lain = r.gagal.filter((g) => g.kode !== 'DUPLIKAT');
        let ok = r.tersimpan, total = r.total;
        if (dup.length && window.confirm(`${dup.length} pembayaran tampak ganda (warga, tanggal, nominal sama):\n${dup.slice(0, 6).map((g) => '• ' + (nama.get(Number(g.warga_id)) || g.warga_id)).join('\n')}\n\nTetap simpan?`)) {
            const ids = new Set(dup.map((g) => Number(g.warga_id)));
            const r2 = await kirim(items.filter((i) => ids.has(i.warga_id)), true);
            ok += r2.tersimpan; total += r2.total; lain.push(...r2.gagal);
        }
        if (ok) App.toast(`${ok} pembayaran iuran tersimpan (${rp(total)}).`);
        if (lain.length) App.toast(lain.slice(0, 3).map((g) => `${nama.get(Number(g.warga_id)) || g.warga_id}: ${g.alasan}`).join(' | '), 'err');
        await muat();
    }
    App.actions.iuranSetor = async (el) => {
        const id = Number(el.dataset.id);
        const w = IS.data.warga.find((x) => x.id === id);
        const nom = IS.nominal.get(id) || (w && w.saran) || 0;
        if (!(nom > 0)) { App.toast('Isi nominal terlebih dahulu.', 'err'); return; }
        el.disabled = true;
        try { await simpan([{ warga_id: id, nominal: nom }]); } finally { el.disabled = false; }
    };
    App.actions.iuranSimpan = async (btn) => {
        const items = [...IS.nominal.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ warga_id: id, nominal: v }));
        if (!items.length) return;
        btn.disabled = true;
        try { await simpan(items); } finally { btn.disabled = false; }
    };

    App.actions.batalIuran = (el) => {
        App.dialog(`
            <h3>Batalkan pembayaran iuran</h3>
            <p class="muted small" style="margin-bottom:12px">${esc(el.dataset.nama)} — tidak dihapus, hanya ditandai batal dan tercatat di log. Alokasi ke periode dihitung ulang otomatis.</p>
            <form data-form="batalIuran" data-id="${esc(el.dataset.id)}">
                <label class="f" for="biAlasan">Alasan pembatalan</label>
                <input id="biAlasan" name="alasan" required minlength="3" maxlength="255" placeholder="mis. salah catat">
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Kembali</button><button type="submit" class="btn danger">Batalkan</button></div>
            </form>`);
    };
    App.forms.batalIuran = async (f) => {
        await App.api('/api/iuran-wajib', { method: 'PUT', body: { id: f.dataset.id, alasan: f.alasan.value } });
        App.closeDialog();
        App.toast('Pembayaran dibatalkan.');
        await muat();
    };
})();
