/* Halaman: Pengaturan (khusus admin) — Akun, Hak Akses, Tarif, Iuran Wajib, Mulai Hitung, Identitas, Log */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const SUB = [
        ['akun', 'Akun & Peran'],
        ['hak', 'Hak Akses Peran'],
        ['tarif', 'Tarif Jimpitan'],
        ['iuran', 'Iuran Wajib'],
        ['saldokas', 'Saldo Awal Kas'],
        ['tahun', 'Mulai Hitung & Tunggakan Lama'],
        ['identitas', 'Identitas'],
        ['log', 'Log Aktivitas']
    ];
    const ST = (App.stPengaturan = { sub: 'akun' });
    let PERAN = [];            // daftar peran dari server (kode, nama, izin, sistem, jumlah_akun)
    let KATALOG = [];
    let ADMIN_WAJIB = [];
    const ROLE_LABEL = new Proxy({}, { get: (_, k) => (PERAN.find((p) => p.kode === k) || {}).nama || App.ROLE_LABEL[k] });
    const perluRt = (kode) => { const p = PERAN.find((x) => x.kode === kode); return !!p && !!p.batas_rt; };

    App.views.pengaturan = async (root) => {
        if (!App.has('sistem.kelola')) { root.innerHTML = '<div class="card empty">Halaman ini khusus admin sistem.</div>'; return; }
        root.innerHTML = `
            <h2 class="title">Pengaturan</h2>
            <div class="subtabs">${SUB.map(([id, l]) => `<button class="tab ${ST.sub === id ? 'active' : ''}" data-act="subPengaturan" data-sub="${id}">${esc(l)}</button>`).join('')}</div>
            <div id="pgBody">${App.loading()}</div>`;
        await SUBVIEW[ST.sub]();
    };
    App.actions.subPengaturan = (el) => { ST.sub = el.dataset.sub; return App.render(); };

    const SUBVIEW = { akun, hak, iuran, saldokas, tarif, tahun, identitas, log };

    /* ---------- Hak akses (ringkasan statis; penegakan ada di API) ---------- */
    async function muatPeran() {
        const r = await App.api('/api/peran');
        PERAN = r.peran; KATALOG = r.katalog; ADMIN_WAJIB = r.admin_wajib || [];
        return r;
    }
    async function hak() {
        const r = await muatPeran();
        const kel = [...new Set(KATALOG.map((k) => k.kelompok))];
        $('#pgBody').innerHTML = `
            <div class="row between mb-md">
                <p class="small muted grow">Atur <b>apa saja yang boleh dilakukan</b> tiap peran. Peran <b>Admin</b> selalu dapat mengakses semua menu (izin melihat & mengelola sistem terkunci). Perubahan berlaku langsung untuk semua akun dengan peran itu. Batas dijaga server, bukan hanya disembunyikan di menu.</p>
                <button class="btn primary" data-act="peranForm">+ Tambah peran</button>
            </div>
            <div class="list">${PERAN.map((p) => `
                <div class="item">
                    <div class="grow"><div class="name">${esc(p.nama)} <span class="small muted">${esc(p.kode)}</span> ${p.sistem ? '<span class="badge">bawaan</span>' : '<span class="badge blue">buatan</span>'} ${p.batas_rt ? '<span class="badge amber">dibatasi RT</span>' : ''}</div>
                    <div class="meta">${esc(p.keterangan || '')} · <b>${p.izin.length}</b> izin · ${p.jumlah_akun} akun</div></div>
                    <div class="row"><button class="btn sm" data-act="peranForm" data-kode="${esc(p.kode)}">Atur hak akses</button>
                    ${p.sistem ? '' : `<button class="btn sm danger" data-act="peranHapus" data-kode="${esc(p.kode)}">Hapus</button>`}</div>
                </div>`).join('')}</div>
            <div class="card mt-lg"><h3>Matriks hak akses</h3><div class="tbl-wrap"><table>
                <thead><tr><th>Izin</th>${PERAN.map((p) => `<th>${esc(p.nama)}</th>`).join('')}</tr></thead><tbody>
                ${kel.map((g) => `<tr><td colspan="${PERAN.length + 1}" class="muted"><b>${esc(g)}</b></td></tr>` + KATALOG.filter((k) => k.kelompok === g).map((k) =>
                    `<tr><td>${esc(k.label)}${k.info ? `<div class="small muted">${esc(k.info)}</div>` : ''}</td>${PERAN.map((p) => `<td>${p.izin.includes(k.izin) ? '<span class="badge green">✔</span>' : '<span class="badge">—</span>'}</td>`).join('')}</tr>`).join('')).join('')}
                </tbody></table></div></div>`;
    }
    App.actions.peranForm = (el) => {
        const p = el.dataset.kode ? PERAN.find((x) => x.kode === el.dataset.kode) : null;
        const v = p || { kode: '', nama: '', keterangan: '', izin: [] };
        const kel = [...new Set(KATALOG.map((k) => k.kelompok))];
        App.dialog(`
            <h3>${p ? 'Hak akses: ' + esc(p.nama) : 'Tambah peran'}</h3>
            <form data-form="peran" data-kode="${esc(v.kode)}" data-baru="${p ? '' : '1'}">
                <div class="form-grid">
                    <div><label class="f" for="prK">Kode peran</label><input id="prK" name="kode" value="${esc(v.kode)}" ${p ? 'readonly' : 'required'} pattern="[a-z][a-z0-9_]{2,39}" maxlength="40" placeholder="mis. sekretaris"></div>
                    <div><label class="f" for="prN">Nama peran</label><input id="prN" name="nama" value="${esc(v.nama)}" required minlength="3" maxlength="80"></div>
                    <div class="full"><label class="f" for="prT">Keterangan</label><input id="prT" name="keterangan" value="${esc(v.keterangan || '')}" maxlength="255"></div>
                    <div class="full"><label class="f" for="prD">Pengeluaran yang dicatat peran ini diambil dari dana</label><select id="prD" name="dana_pengeluaran">
                        ${[['umum', 'Umum (tidak dikaitkan ke satu dana)'], ['jimpitan', 'Dana Jimpitan'], ['iuran_wajib', 'Dana Iuran Wajib']].map(([k, l]) => `<option value="${k}" ${(v.dana_pengeluaran || 'umum') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                        <p class="small muted mt-sm">Berlaku bila peran ini diberi izin mencatat pengeluaran. Peran dengan izin buku kas melihat semua pengeluaran; peran lain hanya yang dari dananya.</p></div>
                    <div class="full row gap-sm pad-sm"><input type="checkbox" id="prRt" name="batas_rt" ${v.batas_rt ? 'checked' : ''} ${v.kode === 'admin' ? 'disabled' : ''}>
                        <label for="prRt"><b>Dibatasi per RT</b> — akun berperan ini hanya mengakses data warga, iuran, dan pemasukan lainnya di <b>RT pada akunnya</b> (RT wajib diisi di akun).</label></div>
                    <div class="full">${kel.map((g) => `<div class="izin-kel"><b class="small">${esc(g)}</b></div>` + KATALOG.filter((k) => k.kelompok === g).map((k) =>
                        `<label class="row izin-row"><input type="checkbox" name="izin" value="${k.izin}" data-change="peranIzin" ${v.izin.includes(k.izin) || (v.kode === 'admin' && ADMIN_WAJIB.includes(k.izin)) ? 'checked' : ''}${v.kode === 'admin' && ADMIN_WAJIB.includes(k.izin) ? ' disabled' : ''}>
                        <span>${esc(k.label)}${k.info ? `<span class="small muted"> — ${esc(k.info)}</span>` : ''}</span></label>`).join('')).join('')}</div>
                </div>
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Batal</button><button type="submit" class="btn primary">Simpan</button></div>
            </form>`);
    };
    // Mencatat ⇒ otomatis bisa melihat; mencabut "lihat" ⇒ mencabut izin yang bergantung padanya
    App.changes.peranIzin = (cb) => {
        const dep = { 'jimpitan.tulis': ['jimpitan.lihat'], 'iuran.tulis': ['iuran.lihat'], 'sewa.tulis': ['sewa.lihat'], 'pengeluaran.tulis': ['pengeluaran.lihat'],
            'warga.kelola': ['warga.lihat'], 'tutupbuku.tulis': ['kas.lihat'], 'tutupbuku.buka': ['kas.lihat'], 'saldokas.kelola': ['kas.lihat'] };
        const f = cb.form;
        const el = (i) => f.querySelector(`input[name=izin][value="${i}"]`);
        if (cb.checked) (dep[cb.value] || []).forEach((d) => { if (el(d)) el(d).checked = true; });
        else Object.entries(dep).forEach(([k, ds]) => { if (ds.includes(cb.value) && el(k) && !el(k).disabled) el(k).checked = false; });
    };
    App.forms.peran = async (f) => {
        const izin = [...f.querySelectorAll('input[name=izin]:checked, input[name=izin]:disabled')].map((i) => i.value);
        const body = { kode: f.kode.value, nama: f.nama.value, keterangan: f.keterangan.value, izin, batas_rt: f.batas_rt.checked, dana_pengeluaran: f.dana_pengeluaran.value };
        await App.api('/api/peran', { method: f.dataset.baru ? 'POST' : 'PUT', body });
        App.closeDialog();
        App.toast('Hak akses peran disimpan.');
        // jika peran sendiri berubah, perbarui izin di sesi ini
        try { const me = await App.api('/api/me'); App.user = me.user; } catch (_) { /* abaikan */ }
        await hak();
        App.render();
    };
    App.actions.peranHapus = async (el) => {
        if (!window.confirm(`Hapus peran "${el.dataset.kode}"? Hanya bisa bila tidak ada akun yang memakainya.`)) return;
        await App.api('/api/peran?kode=' + encodeURIComponent(el.dataset.kode), { method: 'DELETE' });
        App.toast('Peran dihapus.');
        await hak();
    };

    /* ---------- Iuran wajib: nominal per periode + tanggal mulai penagihan ---------- */
    async function iuran() {
        const [rt, rp0] = await Promise.all([App.api('/api/tarif-iuran'), App.api('/api/pengaturan')]);
        const p = rp0.pengaturan;
        const hariIni = App.today();
        const berlaku = rt.tarif.filter((t) => App.ymd(t.berlaku_mulai) <= hariIni)[0];
        $('#pgBody').innerHTML = `
            <div class="grid cols-4 mb-lg">
                <div class="stat ${berlaku ? 'good' : 'warn'}"><small>Iuran per periode (berlaku)</small><b>${berlaku ? rp(berlaku.nominal) : 'Belum diatur'}</b></div>
                <div class="stat ${p.iuran_mulai ? 'good' : 'warn'}"><small>Mulai ditagih</small><b>${p.iuran_mulai ? App.tglId(p.iuran_mulai) : 'Belum diatur'}</b></div>
            </div>
            <div class="card"><h3>Nominal iuran wajib per periode kumpulan</h3>
                <form data-form="tarifIuran"><div class="filters">
                    <div><label class="f" for="tiN">Nominal per periode (Rp)</label><input type="number" id="tiN" name="nominal" min="1" required inputmode="numeric"></div>
                    <div>${App.htmlDPick({ id: 'tiT', name: 'berlaku_mulai', label: 'Berlaku mulai', value: hariIni, required: true })}</div>
                    <div><button class="btn primary" type="submit">Simpan nominal</button></div>
                </div></form>
                <p class="small muted">Satu periode = satu kumpulan RW (<b>Selasa Kliwon</b> / malam Rabu Legi, tiap 35 hari). Bila ada perubahan kebijakan, tambahkan nominal baru dengan tanggal berlaku baru; periode yang sudah berjalan tetap memakai nominal lamanya.</p>
            </div>
            <div class="card"><h3>Mulai penagihan</h3>
                <form data-form="iuranMulai" class="row">
                    <div>${App.htmlDPick({ id: 'imT', name: 'iuran_mulai', label: 'Tagih mulai kumpulan (Selasa Kliwon) pertama pada/setelah tanggal', value: p.iuran_mulai || '' })}</div>
                    <button class="btn" type="submit" class="form-inline-end">Simpan</button>
                </form>
                <p class="small muted">Wajib diisi agar halaman Iuran Wajib aktif. Semua KK aktif wajib membayar; warga yang baru mulai iuran ditagih sejak kumpulan setelah tanggal mulainya.</p>
            </div>
            <div class="card"><h3>Riwayat nominal</h3><div class="tbl-wrap"><table>
                <thead><tr><th class="r">Nominal / periode</th><th>Berlaku mulai</th></tr></thead>
                <tbody>${rt.tarif.map((t) => `<tr><td class="r num">${rp(t.nominal)}</td><td>${App.tglId(t.berlaku_mulai)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Belum ada.</td></tr>'}</tbody>
            </table></div></div>`;
    }
    App.forms.tarifIuran = async (f) => {
        await App.api('/api/tarif-iuran', { method: 'POST', body: { nominal: Number(f.nominal.value), berlaku_mulai: f.berlaku_mulai.value } });
        App.toast('Nominal iuran wajib disimpan.');
        await iuran();
    };
    App.forms.iuranMulai = async (f) => {
        await App.api('/api/pengaturan', { method: 'PUT', body: { iuran_mulai: f.iuran_mulai.value } });
        App.toast('Tanggal mulai penagihan disimpan.');
        await iuran();
    };

    /* ---------- Saldo awal kas: Jimpitan + Kas RW (aset digabung ke Kas RW) ---------- */
    const kasRwDari = (n) => Number(n.iuran_wajib || 0) + Number(n.sewa_aset || 0) + Number(n.umum || 0);
    async function saldokas() {
        const [sa, st] = await Promise.all([App.api('/api/saldo-awal'), App.api('/api/tutup-buku')]);
        const tahunNow = Number(App.today().slice(0, 4));
        const manual = sa.saldo_awal.filter((x) => x.asal === 'manual').sort((a, b) => a.tahun - b.tahun)[0];
        const v = manual ? manual.nominal : {};
        const tahunDefault = manual ? manual.tahun : Math.max(tahunNow, 2026);
        const ditutup = st.tahun_ditutup;
        const terakhir = ditutup.length ? ditutup[ditutup.length - 1] : null;
        $('#pgBody').innerHTML = `
            <div class="card"><h3>Saldo awal kas (hasil tutup buku tahun sebelumnya)</h3>
                <p class="small muted mb-md">Ini <b>dasar Buku Kas</b>: saldo dihitung dari angka ini ditambah pemasukan dan dikurangi pengeluaran sejak 1 Januari tahun buku. Karena aplikasi mulai dipakai tahun 2026,
                isi di sini <b>hasil tutup buku 2025</b> (saldo per 31 Desember 2025) sebagai saldo awal 2026 — cukup dua kantong: <b>Kas Jimpitan</b> dan <b>Kas RW</b> (iuran wajib + pemasukan aset/lainnya digabung). Transaksi sebelum 1 Januari 2026 tidak dihitung ke kas.
                Tahun berikutnya <b>otomatis</b> dari menu <b>Buku Kas → Tutup Buku</b> (Bendahara RW setelah 31 Desember).</p>
                <form data-form="saldoAwal"><div class="form-grid">
                    <div><label class="f" for="saT">Tahun buku (mulai 1 Januari; 2026 = hasil tutup buku 2025)</label><input type="number" id="saT" name="tahun" min="2000" max="2100" value="${tahunDefault}" required data-change="saTahun"></div>
                    <div class="full small muted mt-neg-xs">Saldo awal = saldo per <b>31 Desember <span id="saTh">${tahunDefault - 1}</span></b></div>
                    <div><label class="f" for="saJ">Saldo Kas Jimpitan (Rp)</label><input type="number" id="saJ" name="jimpitan" min="0" inputmode="numeric" value="${v.jimpitan ?? 0}" required></div>
                    <div><label class="f" for="saRw">Saldo Kas RW (Rp)</label><input type="number" id="saRw" name="kas_rw" min="0" inputmode="numeric" value="${kasRwDari(v)}" required>
                        <p class="small muted mt-xs">Termasuk iuran wajib dan akumulasi kas aset / pemasukan lainnya.</p></div>
                    <div class="full"><label class="f" for="saK">Keterangan (opsional)</label><input id="saK" name="keterangan" maxlength="255" placeholder="mis. Berita acara kumpulan RW"></div>
                </div><div class="dlg-actions"><button class="btn primary" type="submit">Simpan saldo awal</button></div></form>
                <p class="small muted">Saldo awal yang sudah berasal dari Tutup Buku atau yang bukunya sudah ditutup tidak dapat diubah di sini.</p>
            </div>
            <div class="card"><h3>Tutup buku</h3>
                <p>Tahun ditutup: <b>${ditutup.length ? ditutup.join(', ') : 'belum ada'}</b>. Tutup buku dilakukan oleh Bendahara RW di menu Buku Kas.</p>
                ${terakhir && App.has('tutupbuku.buka') ? `<button class="btn danger" data-act="bukaTutupBuku" data-tahun="${terakhir}" class="mt-sm">Buka kembali tutup buku ${terakhir}</button>
                <p class="small muted">Hanya tahun terakhir. Saldo awal ${terakhir + 1} hasil tutup buku akan dihapus dan transaksi ${terakhir} dapat dikoreksi lagi.</p>` : ''}
            </div>
            <div class="card"><h3>Riwayat saldo awal</h3><div class="tbl-wrap"><table>
                <thead><tr><th>Tahun</th><th>Asal</th><th class="r">Kas Jimpitan</th><th class="r">Kas RW</th><th class="r">Total</th></tr></thead>
                <tbody>${sa.saldo_awal.map((x) => {
                    const jim = Number(x.nominal.jimpitan || 0);
                    const rw = kasRwDari(x.nominal);
                    return `<tr><td>${x.tahun}</td><td>${x.asal === 'tutup_buku' ? 'Tutup buku' : 'Diisi admin'}</td>
                <td class="r num">${rp(jim)}</td><td class="r num">${rp(rw)}</td><td class="r num"><b>${rp(jim + rw)}</b></td></tr>`;
                }).join('') || '<tr><td colspan="5" class="muted">Belum ada.</td></tr>'}</tbody></table></div></div>`;
    }
    App.changes.saTahun = (el) => {
        const th = $('#saTh');
        if (th) th.textContent = String(Number(el.value) - 1);
    };
    App.forms.saldoAwal = async (f) => {
        await App.api('/api/saldo-awal', { method: 'POST', body: { tahun: Number(f.tahun.value), jimpitan: Number(f.jimpitan.value), kas_rw: Number(f.kas_rw.value), keterangan: f.keterangan.value } });
        App.toast('Saldo awal kas disimpan.');
        await saldokas();
    };
    App.actions.bukaTutupBuku = async (el) => {
        if (!window.confirm(`Buka kembali tutup buku ${el.dataset.tahun}? Saldo awal ${Number(el.dataset.tahun) + 1} hasil tutup buku akan dihapus.`)) return;
        await App.api('/api/tutup-buku?tahun=' + encodeURIComponent(el.dataset.tahun), { method: 'DELETE' });
        App.toast('Tutup buku dibuka kembali.');
        await saldokas();
    };

    /* ---------- Pencarian nama dari data warga (datalist) ---------- */
    let wargaNama = [];
    async function muatWargaNama() {
        try { wargaNama = (await App.api('/api/warga?aktif=1')).warga || []; } catch (e) { wargaNama = []; }
    }
    function dlWarga() {
        return `<datalist id="dlWarga">${wargaNama.map((w) => `<option value="${esc(w.nama)}">RT ${esc(w.rt)}</option>`).join('')}</datalist>`;
    }
    const adaWarga = (nama) => wargaNama.some((w) => w.nama.toLowerCase() === String(nama).trim().toLowerCase());

    /* ---------- Akun ---------- */
    let akunList = [];
    async function akun() {
        const r = await App.api('/api/pengguna');
        akunList = r.pengguna;
        await muatPeran();
        App.pgReset('akun');
        App.pgRedraw.akun = tampilAkun;
        tampilAkun();
    }
    function tampilAkun() {
        const pg = App.paginate('akun', akunList);
        $('#pgBody').innerHTML = `
            <div class="row between mb-md">
                <p class="small muted grow">Atur akun dan peran tiap pengguna. Hak akses tiap peran diatur di tab <b>Hak Akses Peran</b>.</p>
                <button class="btn primary" data-act="akunForm">+ Tambah akun</button>
            </div>
            ${pg.bar}
            <div class="list">${pg.items.map((u) => `
                <div class="item ${u.aktif ? '' : 'opacity-dim'}">
                    <div class="grow"><div class="name">${esc(u.nama)} <span class="small muted">@${esc(u.username)}</span></div>
                    <div class="meta"><span class="badge blue">${esc(ROLE_LABEL[u.role] || u.role)}</span>${u.rt ? ' RT ' + esc(u.rt) : ''}${u.aktif ? '' : ' <span class="badge red">nonaktif</span>'}</div></div>
                    <button class="btn sm" data-act="akunForm" data-id="${u.id}">Ubah</button>
                </div>`).join('')}</div>`;
    }
    App.actions.akunForm = async (el) => {
        if (!wargaNama.length) await muatWargaNama();
        const u = el.dataset.id ? akunList.find((x) => x.id === Number(el.dataset.id)) : null;
        const v = u || { username: '', nama: '', role: 'bendahara_jimpitan', rt: '', aktif: 1 };
        App.dialog(`
            <h3>${u ? 'Ubah akun @' + esc(u.username) : 'Tambah akun'}</h3>
            <form data-form="akun" data-id="${u ? u.id : ''}" autocomplete="off">
                <div class="form-grid">
                    ${u ? '' : `<div><label class="f" for="akU">Username</label><input id="akU" name="username" required minlength="3" maxlength="50" pattern="[a-z0-9._-]+" placeholder="huruf kecil/angka" autocomplete="off"></div>`}
                    <div><label class="f" for="akN">Nama lengkap</label><input id="akN" name="nama" value="${esc(v.nama)}" required minlength="2" maxlength="150" list="dlWarga" placeholder="ketik untuk mencari warga" autocomplete="off">${dlWarga()}</div>
                    <div><label class="f" for="akR">Peran</label><select id="akR" name="role" data-change="akunRole">
                        ${PERAN.map((p) => `<option value="${esc(p.kode)}" ${v.role === p.kode ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select></div>
                    <div id="akRtBox"><label class="f" for="akRt">RT (wajib bila peran dibatasi per RT, mis. Pengurus RT)</label><select id="akRt" name="rt">
                        <option value="">—</option>${['007', '008', '009'].map((r) => `<option value="${r}" ${v.rt === r ? 'selected' : ''}>RT ${r}</option>`).join('')}</select></div>
                    <div class="full"><label class="f" for="akP">${u ? 'Password baru (kosongkan bila tidak diganti)' : 'Password (min. 8 karakter)'}</label>
                        <input id="akP" name="password" type="password" minlength="8" maxlength="200" autocomplete="new-password" ${u ? '' : 'required'}></div>
                    ${u ? `<div class="full row"><input type="checkbox" id="akA" name="aktif" ${v.aktif ? 'checked' : ''}><label for="akA">Akun aktif</label></div>` : ''}
                </div>
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Batal</button>
                    <button type="submit" class="btn primary">Simpan</button>
                </div>
            </form>`);
    };
    App.forms.akun = async (f) => {
        if (!f.dataset.id && !adaWarga(f.nama.value)) { App.toast('Nama harus dipilih dari data warga (ketik lalu pilih dari daftar).', 'err'); return; }
        const body = { nama: f.nama.value, role: f.role.value, rt: f.rt.value || null };
        if (f.password.value) body.password = f.password.value;
        if (f.dataset.id) {
            body.id = Number(f.dataset.id);
            body.aktif = f.aktif.checked;
            await App.api('/api/pengguna', { method: 'PUT', body });
        } else {
            body.username = f.username.value;
            await App.api('/api/pengguna', { method: 'POST', body });
        }
        App.closeDialog();
        App.toast('Akun disimpan.');
        await akun();
    };

    /* ---------- Tarif ---------- */
    async function tarif() {
        const r = await App.api('/api/tarif');
        const hariIni = App.today();
        const berlaku = r.tarif.filter((t) => App.ymd(t.berlaku_mulai) <= hariIni).sort((a, b) => App.ymd(b.berlaku_mulai).localeCompare(App.ymd(a.berlaku_mulai)))[0];
        $('#pgBody').innerHTML = `
            <div class="grid cols-4 mb-lg">
                <div class="stat ${berlaku && berlaku.nominal > 0 ? 'good' : 'warn'}"><small>Tarif harian (berlaku sekarang)</small><b>${berlaku && berlaku.nominal > 0 ? rp(berlaku.nominal) : 'Belum diatur'}</b></div>
            </div>
            <div class="card"><h3>Tambah / ubah tarif harian</h3>
                <form data-form="tarif"><div class="filters">
                    <div><label class="f" for="trN">Nominal per hari (Rp)</label><input type="number" id="trN" name="nominal" min="1" required inputmode="numeric"></div>
                    <div>${App.htmlDPick({ id: 'trT', name: 'berlaku_mulai', label: 'Berlaku mulai', value: hariIni, required: true })}</div>
                    <div><button class="btn primary" type="submit">Simpan tarif</button></div>
                </div></form>
                <p class="small muted">Kewajiban dihitung <b>harian untuk semua warga</b> (hari kalender). Setoran boleh berapa pun; sisa menjadi titipan dan kekurangan menjadi tunggakan.
                Tarif lama tetap dipakai untuk hari-hari sebelum tanggal berlaku, jadi hitungan masa lalu tidak berubah.</p>
            </div>
            <div class="card"><h3>Riwayat tarif harian</h3><div class="tbl-wrap"><table>
                <thead><tr><th class="r">Nominal / hari</th><th>Berlaku mulai</th></tr></thead>
                <tbody>${r.tarif.map((t) => `<tr><td class="r num">${rp(t.nominal)}</td><td>${App.tglId(t.berlaku_mulai)}</td></tr>`).join('')}</tbody>
            </table></div></div>`;
    }
    App.forms.tarif = async (f) => {
        await App.api('/api/tarif', { method: 'POST', body: { nominal: Number(f.nominal.value), berlaku_mulai: f.berlaku_mulai.value } });
        App.toast('Tarif harian disimpan.');
        await tarif();
    };

    /* ---------- Tahun buku & tunggakan lama ---------- */
    async function tahun() {
        const r = await App.api('/api/pengaturan');
        const p = r.pengaturan;
        const tahunIni = Number(App.today().slice(0, 4));
        $('#pgBody').innerHTML = `
            <div class="card"><h3>Status perhitungan</h3>
                <p>Kewajiban harian dihitung mulai <b>${App.tglId(p.mulai_hitung)}</b>. Saldo warga berjalan terus tanpa perlu "tutup tahun": kekurangan otomatis menjadi tunggakan dan saldo lebih otomatis menutup hari berikutnya.
                Setoran bertanggal <b>sebelum</b> tanggal ini tidak dihitung ke saldo.</p>
                <form data-form="mulaiHitung" class="row mt-md">
                    <div>${App.htmlDPick({ id: 'mhT', name: 'mulai_hitung', label: 'Ubah tanggal mulai hitung', value: p.mulai_hitung || '', required: true })}</div>
                    <button class="btn" type="submit" class="form-inline-end">Simpan</button>
                </form>
            </div>

            <div class="card"><h3>Impor tunggakan lama (CSV)</h3>
                <p class="small muted mb-md">Format kolom (baris pertama judul): <code>no,tahun,nominal,keterangan</code> — <b>no</b> = nomor warga di daftar jimpitan. Contoh: <code>12,2025,36500,Tunggakan 2025</code>. Pemisah koma atau titik koma.</p>
                <input type="file" id="csvFile" accept=".csv,text/csv" data-change="csvPilih">
                <div id="csvOut" class="mt-md"></div>
            </div>

            <div class="card"><h3>Tambah tunggakan lama manual</h3>
                <form data-form="tlManual"><div class="filters">
                    <div><label class="f" for="tmW">No warga</label><input type="number" id="tmW" name="warga_id" min="1" required></div>
                    <div><label class="f" for="tmT">Tahun</label><input type="number" id="tmT" name="tahun" value="${tahunIni - 1}" min="2000" max="2100" required></div>
                    <div><label class="f" for="tmN">Nominal (Rp)</label><input type="number" id="tmN" name="nominal" min="1" required></div>
                    <div><label class="f" for="tmK">Keterangan</label><input id="tmK" name="keterangan" maxlength="255"></div>
                    <div><button class="btn primary" type="submit">Tambah</button></div>
                </div></form>
            </div>`;
    }
    App.forms.mulaiHitung = async (f) => {
        await App.api('/api/pengaturan', { method: 'PUT', body: { mulai_hitung: f.mulai_hitung.value } });
        App.toast('Tanggal mulai hitung disimpan.');
        await tahun();
    };
    App.forms.tlManual = async (f) => {
        await App.api('/api/tunggakan-lama', { method: 'POST', body: { warga_id: Number(f.warga_id.value), tahun: Number(f.tahun.value), nominal: Number(f.nominal.value), keterangan: f.keterangan.value } });
        App.toast('Tunggakan lama ditambahkan.');
        f.reset();
    };

    // --- impor CSV tunggakan lama
    let csvRows = [];
    function parseCsv(text) {
        const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) return [];
        const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
        const cell = (l) => {
            const out = [];
            let cur = '', q = false;
            for (let i = 0; i < l.length; i++) {
                const c = l[i];
                if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
                else if (c === '"') q = true;
                else if (c === sep) { out.push(cur); cur = ''; }
                else cur += c;
            }
            out.push(cur);
            return out.map((s) => s.trim());
        };
        return lines.slice(1).map((l) => {
            const [no, th, nom, ket] = cell(l);
            return { warga_id: Number(no), tahun: Number(th), nominal: Number(String(nom || '').replace(/[.\s]/g, '').replace(',', '.')), keterangan: ket || '' };
        });
    }
    App.changes.csvPilih = async (inp) => {
        const file = inp.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) { App.toast('Berkas terlalu besar (maks 1 MB).', 'err'); return; }
        csvRows = parseCsv(await file.text());
        const ok = csvRows.filter((r) => Number.isInteger(r.warga_id) && r.warga_id > 0 && Number.isInteger(r.tahun) && r.nominal > 0);
        $('#csvOut').innerHTML = `<p>${csvRows.length} baris terbaca, <b>${ok.length}</b> valid, total ${rp(ok.reduce((a, r) => a + r.nominal, 0))}.</p>
            ${ok.length ? '<button class="btn primary" data-act="csvKirim">Impor sekarang</button>' : ''}`;
        csvRows = ok;
    };
    App.actions.csvKirim = async (btn) => {
        btn.disabled = true;
        try {
            const r = await App.api('/api/tunggakan-lama', { method: 'POST', body: { action: 'impor', rows: csvRows } });
            App.toast(`${r.berhasil} tunggakan lama diimpor.`);
            $('#csvOut').innerHTML = r.gagal.length ? `<div class="notice">${r.gagal.length} baris gagal:<br>${r.gagal.slice(0, 10).map((g) => `Baris ${g.baris}: ${esc(g.alasan)}`).join('<br>')}</div>` : '<p class="muted">Selesai.</p>';
            csvRows = [];
        } finally { btn.disabled = false; }
    };

    /* ---------- Identitas ---------- */
    async function identitas() {
        const p = (await App.api('/api/pengaturan')).pengaturan;
        await muatWargaNama();
        $('#pgBody').innerHTML = `
            ${dlWarga()}
            <div class="card"><form data-form="identitas"><div class="form-grid">
                <div class="full"><label class="f" for="idN">Nama web</label><input id="idN" name="nama_web" value="${esc(p.nama_web || '')}" required maxlength="120"></div>
                <div class="full"><label class="f" for="idS">Sub judul</label><input id="idS" name="subjudul" value="${esc(p.subjudul || '')}" maxlength="200"></div>
                <div><label class="f" for="idK">Nama Ketua RW (untuk laporan)</label><input id="idK" name="ketua_rw" value="${esc(p.ketua_rw || '')}" maxlength="100" list="dlWarga" placeholder="cari dari data warga" autocomplete="off"></div>
                <div><label class="f" for="idB">Nama Bendahara (untuk laporan)</label><input id="idB" name="nama_bendahara" value="${esc(p.nama_bendahara || '')}" maxlength="100" list="dlWarga" placeholder="cari dari data warga" autocomplete="off"></div>
                <div class="full row"><input type="checkbox" id="idC" name="cek_tunggakan_publik" ${p.cek_tunggakan_publik === '0' ? '' : 'checked'}>
                    <label for="idC">Izinkan siapa saja mengecek tunggakan lewat halaman Beranda (cari berdasarkan nama; menampilkan nama, RT, dan nominal tunggakan). Matikan bila tidak ingin data ini terbuka untuk umum.</label></div>
            </div><div class="dlg-actions"><button class="btn primary" type="submit">Simpan</button></div></form></div>`;
    }
    App.forms.identitas = async (f) => {
        const body = {};
        for (const k of ['nama_web', 'subjudul', 'ketua_rw', 'nama_bendahara']) body[k] = f[k].value;
        body.cek_tunggakan_publik = f.cek_tunggakan_publik.checked;
        await App.api('/api/pengaturan', { method: 'PUT', body });
        $('#brandTitle').textContent = body.nama_web;
        $('#brandSub').textContent = body.subjudul;
        App.toast('Identitas disimpan.');
    };

    /* ---------- Log ---------- */
    async function log() {
        const r = await App.api('/api/log?limit=200');
        LOGDATA = r.log;
        App.pgReset('log');
        App.pgRedraw.log = tampilLog;
        tampilLog();
    }
    let LOGDATA = [];
    // Waktu disimpan UTC di database; tampilkan dalam zona Asia/Jakarta (WIB)
    function waktuWib(v) {
        const d = new Date(v);
        if (isNaN(d)) return String(v);
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
            .formatToParts(d).map((x) => [x.type, x.value]));
        return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second} WIB`;
    }
    function tampilLog() {
        const pg = App.paginate('log', LOGDATA);
        $('#pgBody').innerHTML = `${pg.bar}<div class="tbl-wrap"><table>
            <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Keterangan</th></tr></thead>
            <tbody>${pg.items.map((l) => `<tr><td class="nowrap">${esc(waktuWib(l.waktu))}</td><td>${esc(l.username)}</td><td><span class="badge">${esc(l.aksi)}</span></td><td class="wrap-normal min-col-lg">${esc(l.deskripsi)}</td></tr>`).join('')}</tbody>
        </table></div>`;
    }

    // tampilkan/sembunyikan kolom RT pada form akun menurut peran
    App.changes.akunRole = (sel) => {
        const box = $('#akRtBox');
        if (box) box.style.opacity = perluRt(sel.value) ? '1' : '0.5';
    };
})();
