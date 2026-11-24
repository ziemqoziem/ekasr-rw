/* Halaman Iuran Wajib: per periode kumpulan RW (tiap Selasa Kliwon, 35 hari). Pola pembayaran seperti jimpitan. */
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
        // Sudah setor = lunas untuk kumpulan terpilih ATAU ada setoran bertanggal di periode itu → kotak tercentang & terkunci
        const bisaPilih = rows.filter((w) => !sudahSetor(w) && w.saran > 0);
        const semuaDipilih = bisaPilih.length > 0 && bisaPilih.every((w) => IS.nominal.has(w.id));
        const kolomSemua = r.kolom || [];
        // Muat dalam satu frame: jumlah kolom kumpulan menyesuaikan lebar layar (selalu memuat kumpulan terpilih)
        const lebar = ($('#iList') && $('#iList').clientWidth) || window.innerWidth;
        const tetap = (tulis ? 40 : 0) + 150 + 100 + (tulis ? 140 : 0);
        const maxK = Math.max(lebar < 600 ? 2 : 3, Math.floor((lebar - tetap) / 34));
        const nK = Math.min(kolomSemua.length, maxK);
        const iSel = Math.max(0, kolomSemua.findIndex((k) => k.terpilih));
        const mulaiK = Math.max(0, Math.min(kolomSemua.length - nK, iSel));  // jendela kolom terbaru; bila kumpulan terpilih lebih lama, mulai dari kumpulan itu
        const kolom = kolomSemua.slice(mulaiK, mulaiK + nK);
        const riw = (w) => w.riwayat.slice(mulaiK, mulaiK + nK);
        IS.nK = nK;
        const SIM = { lunas: '✓', sebagian: '◐', belum: '✕', luar: '–' };
        const baris = pg.items.map((w) => {
            const kunci = sudahSetor(w);
            const dipilih = IS.nominal.has(w.id);
            const sel_ = riw(w).map((h, i) => `<td class="c-per${kolom[i] && kolom[i].terpilih ? ' sel' : ''}"><span class="rw rw-${h.status}" title="K${kolom[i] ? kolom[i].no : ''} · ${esc(tgl(h.mulai))}: ${esc(LABEL[h.status])}">${SIM[h.status] || '–'}</span></td>`).join('');
            const cek = tulis ? `<td class="c-cek"><input type="checkbox" data-change="iuranCek" data-id="${w.id}" aria-label="Setor iuran ${esc(w.nama)}" ${kunci || dipilih ? 'checked' : ''} ${kunci ? 'disabled title="Sudah setor pada kumpulan ini"' : ''}></td>` : '';
            const nom = !tulis ? '' : `<td class="c-nom">${dipilih
                ? `<input type="number" inputmode="numeric" min="1" step="1" placeholder="Rp 0" aria-label="Nominal iuran ${esc(w.nama)}" data-input="iuranNominal" data-id="${w.id}" value="${IS.nominal.get(w.id) || ''}"><button class="btn sm primary" data-act="iuranSimpanSatu" data-id="${w.id}" title="Simpan setoran ${esc(w.nama)}">Simpan</button>`
                : kunci ? `<button class="btn sm ghost" data-act="iuranTambah" data-id="${w.id}" title="Tambah setoran lagi (sebagian/titipan)">+ Tambah</button>` : '<span class="muted small">centang untuk setor</span>'}</td>`;
            return `<tr class="st-${w.status}${kunci ? ' terbayar' : ''}${dipilih ? ' dipilih' : ''}" data-row="${w.id}">${cek}
                <td class="c-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span></td>
                ${sel_}
                <td class="r num c-sum"><button class="link-setor" data-act="iuranRiwayatSetor" data-id="${w.id}" title="Lihat / batalkan setoran">${rp(w.total_setor)}</button></td>${nom}</tr>`;
        }).join('');
        const kepalaPer = kolom.map((k) => `<th class="c-per${k.terpilih ? ' sel' : ''}" title="Kumpulan ke-${k.no} · ${esc(tgl(k.mulai))}">K${k.no}</th>`).join('');
        const ketK = nK < kolomSemua.length ? ` Layar sempit: menampilkan K${kolom[0].no}–K${kolom[kolom.length - 1].no} dari ${kolomSemua.length} kumpulan.` : '';
        $('#iList').innerHTML = rows.length ? `<div class="card tbl-card"><div class="tbl-wrap tbl-satu"><table class="tbl-iuran"><thead><tr>
            ${tulis ? `<th class="c-cek"><input type="checkbox" data-change="iuranCekSemua" aria-label="Centang semua yang belum setor" title="Centang semua yang belum setor" ${semuaDipilih ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'}></th>` : ''}
            <th class="c-nama">Nama (RT)</th>${kepalaPer}<th class="r c-sum">Sudah disetor</th>${tulis ? '<th class="c-nom r">Setoran (Rp)</th>' : ''}</tr></thead>
            <tbody>${baris}</tbody></table></div>
            <p class="small muted" style="padding:8px 14px 12px">K = kumpulan RW. ✓ lunas · ◐ sebagian · ✕ belum bayar · – belum ditagih. Kolom berwarna = kumpulan terpilih. Klik angka “Sudah disetor” untuk melihat atau membatalkan setoran.${ketK}</p></div>` : '<div class="card empty">Tidak ada warga yang cocok.</div>';
        barSimpan();
    }

    function barSimpan() {
        const bar = $('#iBar');
        if (!bar) return;
        if (!App.has('iuran.tulis') || !IS.data || !IS.data.aktif) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
        bar.style.display = '';
        let n = 0, total = 0;
        for (const v of IS.nominal.values()) if (v > 0) { n += 1; total += v; }
        const belum = IS.data.warga.filter((w) => !sudahSetor(w) && w.saran > 0).length;
        bar.innerHTML = `
            <div class="row" style="gap:8px"><span class="badge blue"><b>${n}</b> warga dicentang</span>
                <span style="font-weight:700;font-size:1.15rem;font-variant-numeric:tabular-nums">${rp(total)}</span></div>
            <div class="row">
                <button class="btn sm" data-act="iuranIsiSemua" ${belum ? '' : 'disabled'}>Centang semua belum setor (${belum})</button>
                <button class="btn sm ghost" data-act="iuranReset" ${n ? '' : 'disabled'}>Reset</button>
                <button class="btn primary" data-act="iuranSimpan" ${n ? '' : 'disabled'}>Simpan</button>
            </div>`;
    }

    let iuranUkuran = null;
    window.addEventListener('resize', () => {
        clearTimeout(iuranUkuran);
        iuranUkuran = setTimeout(() => { if (IS.data && $('#iList') && $('#iList').querySelector('.tbl-iuran')) tampil(); }, 200);
    });
    App.changes.iuranFilter = async () => {
        IS.periode = $('#iPer').value; if (!App.rtKunci()) IS.rt = $('#iRt').value; IS.status = $('#iSt').value;
        await muat();
    };
    App.changes.iuranTgl = () => { IS.tanggal = $('#iTgl').value || App.today(); };
    App.changes.iuranCari = () => { IS.q = $('#iCari').value; App.pgReset('iuran'); tampil(); };
    // Sudah setor = lunas untuk kumpulan ini atau ada setoran bertanggal di periode ini
    function sudahSetor(w) { return w.status === 'lunas' || w.setoran.length > 0; }
    // Centang = catat setoran sebesar tagihan/saran; nominal masih bisa diubah di kolom yang muncul
    App.changes.iuranCek = (cb) => {
        const id = Number(cb.dataset.id);
        const w = IS.data.warga.find((x) => x.id === id);
        if (!w) return;
        if (cb.checked) {
            if (!(w.saran > 0)) { cb.checked = false; App.toast('Nominal iuran belum diatur.', 'err'); return; }
            IS.nominal.set(id, w.saran);
        } else {
            IS.nominal.delete(id);
        }
        tampil();
    };
    App.changes.iuranCekSemua = (cb) => {
        const cari = ($('#iCari').value || '').trim().toLowerCase();
        for (const w of IS.data.warga) {
            if (cari && !w.nama.toLowerCase().includes(cari)) continue;
            if (IS.status && w.status !== IS.status) continue;
            if (sudahSetor(w) || !(w.saran > 0)) continue;
            if (cb.checked) IS.nominal.set(w.id, w.saran); else IS.nominal.delete(w.id);
        }
        tampil();
    };
    App.actions.iuranTambah = (el) => {
        const w = IS.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w) return;
        IS.nominal.set(w.id, w.saran > 0 ? w.saran : (w.nominal || 0));
        tampil();
        const inp = $(`input[data-input="iuranNominal"][data-id="${w.id}"]`);
        if (inp) { inp.focus(); inp.select(); }
    };
    App.changes.iuranNominal = (inp) => {
        const id = Number(inp.dataset.id);
        const v = Math.floor(Number(inp.value));
        if (v > 0) IS.nominal.set(id, v); else IS.nominal.delete(id);
        barSimpan();
    };
    App.actions.iuranRiwayatSetor = (el) => {
        const w = IS.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w) return;
        const tulis = App.has('iuran.tulis');
        const baris = w.setoran_semua.map((x) => `<tr><td>${esc(tgl(x.tanggal))}</td><td class="r num">${rp(x.nominal)}</td>
            ${tulis ? `<td class="r"><button class="btn sm danger" data-act="batalIuran" data-id="${esc(x.id)}" data-nama="${esc(w.nama)}">Batalkan</button></td>` : ''}</tr>`).join('');
        App.dialog(`
            <h3>Setoran iuran — ${esc(w.nama)} (RT ${esc(w.rt)})</h3>
            <p class="small muted" style="margin-bottom:10px">Total disetor <b>${rp(w.total_setor)}</b>${w.kurang > 0 ? ` · tunggakan <b>${rp(w.kurang)}</b>` : w.lebih > 0 ? ` · titipan <b>${rp(w.lebih)}</b>` : ''}.</p>
            <div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th>${tulis ? '<th></th>' : ''}</tr></thead><tbody>
            ${baris || `<tr><td colspan="3" class="muted">Belum ada setoran.</td></tr>`}</tbody></table></div>
            <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Tutup</button></div>`);
    };
    App.actions.iuranIsiSemua = () => {
        for (const w of IS.data.warga) if (!sudahSetor(w) && w.saran > 0) IS.nominal.set(w.id, w.saran);
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
    // Simpan setoran satu warga langsung dari barisnya
    App.actions.iuranSimpanSatu = async (el) => {
        const id = Number(el.dataset.id);
        const inp = $(`input[data-input="iuranNominal"][data-id="${id}"]`);
        const nom = Math.floor(Number(inp ? inp.value : IS.nominal.get(id)));
        if (!(nom > 0)) { App.toast('Isi nominal terlebih dahulu.', 'err'); return; }
        el.disabled = true;
        const lain = [...IS.nominal.entries()].filter(([k]) => k !== id); // centang warga lain dipertahankan
        try {
            await simpan([{ warga_id: id, nominal: nom }]);
            for (const [k, v] of lain) {
                const w = IS.data.warga.find((x) => x.id === k);
                if (w && !sudahSetor(w)) IS.nominal.set(k, v);
            }
            tampil();
        } finally { el.disabled = false; }
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
