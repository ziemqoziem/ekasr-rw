/* Halaman Tabungan Warga: per periode kumpulan RW (tiap Selasa Kliwon, 35 hari). Model sama dengan Iuran Wajib, tanpa tagihan:
   warga yang "ikut tabungan" menyetor nominal bebas; saldo = setoran − penarikan. Bukan pemasukan kas RW. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const TS = (App.stTabungan = { periode: '', rt: '', status: '', q: '', tanggal: '', data: null, nominal: new Map(), tab: 'papan', urut: 'saldo_desc' });
    const RTS = ['007', '008', '009'];
    const DEF = 5000;                                   // nominal isian cepat (seperti setor jimpitan)
    const LABEL = { sudah: 'Sudah menabung', belum: 'Belum menabung' };
    const RWK = { sudah: 'lunas', belum: 'belum' };      // kelas warna chip (dipakai ulang dari Iuran)
    const SIM = { sudah: '✓', belum: '–' };
    const kom = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}rb` : rp(n));
    const sudahSetor = (w) => w.status === 'sudah';

    App.views.tabungan = async (root) => {
        if (!App.has('tabungan.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        if (!TS.tanggal) TS.tanggal = App.today();
        if (App.rtKunci()) TS.rt = App.user.rt || '';
        const tulis = App.has('tabungan.tulis');
        root.innerHTML = `
            <h2 class="title">Tabungan Warga</h2>
            ${tabs()}
            <div id="tPapan" ${TS.tab === 'rekap' ? 'hidden' : ''}>
            <div id="tRingkas"></div>
            ${App.rtKunci() || !tulis ? `<p class="small hint-rt">${App.rtKunci() ? `<b>Menampilkan warga RT ${esc(App.user.rt || '')} saja.</b> ` : ''}${tulis ? '' : '<b>Anda hanya dapat melihat.</b> Pencatatan tabungan dilakukan Pengurus RT.'}</p>` : ''}
            <div class="card">
                <div class="filters">
                    <div class="full-m" id="tPerWrap"></div>
                    <div><label class="f" for="tSt">Status</label><select id="tSt" data-change="tabunganFilter">
                        ${[['', 'Semua'], ['belum', 'Belum menabung'], ['sudah', 'Sudah menabung']].map(([v, l]) => `<option value="${v}" ${TS.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                    <div><label class="f" for="tCari">Cari nama</label><input id="tCari" placeholder="Ketik nama…" value="${esc(TS.q)}" data-input="tabunganCari" maxlength="60"></div>
                    ${tulis ? `<div><label class="f" for="tTgl">Tanggal setor</label><input type="date" id="tTgl" value="${esc(TS.tanggal)}" max="${App.today()}" data-change="tabunganTgl"></div>` : ''}
                </div>
            </div>
            <div class="savebar savebar-atas" id="tBar"></div>
            <div id="tPg"></div>
            <div id="tList" class="list"></div>
            </div>
            <div id="tRekap" ${TS.tab === 'rekap' ? '' : 'hidden'}></div>`;
        await muat();
    };

    function tabs() {
        const kunci = App.rtKunci();
        const daftar = kunci ? [[TS.rt, 'RT ' + TS.rt]] : [['', 'Semua RT'], ...RTS.map((r) => [r, 'RT ' + r])];
        return `<div class="subtabs">${daftar.map(([v, l]) => `<button class="tab ${TS.tab === 'papan' && TS.rt === v ? 'active' : ''}" data-act="tabunganTab" data-nilai="${v}">${l}</button>`).join('')}
            <button class="tab ${TS.tab === 'rekap' ? 'active' : ''}" data-act="tabunganTab" data-nilai="rekap">Rekap</button></div>`;
    }
    App.actions.tabunganTab = (el) => {
        const v = el.dataset.nilai;
        if (v === 'rekap') { TS.tab = 'rekap'; if (!App.rtKunci()) TS.rt = ''; }
        else { TS.tab = 'papan'; TS.rt = v; App.pgReset('tabungan'); }
        return App.render();
    };

    async function muat() {
        const l = $('#tList');
        if (l) l.innerHTML = App.loading();
        TS.nominal.clear();
        const r = await App.api('/api/tabungan?' + App.qs({ periode: TS.periode, rt: TS.rt }));
        TS.data = r;
        TS.periode = r.periode.mulai;
        const wrap = $('#tPerWrap');
        if (wrap) wrap.innerHTML = App.htmlKPick({ id: 'tPer', label: 'Kumpulan RW', change: 'tabunganFilter', value: TS.periode, items: App.kPickItems(r.periode_daftar, 'mulai') });
        App.pgReset('tabungan');
        if (TS.tab === 'rekap') gambarRekap(); else tampil();
    }

    function tampil() {
        const r = TS.data;
        if (!r || !$('#tList')) return;
        App.pgRedraw.tabungan = tampil;
        const s = r.ringkasan;
        $('#tRingkas').innerHTML = `<div class="grid cols-4 grid-stats">
            <div class="stat good"><small>Sudah menabung</small><b>${s.sudah}</b></div>
            <div class="stat bad"><small>Belum menabung</small><b>${s.belum}</b></div>
            <div class="stat"><small>Disetor kumpulan ini</small><b>${rp(s.setor_periode)}</b></div>
            <div class="stat"><small>Total saldo tabungan</small><b>${rp(s.saldo_total)}</b></div></div>
            <p class="small muted mb-md">Tabungan adalah titipan warga, <b>bukan</b> pemasukan kas RW. Penarikan periode ini: <b>${rp(s.tarik_periode)}</b></p>`;
        const cari = ($('#tCari').value || '').trim().toLowerCase();
        const rows = r.warga.filter((w) => (!cari || w.nama.toLowerCase().includes(cari)) && (!TS.status || w.status === TS.status));
        const pg = App.paginate('tabungan', rows);
        TS.pgHtml = pg.bar;
        const tulis = App.has('tabungan.tulis');
        $('#tPg').innerHTML = tulis ? '' : pg.bar;
        const bisaPilih = rows.filter((w) => !sudahSetor(w));
        const semuaDipilih = bisaPilih.length > 0 && bisaPilih.every((w) => TS.nominal.has(w.id));
        const kolomSemua = r.kolom || [];
        TS.ukuranKey = window.innerWidth <= 640 ? 'm' : Math.floor(window.innerWidth / 40);

        const isiNominal = (w) => `<input type="number" inputmode="numeric" min="1" step="1" placeholder="Rp 0" aria-label="Nominal tabungan ${esc(w.nama)}" data-input="tabunganNominal" data-id="${w.id}" value="${TS.nominal.get(w.id) || ''}">
            <button class="btn sm" data-act="tabunganTambahDef" data-id="${w.id}" title="Tambah ${rp(DEF)}">+${kom(DEF)}</button>
            <button class="btn sm primary" data-act="tabunganSimpanSatu" data-id="${w.id}">Simpan</button>
            <button class="btn sm ghost" data-act="tabunganBatalPilih" data-id="${w.id}">Batal</button>`;
        const tombolAwal = (w) => `<button class="btn sm" data-act="tabunganIsiDef" data-id="${w.id}" title="Isi ${rp(DEF)}">+${kom(DEF)}</button>
            <button class="btn sm ghost" data-act="tabunganTambah" data-id="${w.id}">+ Tambah</button>
            <button class="btn sm ghost" data-act="tabunganTarik" data-id="${w.id}" ${w.saldo > 0 ? '' : 'disabled'} title="Tarik tabungan">Tarik</button>`;

        if (window.innerWidth <= 640) {
            const kartu = pg.items.map((w) => {
                const kunci = sudahSetor(w), dipilih = TS.nominal.has(w.id);
                const chip = w.riwayat.map((h, i) => `<span class="iu-k rw-${RWK[h.status]}${kolomSemua[i] && kolomSemua[i].terpilih ? ' sel' : ''}" title="${esc(tgl(h.mulai))}: ${h.nominal ? rp(h.nominal) : 'belum menabung'}">K${kolomSemua[i] ? kolomSemua[i].no : i + 1} ${SIM[h.status]}</span>`).join('');
                const aksi = !tulis ? '' : `<div class="iu-aksi">${dipilih ? isiNominal(w) : `<span class="small muted">${kunci ? 'Sudah menabung ' + rp(w.setor_periode) : 'Belum menabung'}</span>${tombolAwal(w)}`}</div>`;
                return `<div class="iu-card st-${kunci ? 'lunas' : 'belum'}${kunci ? ' terbayar' : ''}${dipilih ? ' dipilih' : ''}" data-row="${w.id}">
                    <div class="iu-top">
                        ${tulis ? `<input type="checkbox" data-change="tabunganCek" data-id="${w.id}" aria-label="Setor tabungan ${esc(w.nama)}" ${kunci || dipilih ? 'checked' : ''} ${kunci ? 'disabled' : ''}>` : ''}
                        <div class="iu-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span><div class="small muted">${esc(LABEL[w.status])}</div></div>
                        <button class="link-setor iu-sum" data-act="tabunganRiwayat" data-id="${w.id}"><small>Saldo</small>${rp(w.saldo)}</button>
                    </div>
                    <div class="iu-riw">${chip}</div>${aksi}</div>`;
            }).join('');
            $('#tList').innerHTML = rows.length ? `<div class="iu-m">
                ${tulis ? `<label class="iu-all"><input type="checkbox" data-change="tabunganCekSemua" ${semuaDipilih ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'}> Centang semua yang belum menabung (${bisaPilih.length})</label>` : ''}
                ${kartu}<p class="small muted pad-sm">K = kumpulan RW. ✓ menabung · – belum menabung. Warna menyala = kumpulan terpilih. Ketuk saldo untuk riwayat.</p></div>`
                : vKosong();
            barSimpan();
            return;
        }
        const lebar = ($('#tList') && $('#tList').clientWidth) || window.innerWidth;
        const tetap = (tulis ? 40 : 0) + 150 + 110 + (tulis ? 260 : 0);
        const maxK = Math.max(lebar < 600 ? 2 : 3, Math.floor((lebar - tetap) / 34));
        const nK = Math.min(kolomSemua.length, maxK);
        const mulaiK = Math.max(0, kolomSemua.length - nK);   // kolom terakhir = kumpulan terpilih
        const kolom = kolomSemua.slice(mulaiK);
        const baris = pg.items.map((w) => {
            const kunci = sudahSetor(w), dipilih = TS.nominal.has(w.id);
            const sel_ = w.riwayat.slice(mulaiK).map((h, i) => `<td class="c-per${kolom[i] && kolom[i].terpilih ? ' sel' : ''}"><span class="rw rw-${RWK[h.status]}" title="K${kolom[i] ? kolom[i].no : ''} · ${esc(tgl(h.mulai))}: ${h.nominal ? rp(h.nominal) : 'belum menabung'}">${SIM[h.status]}</span></td>`).join('');
            const cek = tulis ? `<td class="c-cek"><input type="checkbox" data-change="tabunganCek" data-id="${w.id}" aria-label="Setor tabungan ${esc(w.nama)}" ${kunci || dipilih ? 'checked' : ''} ${kunci ? 'disabled title="Sudah menabung pada kumpulan ini"' : ''}></td>` : '';
            const nom = !tulis ? '' : `<td class="c-nom">${dipilih ? isiNominal(w) : tombolAwal(w)}</td>`;
            return `<tr class="st-${kunci ? 'lunas' : 'belum'}${kunci ? ' terbayar' : ''}${dipilih ? ' dipilih' : ''}" data-row="${w.id}">${cek}
                <td class="c-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span></td>${sel_}
                <td class="r num c-sum"><button class="link-setor" data-act="tabunganRiwayat" data-id="${w.id}" title="Lihat riwayat / batalkan">${rp(w.saldo)}</button></td>${nom}</tr>`;
        }).join('');
        const kepalaPer = kolom.map((k) => `<th class="c-per${k.terpilih ? ' sel' : ''}" title="Kumpulan ke-${k.no} · ${esc(tgl(k.mulai))}">K${k.no}</th>`).join('');
        $('#tList').innerHTML = rows.length ? `<div class="card tbl-card"><div class="tbl-wrap tbl-satu"><table class="tbl-iuran"><thead><tr>
            ${tulis ? `<th class="c-cek"><input type="checkbox" data-change="tabunganCekSemua" aria-label="Centang semua yang belum menabung" ${semuaDipilih ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'}></th>` : ''}
            <th class="c-nama">Nama (RT)</th>${kepalaPer}<th class="r c-sum">Saldo</th>${tulis ? '<th class="c-nom r">Setoran (Rp)</th>' : ''}</tr></thead>
            <tbody>${baris}</tbody></table></div>
            <p class="small muted pad-note">K = kumpulan RW. ✓ menabung · – belum menabung. Kolom berwarna = kumpulan terpilih. Klik angka di kolom “Saldo” untuk riwayat, pembatalan, atau penarikan.</p></div>`
            : vKosong();
        barSimpan();
    }

    // Kosong: belum ada warga yang ikut tabungan (atau filter tidak cocok)
    function vKosong() {
        const ada = TS.data && TS.data.warga.length;
        return `<div class="card empty">${ada ? 'Tidak ada warga yang cocok dengan filter.' : 'Belum ada warga yang ikut tabungan.<br><span class="small">Centang “Tabungan” pada data warga untuk memasukkannya ke papan ini.</span>'}${!ada && App.has('warga.lihat') ? '<br><button class="btn primary mt-md" data-act="go" data-tab="warga">Buka menu Warga</button>' : ''}</div>`;
    }

    function barSimpan() {
        const bar = $('#tBar');
        if (!bar) return;
        if (!App.has('tabungan.tulis') || !TS.data) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
        bar.style.display = '';
        let n = 0, total = 0;
        for (const v of TS.nominal.values()) if (v > 0) { n += 1; total += v; }
        const belum = TS.data.warga.filter((w) => !sudahSetor(w)).length;
        bar.innerHTML = `
            ${TS.pgHtml ? `<div class="savebar-pg">${TS.pgHtml}</div>` : ''}
            <div class="row gap-sm"><span class="badge blue"><b>${n}</b> warga dicentang</span><span class="font-total">${rp(total)}</span></div>
            <div class="row">
                <button class="btn sm" data-act="tabunganIsiSemua" ${belum ? '' : 'disabled'}>Centang semua belum menabung (${belum})</button>
                <button class="btn sm ghost" data-act="tabunganReset" ${n ? '' : 'disabled'}>Reset</button>
                <button class="btn primary" data-act="tabunganSimpan" ${n ? '' : 'disabled'}>Simpan</button>
            </div>`;
    }

    let ukuranT = null;
    window.addEventListener('resize', () => {
        clearTimeout(ukuranT);
        ukuranT = setTimeout(() => {
            const key = window.innerWidth <= 640 ? 'm' : Math.floor(window.innerWidth / 40);
            const mengetik = document.activeElement && document.activeElement.matches && document.activeElement.matches('input');
            if (TS.data && TS.tab === 'papan' && $('#tList') && $('#tList').children.length && key !== TS.ukuranKey && !mengetik) tampil();
        }, 200);
    });
    App.changes.tabunganFilter = async () => {
        TS.periode = App.kPickVal(TS.tab === 'rekap' ? 'tkPer' : 'tPer') || TS.periode;
        if ($('#tSt')) TS.status = $('#tSt').value;
        await muat();
    };
    App.changes.tabunganTgl = () => { TS.tanggal = $('#tTgl').value || App.today(); };
    App.changes.tabunganCari = () => { TS.q = $('#tCari').value; App.pgReset('tabungan'); tampil(); };

    const cari = (id) => TS.data.warga.find((x) => x.id === Number(id));
    const fokus = (id) => { const inp = $(`input[data-input="tabunganNominal"][data-id="${id}"]`); if (inp) { inp.focus(); inp.select(); } };
    App.changes.tabunganCek = (cb) => {
        const id = Number(cb.dataset.id);
        if (cb.checked) TS.nominal.set(id, DEF); else TS.nominal.delete(id);
        tampil();
    };
    App.changes.tabunganCekSemua = (cb) => {
        const q = ($('#tCari').value || '').trim().toLowerCase();
        for (const w of TS.data.warga) {
            if (q && !w.nama.toLowerCase().includes(q)) continue;
            if (TS.status && w.status !== TS.status) continue;
            if (sudahSetor(w)) continue;
            if (cb.checked) TS.nominal.set(w.id, DEF); else TS.nominal.delete(w.id);
        }
        tampil();
    };
    App.actions.tabunganTambah = (el) => { TS.nominal.set(Number(el.dataset.id), 0); tampil(); fokus(el.dataset.id); };
    App.actions.tabunganIsiDef = (el) => { TS.nominal.set(Number(el.dataset.id), DEF); tampil(); fokus(el.dataset.id); };
    // Tambah isian cepat di atas nominal yang sudah ada
    App.actions.tabunganTambahDef = (el) => {
        const id = Number(el.dataset.id);
        const inp = $(`input[data-input="tabunganNominal"][data-id="${id}"]`);
        const cur = Math.floor(Number(inp ? inp.value : TS.nominal.get(id))) || 0;
        TS.nominal.set(id, cur + DEF);
        tampil();
        fokus(id);
    };
    App.changes.tabunganNominal = (inp) => {
        const id = Number(inp.dataset.id);
        const v = Math.floor(Number(inp.value));
        if (v > 0) TS.nominal.set(id, v); else TS.nominal.set(id, 0);
        barSimpan();
    };
    App.actions.tabunganIsiSemua = () => {
        for (const w of TS.data.warga) if (!sudahSetor(w)) TS.nominal.set(w.id, DEF);
        tampil();
    };
    App.actions.tabunganReset = () => { TS.nominal.clear(); tampil(); };
    App.actions.tabunganBatalPilih = (el) => { TS.nominal.delete(Number(el.dataset.id)); tampil(); };

    async function kirim(items, abaikan) {
        return App.api('/api/tabungan-massal', { method: 'POST', body: { tanggal: TS.tanggal, items, abaikan_duplikat: !!abaikan } });
    }
    async function simpan(items) {
        const nama = new Map(TS.data.warga.map((w) => [w.id, w.nama]));
        const r = await kirim(items, false);
        const dup = r.gagal.filter((g) => g.kode === 'DUPLIKAT');
        const lain = r.gagal.filter((g) => g.kode !== 'DUPLIKAT');
        let ok = r.tersimpan, total = r.total;
        if (dup.length && window.confirm(`${dup.length} setoran tampak ganda (warga, tanggal, nominal sama):\n${dup.slice(0, 6).map((g) => '• ' + (nama.get(Number(g.warga_id)) || g.warga_id)).join('\n')}\n\nTetap simpan?`)) {
            const ids = new Set(dup.map((g) => Number(g.warga_id)));
            const r2 = await kirim(items.filter((i) => ids.has(i.warga_id)), true);
            ok += r2.tersimpan; total += r2.total; lain.push(...r2.gagal);
        }
        if (ok) App.toast(`${ok} setoran tabungan tersimpan (${rp(total)}).`);
        if (lain.length) App.toast(lain.slice(0, 3).map((g) => `${nama.get(Number(g.warga_id)) || g.warga_id}: ${g.alasan}`).join(' | '), 'err');
        await muat();
    }
    App.actions.tabunganSimpanSatu = async (el) => {
        const id = Number(el.dataset.id);
        const inp = $(`input[data-input="tabunganNominal"][data-id="${id}"]`);
        const nom = Math.floor(Number(inp ? inp.value : TS.nominal.get(id)));
        if (!(nom > 0)) { App.toast('Isi nominal terlebih dahulu.', 'err'); return; }
        el.disabled = true;
        const lain = [...TS.nominal.entries()].filter(([k]) => k !== id);
        try {
            await simpan([{ warga_id: id, nominal: nom }]);
            for (const [k, v] of lain) { const w = cari(k); if (w && !sudahSetor(w)) TS.nominal.set(k, v); }
            tampil();
        } finally { el.disabled = false; }
    };
    App.actions.tabunganSimpan = async (btn) => {
        const items = [...TS.nominal.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ warga_id: id, nominal: v }));
        if (!items.length) { App.toast('Isi nominal terlebih dahulu.', 'err'); return; }
        btn.disabled = true;
        try { await simpan(items); } finally { btn.disabled = false; }
    };

    // Riwayat transaksi satu warga (+ batalkan)
    App.actions.tabunganRiwayat = async (el) => {
        const r = await App.api('/api/tabungan?warga_id=' + encodeURIComponent(el.dataset.id));
        const tulis = App.has('tabungan.tulis');
        const baris = r.transaksi.map((x) => `<tr class="${x.status === 'batal' ? 'batal' : ''}"><td>${esc(tgl(x.tanggal))}</td>
            <td>${x.jenis === 'tarik' ? '<span class="badge red">Tarik</span>' : '<span class="badge green">Setor</span>'}${x.status === 'batal' ? ` <span class="badge">batal</span><div class="small muted">${esc(x.alasan_batal || '')}</div>` : ''}</td>
            <td class="r num">${x.jenis === 'tarik' ? '− ' : ''}${rp(x.nominal)}</td>
            ${tulis ? `<td class="r">${x.status === 'sah' ? `<button class="btn sm danger" data-act="tabunganBatal" data-id="${esc(x.id)}" data-nama="${esc(r.warga.nama)}">Batalkan</button>` : ''}</td>` : ''}</tr>`).join('');
        App.dialog(`
            <h3>Tabungan — ${esc(r.warga.nama)} (RT ${esc(r.warga.rt)})</h3>
            <div class="grid cols-3 grid-stats mb-md">
                <div class="stat good"><small>Saldo</small><b>${rp(r.saldo)}</b></div>
                <div class="stat"><small>Total setor</small><b>${rp(r.setor)}</b></div>
                <div class="stat"><small>Total tarik</small><b>${rp(r.tarik)}</b></div></div>
            <div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th class="r">Nominal</th>${tulis ? '<th></th>' : ''}</tr></thead><tbody>
            ${baris || `<tr><td colspan="4" class="muted">Belum ada transaksi.</td></tr>`}</tbody></table></div>
            <div class="dlg-actions">${tulis && r.saldo > 0 ? `<button type="button" class="btn" data-act="tabunganTarik" data-id="${r.warga.id}">Tarik tabungan</button>` : ''}<button type="button" class="btn" data-act="closeDialog">Tutup</button></div>`);
    };

    App.actions.tabunganTarik = (el) => {
        const w = cari(el.dataset.id);
        const saldo = w ? w.saldo : 0;
        const nama = w ? w.nama : '';
        App.dialog(`
            <h3>Tarik tabungan</h3>
            <p class="small muted mb-md">${esc(nama)} — saldo tabungan <b>${rp(saldo)}</b>. Penarikan tidak boleh melebihi saldo.</p>
            <form data-form="tabunganTarik" data-id="${esc(el.dataset.id)}">
                <label class="f" for="ttNom">Nominal penarikan (Rp)</label>
                <input id="ttNom" name="nominal" type="number" inputmode="numeric" min="1" max="${saldo}" step="1" required value="${saldo}">
                <label class="f" for="ttTgl">Tanggal</label>
                <input id="ttTgl" name="tanggal" type="date" required value="${esc(App.today())}" max="${App.today()}">
                <label class="f" for="ttCat">Catatan (opsional)</label>
                <input id="ttCat" name="catatan" maxlength="255" placeholder="mis. untuk keperluan sekolah">
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Kembali</button><button type="submit" class="btn primary">Tarik</button></div>
            </form>`);
    };
    App.forms.tabunganTarik = async (f) => {
        await App.api('/api/tabungan', { method: 'POST', body: { warga_id: Number(f.dataset.id), jenis: 'tarik', nominal: Number(f.nominal.value), tanggal: f.tanggal.value, catatan: f.catatan.value } });
        App.closeDialog();
        App.toast('Penarikan tabungan tersimpan.');
        await muat();
    };

    App.actions.tabunganBatal = (el) => {
        App.dialog(`
            <h3>Batalkan transaksi tabungan</h3>
            <p class="muted small mb-md">${esc(el.dataset.nama)} — tidak dihapus, hanya ditandai batal dan tercatat di log. Saldo dihitung ulang otomatis.</p>
            <form data-form="tabunganBatal" data-id="${esc(el.dataset.id)}">
                <label class="f" for="tbAlasan">Alasan pembatalan</label>
                <input id="tbAlasan" name="alasan" required minlength="3" maxlength="255" placeholder="mis. salah catat">
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Kembali</button><button type="submit" class="btn danger">Batalkan</button></div>
            </form>`);
    };
    App.forms.tabunganBatal = async (f) => {
        await App.api('/api/tabungan', { method: 'PUT', body: { id: f.dataset.id, alasan: f.alasan.value } });
        App.closeDialog();
        App.toast('Transaksi dibatalkan.');
        await muat();
    };

    /* ================= REKAP per kumpulan RW ================= */
    const URUT = [['saldo_desc', 'Saldo ↓'], ['saldo_asc', 'Saldo ↑'], ['nama', 'Nama A–Z']];
    function gambarRekap() {
        const r = TS.data, el = $('#tRekap');
        if (!r || !el) return;
        const p = r.periode;
        const q = TS.q.trim().toLowerCase();
        const rows = r.warga.filter((w) => (w.saldo > 0 || w.setor_periode > 0 || w.tarik_periode > 0) && (!q || w.nama.toLowerCase().includes(q)));
        const grup = new Map();
        for (const w of rows) { if (!grup.has(w.rt)) grup.set(w.rt, []); grup.get(w.rt).push(w); }
        const perRt = new Map();
        for (const w of r.warga) {
            if (!perRt.has(w.rt)) perRt.set(w.rt, { rt: w.rt, setor: 0, tarik: 0, saldo: 0, menabung: 0, warga: 0 });
            const g = perRt.get(w.rt);
            g.setor += w.setor_periode; g.tarik += w.tarik_periode; g.saldo += w.saldo; g.warga += 1; if (w.setor_periode > 0) g.menabung += 1;
        }
        const rtList = [...perRt.values()].sort((a, b) => a.rt.localeCompare(b.rt));
        const s = r.ringkasan;
        const urut = (list) => list.slice().sort((a, b) => (TS.urut === 'saldo_desc' ? b.saldo - a.saldo : TS.urut === 'saldo_asc' ? a.saldo - b.saldo : 0) || a.nama.localeCompare(b.nama, 'id'));
        el.innerHTML = `
            <div class="card">
                <div class="filters"><div class="grow">${App.htmlKPick({ id: 'tkPer', label: 'Kumpulan RW', change: 'tabunganFilter', value: p.mulai, items: App.kPickItems(r.periode_daftar, 'mulai') })}</div></div>
                <p class="small muted mt-sm">Setoran bertanggal <b>${tgl(p.mulai)}</b> s.d. <b>${tgl(p.akhir)}</b> (${esc(App.labelKumpulan(p.no, p.mulai))}).</p>
            </div>
            <div class="rk-baris spaced">
                <div class="stat rk-c0"><small>Disetor kumpulan ini</small><b>${rp(s.setor_periode)}</b><span class="small muted stat-sub">${s.sudah} / ${s.total_warga} warga menabung · tarik ${rp(s.tarik_periode)}</span></div>
                ${rtList.map((g, i) => `<div class="stat rk-c${(i % 3) + 1}"><small>RT ${esc(g.rt)}</small><b>${rp(g.setor)}</b><span class="small muted stat-sub">${g.menabung} / ${g.warga} warga · saldo ${rp(g.saldo)}</span></div>`).join('')}
            </div>
            <h3 class="sec-title">Saldo per warga</h3>
            <div class="card">
                <div class="filters"><div class="grow"><label class="f" for="tkCari">Cari nama</label><input id="tkCari" placeholder="Ketik nama…" value="${esc(TS.q)}" data-input="tabunganRekapCari" maxlength="60"></div>
                    <div><label class="f">Urutkan</label><div class="rk-urut" role="group" aria-label="Urutkan rincian">${URUT.map(([v, l]) => `<button type="button" class="${TS.urut === v ? 'aktif' : ''}" data-act="tabunganUrut" data-nilai="${v}">${l}</button>`).join('')}</div></div></div>
                ${grup.size ? `<div class="rk-kolom" style="--n:${Math.min(3, grup.size)}">
                ${[...grup.entries()].map(([rt, list]) => `<section class="rk-rtcol rk-c${(Math.max(0, rtList.findIndex((g) => g.rt === rt)) % 3) + 1}">
                    <header><b>RT ${esc(rt)}</b><span>${rp(list.reduce((a, w) => a + w.saldo, 0))}</span></header>
                    <ul>${urut(list).map((w) => `<li><span>${esc(w.nama)}</span><b>${rp(w.saldo)}</b></li>`).join('')}</ul>
                    <footer><span>${list.length} warga</span><b>${rp(list.reduce((a, w) => a + w.saldo, 0))}</b></footer></section>`).join('')}
                </div>` : '<div class="empty mt-md">Belum ada tabungan.</div>'}
            </div>`;
    }
    App.actions.tabunganUrut = (el) => { TS.urut = el.dataset.nilai; gambarRekap(); };
    App.changes.tabunganRekapCari = (inp) => {
        TS.q = inp.value;
        gambarRekap();
        const e = $('#tkCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    };
})();
