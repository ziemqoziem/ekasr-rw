/* Halaman Pemasukan Lainnya (sewa aset, donasi, dll.): hanya mencatat PENERIMAAN, dilaporkan per periode kumpulan. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;
    const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
    const JENIS = { hasil_sewa: 'Hasil sewa', donasi: 'Donasi', lainnya: 'Lainnya' };
    const SS = (App.stPemasukanLain = { periode: '', rt: '', data: null });

    App.views.pemasukanlain = async (root) => {
        if (!App.has('sewa.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        root.innerHTML = `<h2 class="title">Pemasukan Lainnya</h2><div id="swBody">${App.loading()}</div>`;
        await muat();
    };

    async function muat() {
        const r = await App.api('/api/pemasukan-lain?' + App.qs({ periode: SS.periode, rt: SS.rt }));
        SS.data = r;
        App.pgReset('pemasukanlain');
        App.pgRedraw.pemasukanlain = tampil;
        tampil();
    }

    function tampil() {
        const r = SS.data;
        const tulis = App.has('sewa.tulis');
        // Urutan tetap: terbaru di atas (tanggal, lalu jam input)
        const data = r.sewa.slice().sort((a, b) => (b.tanggal + (b.created_at || '')).localeCompare(a.tanggal + (a.created_at || '')));
        const pg = App.paginate('pemasukanlain', data);
        // Kartu total: keseluruhan + per jenis (hanya yang sah, sesuai periode yang dipilih)
        const perJenis = Object.fromEntries(Object.keys(JENIS).map((j) => [j, { n: 0, c: 0 }]));
        for (const x of r.sewa) if (x.status === 'sah' && perJenis[x.jenis]) { perJenis[x.jenis].n += x.nominal; perJenis[x.jenis].c += 1; }
        const totalSah = Object.values(perJenis).reduce((a, v) => a + v.n, 0);
        const jumlahSah = Object.values(perJenis).reduce((a, v) => a + v.c, 0);
        const ketPer = SS.periode ? 'pada kumpulan terpilih' : 'semua periode';
        const kartuTotal = `<div class="rk-baris" style="margin-bottom:14px">
            <div class="stat rk-c0"><small>Total pemasukan lainnya</small><b>${rp(totalSah)}</b><span class="small muted" style="display:block;margin-top:4px">${jumlahSah} pemasukan · ${ketPer}</span></div>
            ${Object.entries(JENIS).map(([j, l], i) => `<div class="stat rk-c${i + 1}"><small>${esc(l)}</small><b>${rp(perJenis[j].n)}</b><span class="small muted" style="display:block;margin-top:4px">${perJenis[j].c} pemasukan</span></div>`).join('')}
        </div>`;
        const sah = data.filter((x) => x.status === 'sah').reduce((a, x) => a + x.nominal, 0);
        const pilihPer = `<option value="">Semua periode</option>` + r.rekap.slice().reverse().map((p) => `<option value="${p.mulai}" ${SS.periode === p.mulai ? 'selected' : ''}>${esc(p.weton)} ${tgl(p.mulai)}${p.berjalan ? ' (berjalan)' : ''}</option>`).join('');
        $('#swBody').innerHTML = `
            ${kartuTotal}
            ${tulis ? '' : '<p class="small muted" style="margin-bottom:10px"><b>Anda hanya dapat melihat.</b> Pemasukan lainnya dicatat oleh Bendahara RW.</p>'}
            ${tulis ? `<div class="card"><h3>Catat pemasukan lainnya</h3>
                <p class="small muted" style="margin-bottom:10px">Cukup catat uang yang <b>diterima</b>, tanpa data penyewa/pemberi. ${r.batas_rt ? `Dicatat untuk RT ${esc(r.batas_rt)}.` : ''}</p>
                <form data-form="pemasukanlain"><div class="form-grid">
                    <div><label class="f" for="swTgl">Tanggal</label><input type="date" id="swTgl" name="tanggal" value="${App.today()}" max="${App.today()}" required></div>
                    <div><label class="f" for="swJenis">Jenis</label><select id="swJenis" name="jenis">${Object.entries(JENIS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                    <div class="full"><label class="f" for="swUr">Uraian</label><input id="swUr" name="uraian" required minlength="3" maxlength="200" placeholder="mis. Sewa tenda & kursi / Donasi warga"></div>
                    <div><label class="f" for="swNom">Nominal (Rp)</label><input type="number" id="swNom" name="nominal" min="1" required inputmode="numeric"></div>
                </div><div class="dlg-actions"><button class="btn primary" type="submit">Simpan penerimaan</button></div></form></div>` : ''}
            <div class="card"><div class="filters">
                <div><label class="f" for="swPer">Tampilkan periode</label><select id="swPer" data-change="sewaFilter">${pilihPer}</select></div>
            </div><p class="small muted">${data.length} catatan · total sah: <b>${rp(sah)}</b></p></div>
            ${pg.bar}
            <div class="list">${data.length ? pg.items.map((x) => `
                <div class="item" style="${x.status === 'batal' ? 'opacity:.55' : ''}">
                    <div class="grow"><div class="name">${esc(x.uraian)}</div>
                    <div class="meta"><span class="badge">${esc(JENIS[x.jenis] || 'Lainnya')}</span> ${App.tglId(x.tanggal)} · ${x.rt ? 'RT ' + esc(x.rt) : 'RW'} · oleh ${esc(x.petugas)}${x.status === 'batal' ? ` · <span class="badge red">batal: ${esc(x.alasan_batal || '')}</span>` : ''}</div></div>
                    <b class="num">${rp(x.nominal)}</b>
                    ${x.status === 'sah' && tulis ? `<button class="btn sm danger" data-act="sewaBatal" data-id="${esc(x.id)}">Batal</button>` : ''}
                </div>`).join('') : '<div class="card empty">Belum ada pemasukan lainnya.</div>'}</div>`;
    }

    App.changes.sewaFilter = async () => {
        SS.periode = $('#swPer').value;
        await muat();
    };
    App.forms.pemasukanlain = async (f) => {
        await App.api('/api/pemasukan-lain', { method: 'POST', body: { tanggal: f.tanggal.value, jenis: f.jenis.value, uraian: f.uraian.value, nominal: Number(f.nominal.value) } });
        App.toast('Pemasukan lainnya tercatat.');
        await muat();
    };
    App.actions.sewaBatal = (el) => {
        App.dialog(`
            <h3>Batalkan pemasukan lainnya</h3>
            <form data-form="sewaBatal" data-id="${esc(el.dataset.id)}">
                <label class="f" for="sbAlasan">Alasan pembatalan</label>
                <input id="sbAlasan" name="alasan" required minlength="3" maxlength="255">
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Kembali</button><button type="submit" class="btn danger">Batalkan</button></div>
            </form>`);
    };
    App.forms.sewaBatal = async (f) => {
        await App.api('/api/pemasukan-lain', { method: 'PUT', body: { id: f.dataset.id, alasan: f.alasan.value } });
        App.closeDialog();
        App.toast('Penerimaan dibatalkan.');
        await muat();
    };
})();
