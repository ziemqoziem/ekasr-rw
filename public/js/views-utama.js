/* Halaman: Setoran, Tunggakan, Warga (Beranda ada di views-beranda.js) */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;

    const RT = ['007', '008', '009'];
    const JENIS = ['harian', 'mingguan', 'bulanan'];
    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const optRt = (sel, all) =>
        (all === false ? '' : '<option value="">Semua RT</option>') +
        RT.map((r) => `<option value="${r}" ${sel === r ? 'selected' : ''}>RT ${r}</option>`).join('');
    const optJenis = (sel) =>
        '<option value="">Semua jenis</option>' +
        JENIS.map((j) => `<option value="${j}" ${sel === j ? 'selected' : ''}>${j[0].toUpperCase() + j.slice(1)}</option>`).join('');
    App.optRt = optRt;
    App.optJenis = optJenis;

    const qs = (o) =>
        Object.entries(o)
            .filter(([, v]) => v !== '' && v !== null && v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
    App.qs = qs;

    const jenisBadge = (j) => `<span class="badge blue">${esc(j)}</span>`;

    const tglPendek = (t) => App.tglId(t);

    // Lencana status saldo satu warga
    function lencanaSaldo(w) {
        if (w.kurang > 0) return `<span class="badge red">Kurang ${rp(w.kurang)}${w.hari_kurang ? ` (≈${w.hari_kurang} hari)` : ''}</span>`;
        if (w.lebih > 0) return `<span class="badge green">Titipan ${rp(w.lebih)} · lunas s.d. ${tglPendek(w.lunas_sampai).slice(0, 5)}</span>`;
        if (w.tagihan_berjalan > 0) return `<span class="badge amber">Tagihan berjalan ${rp(w.tagihan_berjalan)}</span>`;
        return '<span class="badge">Lunas sampai hari ini</span>';
    }
    // Kalimat ringkas hasil setelah setoran dicatat
    function kalimatSaldo(r) {
        if (r.kurang > 0) return `Masih kurang ${rp(r.kurang)}`;
        if (r.lebih > 0) return `Titipan ${rp(r.lebih)} (±${r.hari_tertutup} hari ke depan, lunas s.d. ${tglPendek(r.lunas_sampai)})`;
        if (r.tagihan_berjalan > 0) return `Tagihan berjalan ${rp(r.tagihan_berjalan)}`;
        return 'Lunas sampai hari ini';
    }

    /* ================= SETORAN (nominal manual) ================= */
    const SS = (App.stSetoran = { tanggal: '', rt: '', jenis: 'harian', data: null, nominal: new Map() });

    // Tab: Harian / Mingguan / Bulanan (terikat pola warga) + Rekap (ringkasan per kumpulan RW)
    const tabsSetoran = () => `<div class="subtabs">${[...JENIS, 'rekap'].map((j) => `<button class="tab ${SS.jenis === j ? 'active' : ''}" data-act="setoranJenis" data-jenis="${j}">${j[0].toUpperCase() + j.slice(1)}</button>`).join('')}</div>`;

    App.views.setoran = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        if (!SS.tanggal) SS.tanggal = App.today();
        if (App.rtKunci()) SS.rt = App.user.rt || '';
        if (SS.jenis === 'rekap') return tampilRekap(root);
        root.innerHTML = `
            <h2 class="title">Setor Jimpitan / Iuran</h2>
            ${tabsSetoran()}
            <div class="card">
                <div class="filters">
                    <div>${App.htmlDPick({ id: 'sTgl', label: 'Tanggal setor', value: SS.tanggal, max: App.today(), change: 'setoranFilter', required: true })}</div>
                    <div><label class="f" for="sRt">RT</label><select id="sRt" data-change="setoranFilter" ${App.rtKunci() ? 'disabled' : ''}>${optRt(SS.rt)}</select></div>
                    <div><label class="f" for="sCari">Cari nama</label><input id="sCari" placeholder="Ketik nama…" data-input="setoranCari" maxlength="60"></div>
                </div>
                <div id="sRingkas" class="row small muted mt-sm"></div>
            </div>
            <div class="savebar savebar-atas" id="sBar"></div>
            <div id="sPg"></div>
            <div id="sList" class="list"></div>`;
        await loadSetoran();
    };

    async function loadSetoran() {
        SS.nominal.clear();
        $('#sList').innerHTML = App.loading();
        App.pgReset('setor');
        SS.data = await App.api('/api/daftar-setoran?' + qs({ tanggal: SS.tanggal, rt: SS.rt, jenis: SS.jenis }));
        renderSetoran();
    }

    App.actions.setoranJenis = (el) => {
        SS.jenis = el.dataset.jenis;
        return App.render();
    };
    // Setor satu warga langsung dari barisnya
    App.actions.setorSatu = async (el) => {
        const id = Number(el.dataset.id);
        const w = SS.data.warga.find((x) => x.id === id);
        const nom = SS.nominal.get(id) || (w && w.saran) || 0;
        if (!w || !(nom > 0)) { App.toast('Isi nominal terlebih dahulu.', 'err'); return; }
        el.disabled = true;
        try {
            let r = await kirimMassal([{ warga_id: id, nominal: nom }], false);
            if (r.gagal.length && r.gagal[0].kode === 'DUPLIKAT') {
                if (!window.confirm(r.gagal[0].alasan)) return;
                r = await kirimMassal([{ warga_id: id, nominal: nom }], true);
            }
            if (r.tersimpan) App.toast(`${w.nama}: setoran ${rp(nom)} tersimpan.`);
            else if (r.gagal.length) App.toast(r.gagal[0].alasan, 'err');
            await loadSetoran();
        } finally { el.disabled = false; }
    };

    function renderSetoran() {
        const r = SS.data;
        if (!r || !$('#sList')) return;
        const cari = ($('#sCari') ? $('#sCari').value : '').trim().toLowerCase();
        const rows = r.warga.filter((w) => !cari || w.nama.toLowerCase().includes(cari));
        $('#sRingkas').innerHTML = `
            <span><b>${r.ringkasan.sudah_setor}</b> / ${r.ringkasan.total_warga} menyetor pada tanggal ini</span>
            <span>·</span><span>Masuk: <b>${rp(r.ringkasan.total_masuk)}</b></span>
            <span>·</span><span>Total kurang: <b>${rp(r.ringkasan.total_kurang)}</b></span>`;
        App.pgRedraw.setor = renderSetoran;
        const pg = App.paginate('setor', rows);
        SS.pgHtml = pg.bar;   // kontrol halaman digabung ke bilah simpan (bagi yang boleh mencatat)
        $('#sPg').innerHTML = App.has('jimpitan.tulis') ? '' : pg.bar;
        if (!rows.length) {
            $('#sList').innerHTML = '<div class="card empty">Tidak ada warga yang cocok.</div>';
        } else {
            $('#sList').innerHTML = pg.items.map((w) => {
                const val = SS.nominal.get(w.id);
                const tulis = App.has('jimpitan.tulis');
                const chips = w.setoran.map((x) => `<span class="chip ok-chip">${rp(x.nominal)} ${tulis ? `<button class="chip-x" data-act="batalSetoran" data-id="${esc(x.id)}" data-nama="${esc(w.nama)}" aria-label="Batalkan setoran ${rp(x.nominal)}">✕</button>` : ''}</span>`).join('');
                const bisa = !w.setoran.length && w.default > 0;
                return `<div class="item ${w.setoran.length ? 'done' : ''}${val > 0 ? ' dipilih' : ''}" data-row="${w.id}">
                    ${tulis ? `<label class="cek-setor" title="${bisa ? 'Pilih warga ini' : 'Sudah setor pada tanggal ini'}"><input type="checkbox" data-change="setorCek" data-id="${w.id}" aria-label="Pilih ${esc(w.nama)}" ${val > 0 ? 'checked' : ''} ${bisa ? '' : 'disabled'}></label>` : ''}
                    <div class="grow">
                        <div class="name">${esc(w.nama)} ${w.setoran.length ? '<span class="badge green">✓ Sudah setor</span>' : ''}</div>
                        <div class="meta"><span class="badge">RT ${esc(w.rt)}</span> ${lencanaSaldo(w)}</div>
                        ${chips ? `<div class="chips mt-sm">${chips}</div>` : ''}
                    </div>
                    <div class="nominal-box">
                        ${tulis ? `<input type="number" inputmode="numeric" min="1" step="1" placeholder="${w.default ? rp(w.default) : 'Rp 0'}" aria-label="Nominal setoran ${esc(w.nama)}" data-input="nominalSetoran" data-id="${w.id}" value="${val ? val : ''}">
                        <button class="btn sm" data-act="isiSaran" data-id="${w.id}" title="Isi nominal saran (${w.saran ? rp(w.saran) : 'kosong'})">${w.saran ? '+' + compact(w.saran) : '—'}</button>
                        <button class="btn sm primary" data-act="setorSatu" data-id="${w.id}" title="Simpan setoran warga ini sekarang">Setor</button>` : ''}
                        <button class="btn sm ghost" data-act="saldoWarga" data-id="${w.id}" data-nama="${esc(w.nama)}" title="Lihat saldo & riwayat">Saldo</button>
                        <button class="btn sm ghost" data-act="kalenderWarga" data-id="${w.id}" title="Lihat kalender setoran">Kalender</button>
                    </div></div>`;
            }).join('');
        }
        renderBar();
    }

    function compact(n) { return App.charts ? App.charts.compact(n) : String(n); }

    function renderBar() {
        const r = SS.data;
        const bar = $('#sBar');
        if (!r || !bar) return;
        if (!App.has('jimpitan.tulis')) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
        let n = 0, total = 0;
        for (const v of SS.nominal.values()) if (v > 0) { n += 1; total += v; }
        const belum = r.warga.filter((w) => !w.setoran.length && w.default > 0).length;
        const bisaPilih = r.warga.filter((w) => !w.setoran.length && w.default > 0);
        const semua = bisaPilih.length > 0 && bisaPilih.every((w) => SS.nominal.get(w.id) > 0);
        bar.innerHTML = `
            ${SS.pgHtml ? `<div class="savebar-pg">${SS.pgHtml}</div>` : ''}
            <div class="row gap-sm">
                <label class="row cek-row"><input type="checkbox" data-change="setorCekSemua" ${semua ? 'checked' : ''} ${bisaPilih.length ? '' : 'disabled'} aria-label="Pilih semua warga yang belum setor"> Pilih semua</label>
                <span class="badge blue"><b>${n}</b> warga dipilih</span>
                <span class="font-total">${rp(total)}</span>
            </div>
            <div class="row">
                <button class="btn sm" data-act="isiDefault" ${belum ? '' : 'disabled'} title="Isi nominal default: harian ${rp(r.tarif_harian || 0)}, mingguan ${rp((r.tarif_harian || 0) * 7)}, bulanan ${rp((r.tarif_harian || 0) * 30)}">Isi default (${belum})</button>
                <button class="btn sm ghost" data-act="kosongkanNominal" ${n ? '' : 'disabled'}>Reset</button>
                <button class="btn primary" data-act="simpanSetoran" ${n ? '' : 'disabled'}>Simpan Setoran</button>
            </div>`;
    }

    App.changes.setoranFilter = async () => {
        SS.tanggal = App.dPickVal('sTgl') || App.today();
        if (!App.rtKunci()) SS.rt = $('#sRt').value;
        await loadSetoran();
    };
    App.changes.setoranCari = () => { App.pgReset('setor'); renderSetoran(); };
    App.changes.nominalSetoran = (inp) => {
        const v = Math.floor(Number(inp.value));
        if (v > 0) SS.nominal.set(Number(inp.dataset.id), v); else SS.nominal.delete(Number(inp.dataset.id));
        renderBarSaja();
    };
    // Perbarui bilah simpan tanpa merender ulang daftar (agar fokus input tidak hilang)
    function renderBarSaja() { renderBar(); }

    App.changes.setorCek = (el) => {
        const w = SS.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w) return;
        if (el.checked && w.default > 0) SS.nominal.set(w.id, w.default); else SS.nominal.delete(w.id);
        renderSetoran();
    };
    // Pilih semua warga (sesuai filter RT & pencarian, semua halaman) yang belum setor: isi nominal default; hapus centang = kosongkan
    App.changes.setorCekSemua = (el) => {
        const cari = ($('#sCari').value || '').trim().toLowerCase();
        for (const w of SS.data.warga) {
            if (w.setoran.length || !(w.default > 0) || (cari && !w.nama.toLowerCase().includes(cari))) continue;
            if (el.checked) SS.nominal.set(w.id, w.default); else SS.nominal.delete(w.id);
        }
        renderSetoran();
    };
    App.actions.isiSaran = (el) => {
        const w = SS.data.warga.find((x) => x.id === Number(el.dataset.id));
        if (!w || !w.saran) return;
        SS.nominal.set(w.id, w.saran);
        const inp = $(`input[data-id="${w.id}"]`);
        if (inp) inp.value = w.saran;
        renderBar();
    };
    // Isi nominal default (harian x1, mingguan x7, bulanan x30) untuk warga yang belum setor pada tanggal ini (mengikuti filter RT & pencarian)
    App.actions.isiDefault = () => {
        const cari = ($('#sCari').value || '').trim().toLowerCase();
        for (const w of SS.data.warga) {
            if (!w.setoran.length && w.default > 0 && (!cari || w.nama.toLowerCase().includes(cari))) SS.nominal.set(w.id, w.default);
        }
        renderSetoran();
    };
    App.actions.isiSemuaSaran = () => {
        const cari = ($('#sCari').value || '').trim().toLowerCase();
        for (const w of SS.data.warga) {
            if (!w.setoran.length && w.saran > 0 && (!cari || w.nama.toLowerCase().includes(cari))) SS.nominal.set(w.id, w.saran);
        }
        renderSetoran();
    };
    App.actions.kosongkanNominal = () => { SS.nominal.clear(); renderSetoran(); };

    async function kirimMassal(items, abaikan) {
        return App.api('/api/setoran-massal', { method: 'POST', body: { tanggal: SS.tanggal, items, abaikan_duplikat: !!abaikan } });
    }
    App.actions.simpanSetoran = async (btn) => {
        const items = [...SS.nominal.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ warga_id: id, nominal: v }));
        if (!items.length) return;
        btn.disabled = true;
        try {
            let r = await kirimMassal(items, false);
            const nama = new Map(SS.data.warga.map((w) => [w.id, w.nama]));
            const dup = r.gagal.filter((g) => g.kode === 'DUPLIKAT');
            const lain = r.gagal.filter((g) => g.kode !== 'DUPLIKAT');
            let tersimpan = r.tersimpan, total = r.total;
            if (dup.length && window.confirm(`${dup.length} setoran tampak ganda (warga, tanggal, dan nominal sama dengan yang sudah tercatat):\n${dup.slice(0, 6).map((g) => '• ' + (nama.get(Number(g.warga_id)) || g.warga_id)).join('\n')}\n\nTetap simpan?`)) {
                const ids = new Set(dup.map((g) => Number(g.warga_id)));
                const r2 = await kirimMassal(items.filter((i) => ids.has(i.warga_id)), true);
                tersimpan += r2.tersimpan; total += r2.total;
                lain.push(...r2.gagal);
            }
            if (tersimpan) App.toast(`${tersimpan} setoran tersimpan (${rp(total)}).`);
            if (lain.length) App.toast(lain.slice(0, 3).map((g) => `${nama.get(Number(g.warga_id)) || g.warga_id}: ${g.alasan}`).join(' | '), 'err');
            await loadSetoran();
        } finally {
            btn.disabled = false;
        }
    };

    App.actions.batalSetoran = (el) => {
        App.dialog(`
            <h3>Batalkan setoran</h3>
            <p class="muted small mb-md">${esc(el.dataset.nama)} — setoran tidak dihapus, hanya ditandai batal dan tercatat di log. Saldo dihitung ulang otomatis.</p>
            <form data-form="batalSetoran" data-id="${esc(el.dataset.id)}">
                <label class="f" for="bAlasan">Alasan pembatalan</label>
                <input id="bAlasan" name="alasan" required minlength="3" maxlength="255" placeholder="mis. salah catat">
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Kembali</button>
                    <button type="submit" class="btn danger">Batalkan setoran</button>
                </div>
            </form>`);
    };
    App.forms.batalSetoran = async (f) => {
        await App.api('/api/setoran', { method: 'PUT', body: { id: f.dataset.id, alasan: f.alasan.value } });
        App.closeDialog();
        App.toast('Setoran dibatalkan.');
        if (App.tab === 'setoran') await loadSetoran(); else App.render();
    };


    /* ================= REKAP JIMPITAN per kumpulan RW ================= */
    const RK = (App.stRekap = { periode: '', data: null, cari: '' });
    const nf = (v) => Number(v || 0).toLocaleString('id-ID');

    async function tampilRekap(root) {
        root.innerHTML = `
            <h2 class="title">Setor Jimpitan / Iuran</h2>
            ${tabsSetoran()}
            <div id="rkOut">${App.loading()}</div>`;
        await muatRekap();
    }

    async function muatRekap() {
        const r = await App.api('/api/rekap-jimpitan?' + qs({ periode: RK.periode }));
        RK.data = r;
        RK.periode = r.periode.tanggal;
        gambarRekap();
    }

    const polaHtml = (p) => {
        p = p || {};
        const tot = (p.harian || 0) + (p.mingguan || 0) + (p.bulanan || 0);
        return `<div class="rk-pola">${[['harian', 'Harian'], ['mingguan', 'Mingguan'], ['bulanan', 'Bulanan']].map(([k, l]) => { const v = p[k] || 0; const pc = tot ? Math.round((v / tot) * 100) : 0; return `<div class="${v ? '' : 'nol'}"><span>${l}</span><i><u style="width:${pc}%"></u></i><b>${rp(v)}</b></div>`; }).join('')}</div>`;
    };

    function gambarRekap() {
        const r = RK.data;
        if (!r || !$('#rkOut')) return;
        const p = r.periode, t = r.total;
        const cari = RK.cari.trim().toLowerCase();
        const rows = r.warga.filter((w) => w.total > 0 && (!cari || w.nama.toLowerCase().includes(cari)));
        const grup = new Map();
        for (const w of rows) { if (!grup.has(w.rt)) grup.set(w.rt, []); grup.get(w.rt).push(w); }
        $('#rkOut').innerHTML = `
            <div class="card">
                <div class="filters">
                    <div class="grow">${App.htmlKPick({
                        id: 'rkPer', label: 'Kumpulan RW', change: 'rekapPeriode',
                        value: p.tanggal, items: App.kPickItems(r.daftar_periode, 'tanggal')
                    })}</div>
                </div>
                <p class="small muted mt-sm">Setoran jimpitan bertanggal <b>${App.tglId(p.dari)}</b> s.d. <b>${App.tglId(p.sampai)}</b> (cut off ${esc(App.labelKumpulan(p.no, p.tanggal))}).${p.hari_ini ? ' Hari ini kumpulan RW; dihitung sampai hari ini.' : ''}</p>
            </div>
            <div class="rk-baris spaced">
                <div class="stat rk-c0"><small>Total pemasukan jimpitan</small><b>${rp(t.total)}</b>
                    <span class="small muted stat-sub">${t.menyetor} / ${t.warga} warga menyetor</span>${polaHtml(t.pola)}</div>
                ${r.rt.map((g, i) => `<div class="stat rk-c${(i % 3) + 1}"><small>RT ${esc(g.rt)}</small><b>${rp(g.total)}</b>
                    <span class="small muted stat-sub">${g.menyetor} / ${g.warga} warga menyetor</span>${polaHtml(g.pola)}</div>`).join('')}
            </div>
            <h3 class="sec-title">Rincian per warga</h3>
            <div class="card">
                <div class="filters"><div class="grow"><label class="f" for="rkCari">Cari nama</label><input id="rkCari" placeholder="Ketik nama…" value="${esc(RK.cari)}" data-input="rekapCari" maxlength="60"></div></div>
                ${grup.size ? `<div class="rk-kolom" style="--n:${Math.min(3, grup.size)}">
                ${[...grup.entries()].map(([rt, list]) => `<section class="rk-rtcol rk-c${(Math.max(0, r.rt.findIndex((g) => g.rt === rt)) % 3) + 1}">
                    <header><b>RT ${esc(rt)}</b><span>${rp(list.reduce((a, w) => a + w.total, 0))}</span></header>
                    <ul>${list.map((w) => `<li><span>${esc(w.nama)}</span><b>${rp(w.total)}</b></li>`).join('')}</ul>
                    <footer><span>${list.length} warga</span><b>${rp(list.reduce((a, w) => a + w.total, 0))}</b></footer></section>`).join('')}
                </div>`
                : '<div class="empty mt-md">Belum ada setoran pada kumpulan ini.</div>'}
            </div>`;
    }

    App.changes.rekapPeriode = async (el) => { RK.periode = el.value || App.kPickVal('rkPer'); await muatRekap(); };
    App.changes.rekapCari = (inp) => {
        RK.cari = inp.value;
        gambarRekap();
        const e = $('#rkCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    };

    /* ---------- saldo & riwayat satu warga ---------- */
    const baris = (x) => `<tr class="${x.status === 'batal' ? 'opacity-dim' : ''}"><td>${tglPendek(x.tanggal)}</td><td class="r num">${rp(x.nominal)}</td><td>${esc(x.petugas || '-')}</td>
        <td>${x.status === 'sah' ? '<span class="badge green">sah</span>' : `<span class="badge red" title="${esc(x.alasan_batal || '')}">batal${x.alasan_batal ? ': ' + esc(x.alasan_batal) : ''}</span>`}</td></tr>`;
    const tabelRiwayat = (arr, kosong) => (arr.length
        ? `<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th><th>Petugas</th><th>Status</th></tr></thead><tbody>${arr.map(baris).join('')}</tbody></table></div>`
        : `<div class="empty">${kosong}</div>`);
    // Banner status: kurang (merah) / titipan (hijau) / lunas (hijau)
    const banner = (kurang, lebih, ketKurang, ketLebih, ketLunas) => kurang > 0
        ? `<div class="rw-status bad"><span class="rw-ic">!</span><div><small>Kekurangan</small><b>${rp(kurang)}</b><em>${ketKurang}</em></div></div>`
        : lebih > 0
            ? `<div class="rw-status good"><span class="rw-ic">+</span><div><small>Kelebihan (titipan)</small><b>${rp(lebih)}</b><em>${ketLebih}</em></div></div>`
            : `<div class="rw-status good"><span class="rw-ic">✓</span><div><small>Status</small><b>Lunas</b><em>${ketLunas}</em></div></div>`;
    const progres = (terbayar, wajib) => {
        const pc = wajib > 0 ? Math.min(100, Math.round((terbayar / wajib) * 100)) : (terbayar > 0 ? 100 : 0);
        return `<div class="rw-prog"><div class="rw-prog-t"><span>Terbayar ${rp(terbayar)}</span><span>dari ${rp(wajib)} · <b>${pc}%</b></span></div><div class="rw-bar ${pc >= 100 ? 'ok' : ''}"><i style="width:${pc}%"></i></div></div>`;
    };

    App.actions.saldoWarga = async (el) => {
        const r = await App.api('/api/saldo?warga_id=' + encodeURIComponent(el.dataset.id));
        const s = r.saldo, ih = r.iuran_hitung || { aktif: false };
        // Riwayat warga mengabaikan pola setor (harian/mingguan/bulanan): kurang = selisih nyata sampai hari ini
        const kurang = Math.max(0, -s.saldo);
        const hariKurang = r.tarif_harian > 0 ? Math.ceil(kurang / r.tarif_harian) : 0;
        const jimpitan = `
            ${banner(kurang, s.lebih,
                `≈ ${hariKurang} hari${s.lama_sisa ? ` · termasuk tunggakan lama ${rp(s.lama_sisa)}` : ''}`,
                `Menutup ±${s.hari_tertutup} hari ke depan · lunas sampai ${tglPendek(s.lunas_sampai)}`,
                s.tagihan_berjalan > 0 ? `Tagihan berjalan ${rp(s.tagihan_berjalan)}` : 'Lunas sampai hari ini')}
            ${progres(s.terbayar, s.kewajiban_berjalan + (s.lama || 0))}
            <dl class="rw-rumus">
                <div><dt>Kewajiban sejak ${tglPendek(r.mulai_hitung)} <small>(${rp(r.tarif_harian)}/hari)</small></dt><dd>${rp(s.kewajiban_berjalan)}</dd></div>
                ${s.lama ? `<div><dt>Tunggakan lama</dt><dd>${rp(s.lama)}</dd></div>` : ''}
                <div><dt>Total setoran dihitung</dt><dd>− ${rp(s.terbayar)}</dd></div>
                <div class="hasil ${s.saldo < 0 ? 'bad' : 'good'}"><dt>Saldo</dt><dd>${s.saldo < 0 ? '− ' + rp(-s.saldo) : rp(s.saldo)}</dd></div>
            </dl>
            <h4 class="rw-sub">Riwayat setoran <small>${r.setoran.length} terakhir</small></h4>
            ${tabelRiwayat(r.setoran, 'Belum ada setoran jimpitan.')}`;
        let iuran;
        if (!ih.aktif) {
            iuran = `<div class="empty">Iuran wajib belum diaktifkan di Pengaturan.</div>${tabelRiwayat(r.iuran, 'Belum ada pembayaran iuran wajib.')}`;
        } else if (ih.bebas) {
            iuran = `<div class="rw-status good"><span class="rw-ic">✓</span><div><small>Status</small><b>Bebas iuran kas</b><em>Warga ini tidak wajib iuran. Pembayaran sukarela tercatat ${rp(ih.terbayar)}.</em></div></div>
                <h4 class="rw-sub">Riwayat pembayaran <small>${r.iuran_total.jumlah}× sah</small></h4>${tabelRiwayat(r.iuran, 'Belum ada pembayaran iuran wajib.')}`;
        } else {
            const tgk = ih.kurang > 0 ? ` (${ih.periode_kurang} kumpulan sudah lewat, ${rp(ih.kurang)})` : '';
            iuran = `
                ${banner(ih.tagihan_berjalan, ih.lebih,
                    `Termasuk kumpulan berjalan${tgk}`,
                    `Menutup ±${ih.periode_lebih} kumpulan ke depan (${rp(ih.nominal_sekarang)}/kumpulan)`,
                    'Semua kumpulan sampai saat ini sudah terbayar')}
                ${progres(ih.terbayar, ih.kewajiban)}
                <dl class="rw-rumus">
                    <div><dt>Kewajiban ${ih.periode.length} kumpulan <small>(${rp(ih.nominal_sekarang)}/kumpulan)</small></dt><dd>${rp(ih.kewajiban)}</dd></div>
                    <div><dt>Total iuran dibayar</dt><dd>− ${rp(ih.terbayar)}</dd></div>
                    <div class="hasil ${ih.saldo < 0 ? 'bad' : 'good'}"><dt>Saldo</dt><dd>${ih.saldo < 0 ? '− ' + rp(-ih.saldo) : rp(ih.saldo)}</dd></div>
                </dl>
                ${ih.periode.length ? `<h4 class="rw-sub">Status per kumpulan <small>terbayar lebih dulu ke kumpulan tertua</small></h4>
                <div class="rw-kump">${ih.periode.slice().reverse().map((x) => `<div class="rw-k ${x.status}" title="${esc(tglPendek(x.mulai))} s.d. ${esc(tglPendek(x.akhir))}: ${rp(x.dibayar)} dari ${rp(x.nominal)}">
                    <b>K${x.no}</b><span>${x.status === 'lunas' ? 'Lunas' : x.status === 'sebagian' ? rp(x.dibayar) + '/' + rp(x.nominal) : 'Belum'}</span></div>`).join('')}</div>` : ''}
                <h4 class="rw-sub">Riwayat pembayaran <small>${r.iuran_total.jumlah}× sah · ${rp(r.iuran_total.total)}</small></h4>
                ${tabelRiwayat(r.iuran, 'Belum ada pembayaran iuran wajib.')}`;
        }
        const punyaIuran = ih.aktif || r.iuran.length;
        App.dialog(`
            <div class="rw-dlg">
                <div class="rw-head"><div class="rw-ava">${esc((r.warga.nama || '?').trim().charAt(0).toUpperCase())}</div>
                    <div><h3>${esc(r.warga.nama)}</h3><div class="small muted">RT ${esc(r.warga.rt)} · pola ${esc(r.warga.jenis)} · #${r.warga.id}</div></div></div>
                <div class="subtabs rw-tabs">
                    <button type="button" class="tab active" data-act="riwTab" data-nilai="j">Jimpitan${kurang > 0 ? ' <i class="rw-dot bad"></i>' : ''}</button>
                    ${punyaIuran ? `<button type="button" class="tab" data-act="riwTab" data-nilai="i">Iuran Wajib${ih.aktif && !ih.bebas && ih.tagihan_berjalan > 0 ? ' <i class="rw-dot bad"></i>' : ''}</button>` : ''}
                </div>
                <div class="rw-pane" data-pane="j">${jimpitan}</div>
                ${punyaIuran ? `<div class="rw-pane" data-pane="i" hidden>${iuran}</div>` : ''}
                <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>
            </div>`);
    };
    App.actions.riwTab = (el) => {
        const box = el.closest('.rw-dlg');
        if (!box) return;
        box.querySelectorAll('.rw-tabs .tab').forEach((t) => t.classList.toggle('active', t === el));
        box.querySelectorAll('.rw-pane').forEach((p) => { p.hidden = p.dataset.pane !== el.dataset.nilai; });
    };

    /* ================= TUNGGAKAN ================= */
    const TS = (App.stTunggakan = { rt: '', jenis: '', q: '' });

    App.views.tunggakan = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        if (App.rtKunci()) TS.rt = App.user.rt || '';
        root.innerHTML = `
            <h2 class="title">Tunggakan</h2>
            <div class="card">
                <div class="filters">
                    <div><label class="f" for="tRt">RT</label><select id="tRt" data-change="tunggakanFilter" ${App.rtKunci() ? 'disabled' : ''}>${optRt(TS.rt)}</select></div>
                    <div><label class="f" for="tJenis">Pola setor</label><select id="tJenis" data-change="tunggakanFilter">${optJenis(TS.jenis)}</select></div>
                    <div><label class="f" for="tQ">Cari nama</label><input id="tQ" value="${esc(TS.q)}" maxlength="60" placeholder="Ketik nama…" data-change="tunggakanFilter"></div>
                </div>
                <div id="tInfo" class="small muted"></div>
            </div>
            <div id="tOut">${App.loading()}</div>`;
        await loadTunggakan();
    };

    async function loadTunggakan() {
        const r = await App.api('/api/tunggakan?' + qs({ rt: TS.rt, jenis: TS.jenis, q: TS.q }));
        App.stTunggakan.data = r;
        const s = r.ringkasan;
        $('#tInfo').textContent = `Kewajiban Rp ${Number(r.tarif_harian).toLocaleString('id-ID')}/hari sejak ${tglPendek(r.mulai_hitung)}. Tunggakan dihitung pada jatuh tempo pola warga (harian: kemarin, mingguan: Minggu terakhir, bulanan: akhir bulan).`;
        const hit = (j) => r.tunggakan.filter((x) => x.jenis === j).reduce((a, x) => a + x.kurang, 0);
        $('#tOut').innerHTML = `
            <div class="rk-baris mb">
                <div class="stat rk-c0"><small>Total tunggakan</small><b class="val-out">${rp(s.total)}</b><span class="small muted stat-sub">${s.warga_menunggak} warga menunggak</span>
                    <div class="rk-pola">${['harian', 'mingguan', 'bulanan'].map((j) => `<div><span>${j[0].toUpperCase() + j.slice(1)}</span><i><u style="width:${s.total ? Math.round((hit(j) / s.total) * 100) : 0}%"></u></i><b>${rp(hit(j))}</b></div>`).join('')}</div></div>
                <div class="stat rk-c2"><small>Tunggakan berjalan</small><b>${rp(s.total_rutin)}</b></div>
                <div class="stat rk-c3"><small>Tunggakan lama</small><b>${rp(s.total_lama)}</b></div>
                <div class="stat rk-c1"><small>Titipan warga</small><b class="val-in">${rp(s.titipan)}</b><span class="small muted stat-sub">${s.warga_titipan} warga</span></div>
            </div>
            <div id="tPg"></div><div id="tList"></div>`;
        App.pgReset('tunggakan');
        App.pgRedraw.tunggakan = tampilTunggakan;
        tampilTunggakan();
    }

    function tampilTunggakan() {
        const arr = (App.stTunggakan.data || { tunggakan: [] }).tunggakan;
        const pg = App.paginate('tunggakan', arr, { selalu: true });
        $('#tPg').innerHTML = `<div class="card bar-satu"><div class="bs-filter muted small">${arr.length} warga menunggak · urut kekurangan terbesar</div><div class="bs-pager">${pg.bar}</div></div>`;
        $('#tList').innerHTML = arr.length ? `<div class="card tbl-card"><div class="tbl-wrap"><table class="tbl-peng"><thead><tr><th>Nama</th><th>RT</th><th>Pola</th><th>Jatuh tempo</th><th class="r">Berjalan</th><th class="r">Lama</th><th class="r">Kurang</th><th></th></tr></thead><tbody>
            ${pg.items.map(barisTunggakan).join('')}</tbody><tfoot><tr><td colspan="6"><b>Total halaman ini</b></td><td class="r num"><b class="val-out">${rp(pg.items.reduce((a, x) => a + x.kurang, 0))}</b></td><td></td></tr></tfoot></table></div></div>`
            : '<div class="card empty">Tidak ada tunggakan. 🎉</div>';
    }

    function barisTunggakan(t) {
        const hp = String(t.no_hp || '').replace(/\D/g, '');
        const wa = hp ? (hp.startsWith('0') ? '62' + hp.slice(1) : hp) : '';
        const pesan = `Assalamu'alaikum, Bapak/Ibu ${t.nama}. Kami dari pengurus RW 03 Dukuh Pencil mengingatkan jimpitan/iuran yang masih kurang sebesar ${rp(t.kurang)}. Terima kasih atas perhatiannya.`;
        return `<tr>
            <td style="white-space:normal;min-width:150px"><b>${esc(t.nama)}</b><div class="small muted">≈ ${t.hari_kurang} hari</div></td>
            <td>${esc(t.rt)}</td><td>${jenisBadge(t.jenis)}</td><td class="nowrap">${tglPendek(t.jatuh_tempo).slice(0, 5)}</td>
            <td class="r num">${t.berjalan_kurang ? rp(t.berjalan_kurang) : '-'}</td><td class="r num">${t.lama_sisa ? rp(t.lama_sisa) : '-'}</td>
            <td class="r num"><b class="val-out">${rp(t.kurang)}</b></td>
            <td class="r nowrap">
                ${App.has('jimpitan.tulis') ? `<button class="btn sm primary" data-act="bayarKurang" data-w="${t.id}" data-nama="${esc(t.nama)}" data-kurang="${t.kurang}">Bayar</button>` : ''}
                <button class="btn sm ghost" data-act="saldoWarga" data-id="${t.id}" data-nama="${esc(t.nama)}">Riwayat</button>
                ${wa ? `<a class="btn sm" style="color:var(--green);border-color:var(--green-border);background:var(--green-bg)" target="_blank" rel="noopener noreferrer" href="https://wa.me/${wa}?text=${encodeURIComponent(pesan)}">WA</a>` : ''}</td></tr>`;
    }

    App.changes.tunggakanFilter = async () => {
        if (!App.rtKunci()) TS.rt = $('#tRt').value;
        TS.jenis = $('#tJenis').value;
        TS.q = $('#tQ').value.trim();
        await loadTunggakan();
    };

    App.actions.bayarKurang = (el) => {
        App.dialog(`
            <h3>Setoran — ${esc(el.dataset.nama)}</h3>
            <form data-form="bayarKurang" data-w="${esc(el.dataset.w)}">
                <div class="form-grid">
                    <div><label class="f" for="bkNom">Nominal (Rp) — bebas, isian awal = kekurangan</label>
                    <input type="number" id="bkNom" name="nominal" min="1" step="1" inputmode="numeric" value="${esc(el.dataset.kurang)}" required></div>
                    <div>${App.htmlDPick({ id: 'bkTgl', name: 'tanggal', label: 'Tanggal diterima', value: App.today(), max: App.today(), required: true })}</div>
                </div>
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Batal</button>
                    <button type="submit" class="btn primary">Simpan</button>
                </div>
            </form>`);
    };
    App.forms.bayarKurang = async (f) => {
        const body = { warga_id: Number(f.dataset.w), nominal: Number(f.nominal.value), tanggal: f.tanggal.value };
        let r;
        try {
            r = await App.api('/api/setoran', { method: 'POST', body });
        } catch (e) {
            if (/Yakin menambah lagi/.test(e.message) && window.confirm(e.message)) {
                r = await App.api('/api/setoran', { method: 'POST', body: { ...body, abaikan_duplikat: true } });
            } else throw e;
        }
        App.closeDialog();
        App.toast(`Tersimpan. ${kalimatSaldo(r.ringkasan)}.`);
        await loadTunggakan();
    };

    /* ================= WARGA ================= */
    const WS = (App.stWarga = { rt: '', jenis: '', aktif: '1', iuran: '', q: '', list: [] });

    App.views.warga = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        if (App.rtKunci()) WS.rt = App.user.rt || '';
        const kelola = App.has('warga.kelola');
        root.innerHTML = `
            <div class="row between"><h2 class="title">Data Warga</h2>
            ${kelola ? '<button class="btn primary" data-act="wargaForm">+ Tambah warga</button>' : ''}</div>
            <div class="card">
                <div class="filters">
                    <div><label class="f" for="wRt">RT</label><select id="wRt" data-change="wargaFilter" ${App.rtKunci() ? 'disabled' : ''}>${optRt(WS.rt)}</select></div>
                    <div><label class="f" for="wJenis">Jenis</label><select id="wJenis" data-change="wargaFilter">${optJenis(WS.jenis)}</select></div>
                    <div><label class="f" for="wAktif">Status</label><select id="wAktif" data-change="wargaFilter">
                        <option value="1" ${WS.aktif === '1' ? 'selected' : ''}>Aktif</option><option value="0" ${WS.aktif === '0' ? 'selected' : ''}>Nonaktif</option><option value="all" ${WS.aktif === 'all' ? 'selected' : ''}>Semua</option></select></div>
                    <div><label class="f" for="wIu">Iuran kas</label><select id="wIu" data-change="wargaFilter">
                        <option value="" ${WS.iuran === '' ? 'selected' : ''}>Semua</option><option value="1" ${WS.iuran === '1' ? 'selected' : ''}>Wajib iuran kas</option><option value="0" ${WS.iuran === '0' ? 'selected' : ''}>Bebas iuran kas</option></select></div>
                    <div><label class="f" for="wQ">Cari nama</label><input id="wQ" value="${esc(WS.q)}" maxlength="60" placeholder="Ketik nama…" data-change="wargaFilter"></div>
                </div>
            </div>
            <div id="wKartu"></div>
            <div id="wPg"></div><div id="wList"></div>`;
        await loadWarga();
    };

    async function loadWarga() {
        const r = await App.api('/api/warga?' + qs({ rt: WS.rt, jenis: WS.jenis, aktif: WS.aktif, ikut_iuran: WS.iuran, q: WS.q }));
        WS.list = r.warga;
        App.pgReset('warga');
        App.pgRedraw.warga = tampilWarga;
        tampilWarga();
    }

    function tampilWarga() {
        const kelola = App.has('warga.kelola');
        const pg = App.paginate('warga', WS.list, { selalu: true });
        const L = WS.list;
        const aktif = L.filter((w) => w.aktif).length;
        const bebasJ = L.filter((w) => !w.ikut_jimpitan).length;
        const bebasI = L.filter((w) => !w.ikut_iuran).length;
        $('#wKartu').innerHTML = `<div class="rk-baris mb-lg">
            <div class="stat rk-c0"><small>Total warga</small><b>${L.length}</b></div>
            <div class="stat rk-c1"><small>Aktif</small><b>${aktif}</b><span class="small muted stat-sub">${L.length - aktif} nonaktif</span></div>
            <div class="stat rk-c2"><small>Bebas jimpitan</small><b>${bebasJ}</b></div>
            <div class="stat rk-c3"><small>Bebas iuran kas</small><b>${bebasI}</b></div></div>`;
        $('#wPg').innerHTML = `<div class="card bar-satu"><div class="bs-filter muted small">${L.length} warga ditemukan</div><div class="bs-pager">${pg.bar}</div></div>`;
        $('#wList').innerHTML = L.length ? `<div class="card tbl-card"><div class="tbl-wrap"><table class="tbl-peng"><thead><tr><th>Nama</th><th>RT</th><th>Pola setor</th><th>No HP</th><th>Kewajiban</th><th></th></tr></thead><tbody>
            ${pg.items.map((w) => `<tr style="${w.aktif ? '' : 'opacity:.6'}">
                <td style="white-space:normal;min-width:160px"><b>${esc(w.nama)}</b> <span class="small muted">#${w.id}</span>${w.aktif ? '' : ' <span class="badge red">nonaktif</span>'}</td>
                <td>${esc(w.rt)}</td><td>${jenisBadge(w.jenis)}</td><td class="nowrap">${esc(w.no_hp || '-')}</td>
                <td style="white-space:normal">${w.ikut_jimpitan ? '<span class="badge green">Jimpitan</span>' : `<span class="badge amber">${w.jimpitan_berhenti ? 'Jimpitan s.d. ' + App.tglId(w.jimpitan_berhenti) : 'Bebas jimpitan'}</span>`}
                    ${w.ikut_iuran ? '<span class="badge green">Iuran kas</span>' : `<span class="badge amber">${w.iuran_berhenti ? 'Iuran kas s.d. ' + App.tglId(w.iuran_berhenti) : 'Bebas iuran kas'}</span>`}
                    ${w.ikut_tabungan ? '<span class="badge blue">Tabungan</span>' : ''}</td>
                <td class="r nowrap">
                    ${App.has('jimpitan.lihat') ? `<button class="btn sm" data-act="riwayatWarga" data-id="${w.id}">Riwayat</button>` : ''}
                    ${kelola ? `<button class="btn sm" data-act="wargaForm" data-id="${w.id}">Ubah</button>` : ''}</td></tr>`).join('')}
            </tbody></table></div></div>` : '<div class="card empty">Tidak ada data.</div>';
    }

    App.changes.wargaFilter = async () => {
        if (!App.rtKunci()) WS.rt = $('#wRt').value;
        WS.jenis = $('#wJenis').value;
        WS.aktif = $('#wAktif').value;
        WS.iuran = $('#wIu').value;
        WS.q = $('#wQ').value.trim();
        await loadWarga();
    };

    App.actions.wargaForm = (el) => {
        const w = el.dataset.id ? WS.list.find((x) => x.id === Number(el.dataset.id)) : null;
        const v = w || { nama: '', rt: WS.rt || '007', jenis: 'bulanan', no_hp: '', alamat: '', mulai_iuran: '', catatan: '', aktif: 1, ikut_jimpitan: 1, ikut_iuran: 1, ikut_tabungan: 0 };
        const cek = (on) => on ? 'checked' : '';
        App.dialog(`
            <div class="dlg-warga">
                <header class="dlg-warga-head">
                    <div class="dlg-warga-ava">${esc((v.nama || '?').trim().charAt(0).toUpperCase())}</div>
                    <div>
                        <h3>${w ? 'Ubah warga' : 'Tambah warga'}</h3>
                        <p class="small muted">${w ? `#${w.id} · RT ${esc(v.rt)}` : 'Data warga baru'}</p>
                    </div>
                </header>
                <form data-form="warga" data-id="${w ? w.id : ''}">
                    <section class="dlg-sec">
                        <h4 class="dlg-sec-t">Identitas</h4>
                        <div class="form-grid">
                            <div class="full"><label class="f" for="fwNama">Nama</label><input id="fwNama" name="nama" value="${esc(v.nama)}" required minlength="2" maxlength="150" autocomplete="name"></div>
                            <div><label class="f" for="fwRt">RT</label><select id="fwRt" name="rt">${optRt(v.rt, false)}</select></div>
                            <div><label class="f" for="fwJenis">Jenis setoran</label><select id="fwJenis" name="jenis">${JENIS.map((j) => `<option value="${j}" ${v.jenis === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
                            <div><label class="f" for="fwHp">No HP / WhatsApp</label><input id="fwHp" name="no_hp" value="${esc(v.no_hp || '')}" inputmode="tel" maxlength="20" placeholder="08xxxxxxxxxx"></div>
                            <div>${App.htmlDPick({ id: 'fwMulai', name: 'mulai_iuran', label: 'Mulai iuran', value: App.ymd(v.mulai_iuran) })}</div>
                            <div class="full"><label class="f" for="fwAlamat">Alamat</label><input id="fwAlamat" name="alamat" value="${esc(v.alamat || '')}" maxlength="200"></div>
                            <div class="full"><label class="f" for="fwCat">Catatan</label><input id="fwCat" name="catatan" value="${esc(v.catatan || '')}" maxlength="255"></div>
                        </div>
                    </section>
                    <section class="dlg-sec">
                        <h4 class="dlg-sec-t">Program</h4>
                        <div class="chk-grid">
                            <label class="chk-card">
                                <input type="checkbox" id="fwIJ" name="ikut_jimpitan" data-change="wargaIkut" ${cek(v.ikut_jimpitan !== 0)}>
                                <span class="chk-card-b"><b>Jimpitan</b><small>Iuran harian / mingguan / bulanan</small></span>
                            </label>
                            <div class="chk-extra" id="fwJBox" ${v.ikut_jimpitan === 0 ? '' : 'hidden'}>
                                ${App.htmlDPick({ id: 'fwJB', name: 'jimpitan_berhenti', label: 'Wajib sampai tanggal', value: App.ymd(v.jimpitan_berhenti) })}
                            </div>
                            <label class="chk-card">
                                <input type="checkbox" id="fwII" name="ikut_iuran" data-change="wargaIkut" ${cek(v.ikut_iuran !== 0)}>
                                <span class="chk-card-b"><b>Iuran kas</b><small>Per kumpulan RW</small></span>
                            </label>
                            <div class="chk-extra" id="fwIBox" ${v.ikut_iuran === 0 ? '' : 'hidden'}>
                                ${App.htmlDPick({ id: 'fwIB', name: 'iuran_berhenti', label: 'Wajib sampai tanggal', value: App.ymd(v.iuran_berhenti) })}
                            </div>
                            <label class="chk-card">
                                <input type="checkbox" id="fwIT" name="ikut_tabungan" ${cek(!!v.ikut_tabungan)}>
                                <span class="chk-card-b"><b>Tabungan</b><small>Ikut program tabungan</small></span>
                            </label>
                        </div>
                    </section>
                    ${w ? `<section class="dlg-sec dlg-sec-status">
                        <label class="chk-card chk-card-status">
                            <input type="checkbox" id="fwAktif" name="aktif" ${cek(!!v.aktif)}>
                            <span class="chk-card-b"><b>Warga aktif</b><small>Nonaktifkan jika pindah / berhenti</small></span>
                        </label>
                    </section>` : ''}
                    <div class="dlg-actions">
                        <button type="button" class="btn" data-act="closeDialog">Batal</button>
                        <button type="submit" class="btn primary">Simpan</button>
                    </div>
                </form>
            </div>`);
    };
    App.changes.wargaIkut = (cb) => {
        const box = $(cb.name === 'ikut_jimpitan' ? '#fwJBox' : '#fwIBox');
        if (box) box.hidden = !!cb.checked;
    };
    App.forms.warga = async (f) => {
        const body = {
            nama: f.nama.value, rt: f.rt.value, jenis: f.jenis.value, no_hp: f.no_hp.value, alamat: f.alamat.value,
            mulai_iuran: f.mulai_iuran.value, catatan: f.catatan.value,
            ikut_jimpitan: f.ikut_jimpitan.checked, jimpitan_berhenti: f.jimpitan_berhenti.value,
            ikut_iuran: f.ikut_iuran.checked, iuran_berhenti: f.iuran_berhenti.value,
            ikut_tabungan: f.ikut_tabungan.checked
        };
        if (f.dataset.id) {
            body.id = Number(f.dataset.id);
            body.aktif = f.aktif.checked;
            await App.api('/api/warga', { method: 'PUT', body });
        } else {
            await App.api('/api/warga', { method: 'POST', body });
        }
        App.closeDialog();
        App.toast('Data warga disimpan.');
        await loadWarga();
    };

    App.actions.riwayatWarga = (el) => App.actions.saldoWarga(el);
})();
