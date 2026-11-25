/* Halaman Iuran Wajib: per periode kumpulan RW (tiap Selasa Kliwon, 35 hari). Pola pembayaran seperti jimpitan. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const IS = (App.stIuran = { periode: '', rt: '', status: '', q: '', tanggal: '', data: null, nominal: new Map(), tab: 'papan' });
    const RTS = ['007', '008', '009'];
    const LABEL = { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum bayar', luar: 'Belum ditagih' };
    const WARNA = { lunas: 'hijau', sebagian: 'berjalan', belum: 'merah', luar: 'luar' };

    App.views.iuran = async (root) => {
        if (!App.has('iuran.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        if (!IS.tanggal) IS.tanggal = App.today();
        if (App.rtKunci()) IS.rt = App.user.rt || '';
        root.innerHTML = `
            <h2 class="title">Iuran Wajib Warga</h2>
            ${tabsIuran()}
            <div id="iPapan" ${IS.tab === 'rekap' ? 'hidden' : ''}>
            <div id="iRingkas"></div>
            ${App.rtKunci() || !App.has('iuran.tulis') ? `<p class="small" style="margin-bottom:10px">${App.rtKunci() ? `<b>Menampilkan warga RT ${esc(App.user.rt || '')} saja.</b> ` : ''}${App.has('iuran.tulis') ? '' : '<b>Anda hanya dapat melihat.</b> Pencatatan iuran wajib dilakukan Pengurus RT.'}</p>` : ''}
            <div class="card">
                <div class="filters">
                    <div class="full-m"><label class="f" for="iPer">Kumpulan RW (tanggal)</label><select id="iPer" data-change="iuranFilter"></select></div>
                    <div><label class="f" for="iSt">Status</label><select id="iSt" data-change="iuranFilter">
                        ${[['', 'Semua'], ['belum', 'Belum bayar'], ['sebagian', 'Sebagian'], ['lunas', 'Lunas']].map(([v, l]) => `<option value="${v}" ${IS.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                    <div><label class="f" for="iCari">Cari nama</label><input id="iCari" placeholder="Ketik nama…" value="${esc(IS.q)}" data-input="iuranCari" maxlength="60"></div>
                    ${App.has('iuran.tulis') ? `<div><label class="f" for="iTgl">Tanggal diterima</label><input type="date" id="iTgl" value="${esc(IS.tanggal)}" max="${App.today()}" data-change="iuranTgl"></div>` : ''}
                </div>
            </div>
            <div class="savebar savebar-atas" id="iBar"></div>
            <div id="iPg"></div>
            <div id="iList" class="list"></div>
            </div>
            <div id="iRekap" ${IS.tab === 'rekap' ? '' : 'hidden'}></div>`;
        if (IS.tab === 'rekap') await muatRekap(); else await muat();
    };

    // Tab: Semua RT / per RT / Rekap
    function tabsIuran() {
        const kunci = App.rtKunci();
        const daftar = kunci ? [[IS.rt, 'RT ' + IS.rt]] : [['', 'Semua RT'], ...RTS.map((r) => [r, 'RT ' + r])];
        return `<div class="subtabs">${daftar.map(([v, l]) => `<button class="tab ${IS.tab === 'papan' && IS.rt === v ? 'active' : ''}" data-act="iuranTab" data-nilai="${v}">${l}</button>`).join('')}
            <button class="tab ${IS.tab === 'rekap' ? 'active' : ''}" data-act="iuranTab" data-nilai="rekap">Rekap</button></div>`;
    }
    App.actions.iuranTab = (el) => {
        const v = el.dataset.nilai;
        if (v === 'rekap') IS.tab = 'rekap';
        else { IS.tab = 'papan'; IS.rt = v; App.pgReset('iuran'); }
        return App.render();
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
        IS.pgHtml = pg.bar;   // kontrol halaman digabung ke bilah simpan (bagi yang boleh mencatat)
        const tulis = App.has('iuran.tulis');
        $('#iPg').innerHTML = tulis ? '' : pg.bar;
        // Sudah setor = lunas untuk kumpulan terpilih ATAU ada setoran bertanggal di periode itu → kotak tercentang & terkunci
        const bisaPilih = rows.filter((w) => !sudahSetor(w) && w.saran > 0);
        const semuaDipilih = bisaPilih.length > 0 && bisaPilih.every((w) => IS.nominal.has(w.id));
        const kolomSemua = r.kolom || [];
        // Tampilan HP: kartu per warga (tanpa tabel lebar)
        IS.ukuranKey = window.innerWidth <= 640 ? 'm' : Math.floor(window.innerWidth / 40);
        if (window.innerWidth <= 640) {
            const SIMM = { lunas: '✓', sebagian: '◐', belum: '✕', luar: '–' };
            const kartu = pg.items.map((w) => {
                const kunci = sudahSetor(w);
                const dipilih = IS.nominal.has(w.id);
                const chip = w.riwayat.map((h, i) => `<span class="iu-k rw-${h.status}${kolomSemua[i] && kolomSemua[i].terpilih ? ' sel' : ''}" title="${esc(tgl(h.mulai))}: ${esc(LABEL[h.status])}">K${kolomSemua[i] ? kolomSemua[i].no : i + 1} ${SIMM[h.status] || '–'}</span>`).join('');
                const aksi = !tulis ? '' : `<div class="iu-aksi">${dipilih
                    ? `<input type="number" inputmode="numeric" min="1" step="1" placeholder="Rp 0" aria-label="Nominal iuran ${esc(w.nama)}" data-input="iuranNominal" data-id="${w.id}" value="${IS.nominal.get(w.id) || ''}">${defIuran() ? `<button class="btn" data-act="iuranIsiDefault" data-id="${w.id}" title="Isi nominal default ${rp(defIuran())}">+${kom(defIuran())}</button>` : ''}<button class="btn primary" data-act="iuranSimpanSatu" data-id="${w.id}">Simpan</button><button class="btn ghost" data-act="iuranBatalPilih" data-id="${w.id}">Batal</button>`
                    : `<span class="small muted">${kunci ? 'Sudah setor kumpulan ini' : 'Belum setor'}</span>${defIuran() ? `<button class="btn sm" data-act="iuranIsiDefault" data-id="${w.id}" title="Isi nominal default ${rp(defIuran())}">+${kom(defIuran())}</button>` : ''}<button class="btn sm ghost" data-act="iuranTambah" data-id="${w.id}">+ Tambah</button>`}</div>`;
                return `<div class="iu-card st-${w.status}${kunci ? ' terbayar' : ''}${dipilih ? ' dipilih' : ''}" data-row="${w.id}">
                    <div class="iu-top">
                        ${tulis ? `<input type="checkbox" data-change="iuranCek" data-id="${w.id}" aria-label="Setor iuran ${esc(w.nama)}" ${kunci || dipilih ? 'checked' : ''} ${kunci ? 'disabled' : ''}>` : ''}
                        <div class="iu-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span><div class="small muted">${esc(LABEL[w.status])}</div></div>
                        <button class="link-setor iu-sum" data-act="iuranRiwayatSetor" data-id="${w.id}"><small>Iuran</small>${rp(w.total_setor)}</button>
                    </div>
                    <div class="iu-riw">${chip}</div>${aksi}</div>`;
            }).join('');
            $('#iList').innerHTML = rows.length ? `<div class="iu-m">
                ${tulis ? `<label class="iu-all"><input type="checkbox" data-change="iuranCekSemua" ${semuaDipilih ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'}> Centang semua yang belum setor (${bisaPilih.length})</label>` : ''}
                ${kartu}
                <p class="small muted" style="padding:4px 2px">K = kumpulan RW. ✓ lunas · ◐ sebagian · ✕ belum bayar · – belum ditagih. Warna menyala = kumpulan terpilih.</p></div>`
                : '<div class="card empty">Tidak ada warga yang cocok.</div>';
            barSimpan();
            return;
        }
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
                ? `<input type="number" inputmode="numeric" min="1" step="1" placeholder="Rp 0" aria-label="Nominal iuran ${esc(w.nama)}" data-input="iuranNominal" data-id="${w.id}" value="${IS.nominal.get(w.id) || ''}">${defIuran() ? `<button class="btn sm" data-act="iuranIsiDefault" data-id="${w.id}" title="Isi nominal default ${rp(defIuran())}">+${kom(defIuran())}</button>` : ''}<button class="btn sm primary" data-act="iuranSimpanSatu" data-id="${w.id}" title="Simpan setoran ${esc(w.nama)}">Simpan</button><button class="btn sm ghost" data-act="iuranBatalPilih" data-id="${w.id}" title="Batal, tidak jadi mencatat setoran">Batal</button>`
                : `${defIuran() ? `<button class="btn sm" data-act="iuranIsiDefault" data-id="${w.id}" title="Isi nominal default ${rp(defIuran())}">+${kom(defIuran())}</button> ` : ''}<button class="btn sm ghost" data-act="iuranTambah" data-id="${w.id}" title="${kunci ? 'Tambah setoran lagi (sebagian/titipan)' : 'Catat setoran'}">+ Tambah</button>`}</td>`;
            return `<tr class="st-${w.status}${kunci ? ' terbayar' : ''}${dipilih ? ' dipilih' : ''}" data-row="${w.id}">${cek}
                <td class="c-nama"><b>${esc(w.nama)}</b> <span class="badge">RT ${esc(w.rt)}</span></td>
                ${sel_}
                <td class="r num c-sum"><button class="link-setor" data-act="iuranRiwayatSetor" data-id="${w.id}" title="Lihat / batalkan setoran">${rp(w.total_setor)}</button></td>${nom}</tr>`;
        }).join('');
        const kepalaPer = kolom.map((k) => `<th class="c-per${k.terpilih ? ' sel' : ''}" title="Kumpulan ke-${k.no} · ${esc(tgl(k.mulai))}">K${k.no}</th>`).join('');
        const ketK = nK < kolomSemua.length ? ` Layar sempit: menampilkan K${kolom[0].no}–K${kolom[kolom.length - 1].no} dari ${kolomSemua.length} kumpulan.` : '';
        $('#iList').innerHTML = rows.length ? `<div class="card tbl-card"><div class="tbl-wrap tbl-satu"><table class="tbl-iuran"><thead><tr>
            ${tulis ? `<th class="c-cek"><input type="checkbox" data-change="iuranCekSemua" aria-label="Centang semua yang belum setor" title="Centang semua yang belum setor" ${semuaDipilih ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'}></th>` : ''}
            <th class="c-nama">Nama (RT)</th>${kepalaPer}<th class="r c-sum">Iuran</th>${tulis ? '<th class="c-nom r">Setoran (Rp)</th>' : ''}</tr></thead>
            <tbody>${baris}</tbody></table></div>
            <p class="small muted" style="padding:8px 14px 12px">K = kumpulan RW. ✓ lunas · ◐ sebagian · ✕ belum bayar · – belum ditagih. Kolom berwarna = kumpulan terpilih. Klik angka di kolom “Iuran” untuk melihat atau membatalkan setoran.${ketK}</p></div>` : '<div class="card empty">Tidak ada warga yang cocok.</div>';
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
            ${IS.pgHtml ? `<div class="savebar-pg">${IS.pgHtml}</div>` : ''}
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
        iuranUkuran = setTimeout(() => {
            const key = window.innerWidth <= 640 ? 'm' : Math.floor(window.innerWidth / 40);
            const mengetik = document.activeElement && document.activeElement.matches && document.activeElement.matches('input');
            if (IS.data && $('#iList') && $('#iList').children.length && key !== IS.ukuranKey && !mengetik) tampil();
        }, 200);
    });
    App.changes.iuranFilter = async () => {
        IS.periode = $('#iPer').value; IS.status = $('#iSt').value;
        await muat();
    };
    App.changes.iuranTgl = () => { IS.tanggal = $('#iTgl').value || App.today(); };
    App.changes.iuranCari = () => { IS.q = $('#iCari').value; App.pgReset('iuran'); tampil(); };
    // Sudah setor = lunas untuk kumpulan ini atau ada setoran bertanggal di periode ini
    // Label ringkas nominal default (mis. 5000 → 5rb)
    const kom = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}rb` : rp(n));
    const defIuran = () => (IS.data && IS.data.nominal > 0 ? IS.data.nominal : 0);
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
    // Isi nominal default iuran per kumpulan (mis. Rp 5.000) pada baris warga
    App.actions.iuranIsiDefault = (el) => {
        const id = Number(el.dataset.id);
        const w = IS.data.warga.find((x) => x.id === id);
        if (!w || !(defIuran() > 0)) return;
        IS.nominal.set(id, defIuran());
        tampil();
        const inp = $(`input[data-input="iuranNominal"][data-id="${id}"]`);
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
            <p class="small muted" style="margin-bottom:10px">Total iuran <b>${rp(w.total_setor)}</b>${w.kurang > 0 ? ` · tunggakan <b>${rp(w.kurang)}</b>` : w.lebih > 0 ? ` · titipan <b>${rp(w.lebih)}</b>` : ''}.</p>
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
    // Batal: tidak jadi mencatat setoran (lepas centang & kosongkan nominal baris ini)
    App.actions.iuranBatalPilih = (el) => {
        IS.nominal.delete(Number(el.dataset.id));
        tampil();
    };
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

    /* ================= REKAP IURAN per kumpulan RW ================= */
    const RKI = (App.stRekapIuran = { periode: '', data: null, cari: '', urut: 'nominal_desc' });
    const URUT = [['nominal_desc', 'Nominal ↓'], ['nominal_asc', 'Nominal ↑'], ['nama', 'Nama A–Z']];
    const urutkan = (list) => list.slice().sort((a, b) => (RKI.urut === 'nominal_desc' ? b.total - a.total : RKI.urut === 'nominal_asc' ? a.total - b.total : 0) || a.nama.localeCompare(b.nama, 'id'));

    async function muatRekap() {
        const el = $('#iRekap');
        if (!el) return;
        el.innerHTML = App.loading();
        const r = await App.api('/api/rekap-iuran?' + App.qs({ periode: RKI.periode }));
        RKI.data = r;
        RKI.periode = r.periode.mulai;
        gambarRekap();
    }

    function gambarRekap() {
        const r = RKI.data, el = $('#iRekap');
        if (!r || !el) return;
        if (!r.aktif) { el.innerHTML = '<div class="card empty">Iuran wajib belum diaktifkan.</div>'; return; }
        const p = r.periode, t = r.total;
        const cari = RKI.cari.trim().toLowerCase();
        const rows = r.warga.filter((w) => w.total > 0 && (!cari || w.nama.toLowerCase().includes(cari)));
        const grup = new Map();
        for (const w of rows) { if (!grup.has(w.rt)) grup.set(w.rt, []); grup.get(w.rt).push(w); }
        el.innerHTML = `
            <div class="card">
                <div class="filters">
                    <div class="grow"><label class="f" for="rkiPer">Kumpulan RW</label><select id="rkiPer" data-change="rekapIuranPeriode">
                        ${r.daftar_periode.map((x) => `<option value="${esc(x.mulai)}" ${x.mulai === p.mulai ? 'selected' : ''}>Kumpulan ke-${x.no} · ${esc(x.weton)}, ${tgl(x.mulai)}${x.berjalan ? ' (berjalan)' : ''}</option>`).join('')}</select></div>
                </div>
                <p class="small muted" style="margin-top:8px">Iuran diterima bertanggal <b>${tgl(p.mulai)}</b> s.d. <b>${tgl(p.sampai)}</b> (kumpulan ke-${p.no}).</p>
            </div>
            <div class="rk-baris" style="margin:14px 0">
                <div class="stat rk-c0"><small>Total pemasukan iuran</small><b>${rp(t.total)}</b>
                    <span class="small muted" style="display:block;margin-top:4px">${t.menyetor} / ${t.warga} warga menyetor</span></div>
                ${r.rt.map((g, i) => `<div class="stat rk-c${(i % 3) + 1}"><small>RT ${esc(g.rt)}</small><b>${rp(g.total)}</b>
                    <span class="small muted" style="display:block;margin-top:4px">${g.menyetor} / ${g.warga} warga menyetor</span></div>`).join('')}
            </div>
            <h3 class="sec-title">Rincian per warga</h3>
            <div class="card">
                <div class="filters"><div class="grow"><label class="f" for="rkiCari">Cari nama</label><input id="rkiCari" placeholder="Ketik nama…" value="${esc(RKI.cari)}" data-input="rekapIuranCari" maxlength="60"></div>
                    <div><label class="f">Urutkan</label><div class="rk-urut" role="group" aria-label="Urutkan rincian">${URUT.map(([v, l]) => `<button type="button" class="${RKI.urut === v ? 'aktif' : ''}" data-act="rekapIuranUrut" data-nilai="${v}">${l}</button>`).join('')}</div></div></div>
                ${grup.size ? `<div class="rk-kolom" style="--n:${Math.min(3, grup.size)}">
                ${[...grup.entries()].map(([rt, list]) => `<section class="rk-rtcol rk-c${(Math.max(0, r.rt.findIndex((g) => g.rt === rt)) % 3) + 1}">
                    <header><b>RT ${esc(rt)}</b><span>${rp(list.reduce((a, w) => a + w.total, 0))}</span></header>
                    <ul>${urutkan(list).map((w) => `<li><span>${esc(w.nama)}</span><b>${rp(w.total)}</b></li>`).join('')}</ul>
                    <footer><span>${list.length} warga</span><b>${rp(list.reduce((a, w) => a + w.total, 0))}</b></footer></section>`).join('')}
                </div>`
                : '<div class="empty" style="margin-top:10px">Belum ada iuran diterima pada kumpulan ini.</div>'}
            </div>`;
    }
    App.actions.rekapIuranUrut = (el) => { RKI.urut = el.dataset.nilai; gambarRekap(); };
    App.changes.rekapIuranPeriode = async (el) => { RKI.periode = el.value; await muatRekap(); };
    App.changes.rekapIuranCari = (inp) => {
        RKI.cari = inp.value;
        gambarRekap();
        const e = $('#rkiCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
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
