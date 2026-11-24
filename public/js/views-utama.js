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

    const tglPendek = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : '-');

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
                <p class="small" id="sPetunjuk" style="margin-bottom:10px"></p>
                <div class="filters">
                    <div><label class="f" for="sTgl">Tanggal setor</label><input type="date" id="sTgl" value="${esc(SS.tanggal)}" max="${App.today()}" data-change="setoranFilter"></div>
                    <div><label class="f" for="sRt">RT</label><select id="sRt" data-change="setoranFilter" ${App.rtKunci() ? 'disabled' : ''}>${optRt(SS.rt)}</select></div>
                    <div><label class="f" for="sCari">Cari nama</label><input id="sCari" placeholder="Ketik nama…" data-input="setoranCari" maxlength="60"></div>
                </div>
                <div id="sRingkas" class="row small muted" style="margin-top:8px"></div>
            </div>
            <div id="sPg"></div>
            <div id="sList" class="list"></div>
            <div class="savebar" id="sBar"></div>`;
        await loadSetoran();
    };

    async function loadSetoran() {
        SS.nominal.clear();
        $('#sList').innerHTML = App.loading();
        App.pgReset('setor');
        SS.data = await App.api('/api/daftar-setoran?' + qs({ tanggal: SS.tanggal, rt: SS.rt, jenis: SS.jenis }));
        petunjukSetor();
        renderSetoran();
    }

    function petunjukSetor() {
        const el = $('#sPetunjuk');
        if (!el || !SS.data) return;
        const t = SS.data.tarif_harian;
        const hb = new Date(Number(SS.tanggal.slice(0, 4)), Number(SS.tanggal.slice(5, 7)), 0).getDate();
        const txt = {
            harian: `Warga <b>harian</b> menyetor tiap hari. Saran: ${rp(t)} (1 hari).`,
            mingguan: `Warga <b>mingguan</b> menyetor seminggu sekali. Saran: ${rp(t * 7)} (7 hari).`,
            bulanan: `Warga <b>bulanan</b> menyetor sebulan sekali. Saran: ${rp(t * 30)} (30 hari).`
        }[SS.jenis];
        if (!App.has('jimpitan.tulis')) { el.innerHTML = `${txt.replace(/ Saran:.*$/, '')} <b>Anda hanya dapat melihat.</b> Pencatatan setoran dilakukan Bendahara Jimpitan; gunakan Saldo dan Kalender untuk melihat riwayat warga.`; return; }
        el.innerHTML = `${txt} Ketik nominal lalu tekan <b>Setor</b>, atau isi beberapa warga dan tekan <b>Simpan Setoran</b>. Nominal boleh berapa pun; kelebihan jadi titipan, kekurangan jadi tunggakan.`;
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
                return `<div class="item ${w.setoran.length ? 'done' : ''}" data-row="${w.id}">
                    <div class="grow">
                        <div class="name">${esc(w.nama)} ${w.setoran.length ? '<span class="badge green">✓ Sudah setor</span>' : ''}</div>
                        <div class="meta"><span class="badge">RT ${esc(w.rt)}</span> ${lencanaSaldo(w)}</div>
                        ${chips ? `<div class="chips" style="margin-top:6px">${chips}</div>` : ''}
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
        bar.innerHTML = `
            ${SS.pgHtml ? `<div class="savebar-pg">${SS.pgHtml}</div>` : ''}
            <div class="row" style="gap:8px">
                <span class="badge blue"><b>${n}</b> warga dipilih</span>
                <span style="font-weight:700;font-size:1.15rem;color:var(--text);font-variant-numeric:tabular-nums">${rp(total)}</span>
            </div>
            <div class="row">
                <button class="btn sm" data-act="isiDefault" ${belum ? '' : 'disabled'} title="Isi nominal default: harian ${rp(r.tarif_harian || 0)}, mingguan ${rp((r.tarif_harian || 0) * 7)}, bulanan ${rp((r.tarif_harian || 0) * 30)}">Isi default (${belum})</button>
                <button class="btn sm ghost" data-act="kosongkanNominal" ${n ? '' : 'disabled'}>Reset</button>
                <button class="btn primary" data-act="simpanSetoran" ${n ? '' : 'disabled'}>Simpan Setoran</button>
            </div>`;
    }

    App.changes.setoranFilter = async () => {
        SS.tanggal = $('#sTgl').value || App.today();
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
            <p class="muted small" style="margin-bottom:12px">${esc(el.dataset.nama)} — setoran tidak dihapus, hanya ditandai batal dan tercatat di log. Saldo dihitung ulang otomatis.</p>
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
                    <div class="grow"><label class="f" for="rkPer">Kumpulan RW</label><select id="rkPer" data-change="rekapPeriode">
                        ${r.daftar_periode.map((x) => `<option value="${esc(x.tanggal)}" ${x.tanggal === p.tanggal ? 'selected' : ''}>Kumpulan ke-${x.no} · ${esc(x.weton)} ${App.tglId(x.tanggal)}${x.hari_ini ? ' · hari ini' : ''}</option>`).join('')}</select></div>
                </div>
                <p class="small muted" style="margin-top:8px">Setoran jimpitan bertanggal <b>${App.tglId(p.dari)}</b> s.d. <b>${App.tglId(p.sampai)}</b> (cut off kumpulan ke-${p.no}).${p.hari_ini ? ' Hari ini kumpulan RW; dihitung sampai hari ini.' : ''}</p>
            </div>
            <div class="rk-baris" style="margin:14px 0">
                <div class="stat rk-c0"><small>Total pemasukan jimpitan</small><b>${rp(t.total)}</b>
                    <span class="small muted" style="display:block;margin-top:4px">${t.menyetor} / ${t.warga} warga menyetor</span></div>
                ${r.rt.map((g, i) => `<div class="stat rk-c${(i % 3) + 1}"><small>RT ${esc(g.rt)}</small><b>${rp(g.total)}</b>
                    <span class="small muted" style="display:block;margin-top:4px">${g.menyetor} / ${g.warga} warga menyetor</span></div>`).join('')}
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
                : '<div class="empty" style="margin-top:10px">Belum ada setoran pada kumpulan ini.</div>'}
            </div>`;
    }

    App.changes.rekapPeriode = async (el) => { RK.periode = el.value; await muatRekap(); };
    App.changes.rekapCari = (inp) => {
        RK.cari = inp.value;
        gambarRekap();
        const e = $('#rkCari');
        if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    };

    /* ---------- saldo & riwayat satu warga ---------- */
    App.actions.saldoWarga = async (el) => {
        const r = await App.api('/api/saldo?warga_id=' + encodeURIComponent(el.dataset.id));
        const s = r.saldo;
        const status = s.kurang > 0
            ? `<div class="cek-total bad">Kurang ${rp(s.kurang)}</div><p class="small muted">≈ ${s.hari_kurang} hari${s.lama_sisa ? ` · tunggakan lama ${rp(s.lama_sisa)}` : ''}</p>`
            : s.lebih > 0
                ? `<div class="cek-total good">Titipan ${rp(s.lebih)}</div><p class="small muted">Menutup ±${s.hari_tertutup} hari ke depan · lunas sampai ${tglPendek(s.lunas_sampai)}</p>`
                : `<div class="cek-total good">Lunas</div><p class="small muted">${s.tagihan_berjalan > 0 ? `Tagihan berjalan ${rp(s.tagihan_berjalan)}` : 'Lunas sampai hari ini'}</p>`;
        App.dialog(`
            <h3>Saldo — ${esc(r.warga.nama)} <span class="small muted">RT ${esc(r.warga.rt)} · ${esc(r.warga.jenis)}</span></h3>
            ${status}
            <dl class="mini saldo-dl">
                <div><dt>Total setoran dihitung</dt><dd>${rp(s.terbayar)}</dd></div>
                <div><dt>Kewajiban sejak ${tglPendek(r.mulai_hitung)} (${rp(r.tarif_harian)}/hari)</dt><dd>${rp(s.kewajiban_berjalan)}</dd></div>
                ${s.lama ? `<div><dt>Tunggakan lama</dt><dd>${rp(s.lama)}</dd></div>` : ''}
                <div><dt>Saldo</dt><dd class="${s.saldo < 0 ? 'bad' : ''}">${rp(s.saldo)}</dd></div>
            </dl>
            <h3 style="margin-top:14px">Setoran terakhir</h3>
            ${r.setoran.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th class="r">Nominal</th><th>Metode</th><th>Status</th></tr></thead><tbody>
            ${r.setoran.map((x) => `<tr><td>${tglPendek(x.tanggal)}</td><td class="r num">${rp(x.nominal)}</td><td>${esc(x.metode)}</td>
            <td>${x.status === 'sah' ? '<span class="badge green">sah</span>' : `<span class="badge red" title="${esc(x.alasan_batal || '')}">batal</span>`}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty">Belum ada setoran.</div>'}
            <div class="dlg-actions"><button class="btn" data-act="closeDialog">Tutup</button></div>`);
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
        $('#tOut').innerHTML = `
            <div class="kpi-grid n4" style="margin-bottom:14px">
                <div class="kpi bad"><div class="kpi-label">Total tunggakan</div><div class="kpi-value">${rp(s.total)}</div><div class="kpi-sub">${s.warga_menunggak} warga</div></div>
                <div class="kpi"><div class="kpi-label">Tunggakan berjalan</div><div class="kpi-value">${rp(s.total_rutin)}</div></div>
                <div class="kpi"><div class="kpi-label">Tunggakan lama</div><div class="kpi-value">${rp(s.total_lama)}</div></div>
                <div class="kpi good"><div class="kpi-label">Titipan warga</div><div class="kpi-value">${rp(s.titipan)}</div><div class="kpi-sub">${s.warga_titipan} warga</div></div>
            </div>
            <div id="tPg"></div><div class="list" id="tList"></div>`;
        App.pgReset('tunggakan');
        App.pgRedraw.tunggakan = tampilTunggakan;
        tampilTunggakan();
    }

    function tampilTunggakan() {
        const arr = (App.stTunggakan.data || { tunggakan: [] }).tunggakan;
        const pg = App.paginate('tunggakan', arr);
        $('#tList').innerHTML = arr.length ? pg.items.map(kartuTunggakan).join('') : '<div class="card empty">Tidak ada tunggakan. 🎉</div>';
        $('#tPg').innerHTML = pg.bar;
    }

    function kartuTunggakan(t) {
        const hp = String(t.no_hp || '').replace(/\D/g, '');
        const wa = hp ? (hp.startsWith('0') ? '62' + hp.slice(1) : hp) : '';
        const pesan = `Assalamu'alaikum, Bapak/Ibu ${t.nama}. Kami dari pengurus RW 03 Dukuh Pencil mengingatkan jimpitan/iuran yang masih kurang sebesar ${rp(t.kurang)}. Terima kasih atas perhatiannya.`;
        return `<div class="card" style="margin:0">
            <div class="row between">
                <div>
                    <div class="name" style="font-weight:700;font-size:0.95rem">${esc(t.nama)}</div>
                    <div class="meta small muted" style="margin-top:4px">
                        <span class="badge">RT ${esc(t.rt)}</span> ${jenisBadge(t.jenis)} 
                        <span>Setara ≈ ${t.hari_kurang} hari</span> · <span>Jatuh tempo: ${tglPendek(t.jatuh_tempo).slice(0, 5)}</span>
                    </div>
                </div>
                <div class="right">
                    <b class="num" style="color:var(--red);font-size:1.15rem;font-weight:800">${rp(t.kurang)}</b>
                </div>
            </div>
            <div class="row small" style="margin-top:10px;gap:14px;border-top:1px solid var(--border);padding-top:8px">
                ${t.berjalan_kurang ? `<span>Kewajiban berjalan: <b>${rp(t.berjalan_kurang)}</b></span>` : ''}
                ${t.lama_sisa ? `<span>Tunggakan lama: <b>${rp(t.lama_sisa)}</b></span>` : ''}
                ${t.tagihan_berjalan > t.kurang ? `<span class="muted">Total tagihan berjalan: ${rp(t.tagihan_berjalan)}</span>` : ''}
            </div>
            <div class="row" style="margin-top:12px">
                ${App.has('jimpitan.tulis') ? `<button class="btn sm primary" data-act="bayarKurang" data-w="${t.id}" data-nama="${esc(t.nama)}" data-kurang="${t.kurang}">Bayar</button>` : ''}
                <button class="btn sm ghost" data-act="saldoWarga" data-id="${t.id}" data-nama="${esc(t.nama)}">Lihat Saldo</button>
                ${wa ? `<a class="btn sm" style="color:var(--green);border-color:var(--green-border);background:var(--green-bg)" target="_blank" rel="noopener noreferrer" href="https://wa.me/${wa}?text=${encodeURIComponent(pesan)}">Kirim WhatsApp</a>` : ''}
            </div></div>`;
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
                    <div><label class="f" for="bkTgl">Tanggal diterima</label>
                    <input type="date" id="bkTgl" name="tanggal" value="${App.today()}" max="${App.today()}" required></div>
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
                <div id="wInfo" class="small muted"></div>
            </div>
            <div id="wPg"></div><div id="wList" class="list"></div>`;
        await loadWarga();
    };

    async function loadWarga() {
        const r = await App.api('/api/warga?' + qs({ rt: WS.rt, jenis: WS.jenis, aktif: WS.aktif, ikut_iuran: WS.iuran, q: WS.q }));
        WS.list = r.warga;
        const kelola = App.has('warga.kelola');
        $('#wInfo').textContent = `${r.warga.length} warga`;
        App.pgReset('warga');
        App.pgRedraw.warga = tampilWarga;
        tampilWarga();
    }

    function tampilWarga() {
        const kelola = App.has('warga.kelola');
        const pg = App.paginate('warga', WS.list);
        $('#wPg').innerHTML = pg.bar;
        $('#wList').innerHTML = WS.list.length ? pg.items.map((w) => `
            <div class="item ${w.aktif ? '' : ''}" style="${w.aktif ? '' : 'opacity:.6'}">
                <div class="grow"><div class="name">#${w.id} ${esc(w.nama)}</div>
                <div class="meta">RT ${esc(w.rt)} · ${jenisBadge(w.jenis)}${w.no_hp ? ' · ' + esc(w.no_hp) : ''}${w.aktif ? '' : ' · <span class="badge red">nonaktif</span>'}
                    ${w.ikut_jimpitan ? '' : ` · <span class="badge amber">${w.jimpitan_berhenti ? 'Jimpitan s.d. ' + App.tglId(w.jimpitan_berhenti) : 'Bebas jimpitan'}</span>`}
                    ${w.ikut_iuran ? '' : ` · <span class="badge amber">${w.iuran_berhenti ? 'Iuran kas s.d. ' + App.tglId(w.iuran_berhenti) : 'Bebas iuran kas'}</span>`}</div></div>
                <div class="row">
                    ${App.has('jimpitan.lihat') ? `<button class="btn sm" data-act="riwayatWarga" data-id="${w.id}">Riwayat</button>` : ''}
                    ${kelola ? `<button class="btn sm" data-act="wargaForm" data-id="${w.id}">Ubah</button>` : ''}
                </div></div>`).join('') : '<div class="card empty">Tidak ada data.</div>';
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
        const v = w || { nama: '', rt: WS.rt || '007', jenis: 'bulanan', no_hp: '', alamat: '', mulai_iuran: '', catatan: '', aktif: 1 };
        App.dialog(`
            <h3>${w ? 'Ubah warga #' + w.id : 'Tambah warga'}</h3>
            <form data-form="warga" data-id="${w ? w.id : ''}">
                <div class="form-grid">
                    <div class="full"><label class="f" for="fwNama">Nama</label><input id="fwNama" name="nama" value="${esc(v.nama)}" required minlength="2" maxlength="150"></div>
                    <div><label class="f" for="fwRt">RT</label><select id="fwRt" name="rt">${optRt(v.rt, false)}</select></div>
                    <div><label class="f" for="fwJenis">Jenis setoran</label><select id="fwJenis" name="jenis">${JENIS.map((j) => `<option value="${j}" ${v.jenis === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
                    <div><label class="f" for="fwHp">No HP / WhatsApp</label><input id="fwHp" name="no_hp" value="${esc(v.no_hp || '')}" inputmode="tel" maxlength="20" placeholder="08xxxxxxxxxx"></div>
                    <div><label class="f" for="fwMulai">Mulai iuran (opsional)</label><input type="date" id="fwMulai" name="mulai_iuran" value="${esc(App.ymd(v.mulai_iuran))}"></div>
                    <div class="full" style="margin-top:6px"><b class="small">Kewajiban iuran</b>
                        <p class="small muted">Tidak semua warga wajib iuran kas. Jika dicabut: kosongkan tanggal = <b>bebas sejak awal</b>; isi tanggal = <b>wajib sampai tanggal itu</b> (tunggakan sebelumnya tetap tercatat).</p></div>
                    <div class="full row"><input type="checkbox" id="fwIJ" name="ikut_jimpitan" data-change="wargaIkut" ${v.ikut_jimpitan === 0 ? '' : 'checked'}><label for="fwIJ">Wajib <b>iuran jimpitan</b></label></div>
                    <div class="full" id="fwJBox" style="${v.ikut_jimpitan === 0 ? '' : 'display:none'}"><label class="f" for="fwJB">Jimpitan: wajib sampai tanggal (kosong = bebas sejak awal)</label><input type="date" id="fwJB" name="jimpitan_berhenti" value="${esc(App.ymd(v.jimpitan_berhenti))}"></div>
                    <div class="full row"><input type="checkbox" id="fwII" name="ikut_iuran" data-change="wargaIkut" ${v.ikut_iuran === 0 ? '' : 'checked'}><label for="fwII">Wajib <b>iuran kas</b> (iuran wajib per kumpulan RW)</label></div>
                    <div class="full" id="fwIBox" style="${v.ikut_iuran === 0 ? '' : 'display:none'}"><label class="f" for="fwIB">Iuran kas: wajib sampai tanggal (kosong = bebas sejak awal)</label><input type="date" id="fwIB" name="iuran_berhenti" value="${esc(App.ymd(v.iuran_berhenti))}"></div>
                    <div class="full"><label class="f" for="fwAlamat">Alamat</label><input id="fwAlamat" name="alamat" value="${esc(v.alamat || '')}" maxlength="200"></div>
                    <div class="full"><label class="f" for="fwCat">Catatan</label><input id="fwCat" name="catatan" value="${esc(v.catatan || '')}" maxlength="255"></div>
                    ${w ? `<div class="full row"><input type="checkbox" id="fwAktif" name="aktif" ${v.aktif ? 'checked' : ''}><label for="fwAktif">Warga aktif (hilangkan centang bila pindah/berhenti; riwayat tetap tersimpan)</label></div>` : ''}
                </div>
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Batal</button>
                    <button type="submit" class="btn primary">Simpan</button>
                </div>
            </form>`);
    };
    App.changes.wargaIkut = (cb) => {
        const box = $(cb.name === 'ikut_jimpitan' ? '#fwJBox' : '#fwIBox');
        if (box) box.style.display = cb.checked ? 'none' : '';
    };
    App.forms.warga = async (f) => {
        const body = { nama: f.nama.value, rt: f.rt.value, jenis: f.jenis.value, no_hp: f.no_hp.value, alamat: f.alamat.value, mulai_iuran: f.mulai_iuran.value, catatan: f.catatan.value,
            ikut_jimpitan: f.ikut_jimpitan.checked, jimpitan_berhenti: f.jimpitan_berhenti.value, ikut_iuran: f.ikut_iuran.checked, iuran_berhenti: f.iuran_berhenti.value };
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
