/* Halaman Pemasukan Lainnya (hasil sewa, donasi, dll.): hanya mencatat PENERIMAAN. Susunan sama dengan halaman Pengeluaran:
   kartu total + per jenis → filter kumpulan RW + pagination (satu baris) → tabel. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, rp, $ } = App;
    const JENIS = { hasil_sewa: 'Hasil sewa', donasi: 'Donasi', lainnya: 'Lainnya' };
    const SS = (App.stPemasukanLain = { periode: '', data: [], daftar: [], batas_rt: null });

    App.views.pemasukanlain = async (root) => {
        if (!App.has('sewa.lihat')) { root.innerHTML = '<div class="card empty">Anda tidak memiliki akses ke halaman ini.</div>'; return; }
        root.innerHTML = `
            <div class="row between"><h2 class="title">Pemasukan Lainnya</h2>
            ${App.has('sewa.tulis') ? '<button class="btn primary" data-act="pemasukanForm">+ Catat pemasukan</button>' : '<span class="badge">Hanya lihat · dicatat oleh bendahara</span>'}</div>
            <div id="swKartu"></div>
            <div id="swFilter"></div>
            <div id="swList">${App.loading()}</div>`;
        await muat();
    };

    async function muat() {
        const r = await App.api('/api/pemasukan-lain?' + App.qs({ periode: SS.periode }));
        SS.data = r.sewa;
        SS.daftar = r.daftar_periode || [];
        SS.batas_rt = r.batas_rt;
        App.pgReset('pemasukanlain');
        App.pgRedraw.pemasukanlain = tampil;
        tampil();
    }

    function tampil() {
        const tulis = App.has('sewa.tulis');
        // Terbaru di atas (tanggal, lalu jam input)
        const data = SS.data.slice().sort((a, b) => (b.tanggal + (b.created_at || '')).localeCompare(a.tanggal + (a.created_at || '')));
        const sah = data.filter((x) => x.status === 'sah');
        const total = sah.reduce((a, x) => a + x.nominal, 0);
        // Kartu: total + per jenis
        const perJenis = Object.fromEntries(Object.keys(JENIS).map((j) => [j, { n: 0, c: 0 }]));
        for (const x of sah) if (perJenis[x.jenis]) { perJenis[x.jenis].n += x.nominal; perJenis[x.jenis].c += 1; }
        const kartu = `<div class="rk-baris mb-lg">
            <div class="stat rk-c0"><small>Total pemasukan lainnya</small><b>${rp(total)}</b><span class="small muted stat-sub">${sah.length} pemasukan</span></div>
            ${Object.entries(JENIS).map(([j, l], i) => `<div class="stat rk-c${i + 1}"><small>${esc(l)}</small><b>${rp(perJenis[j].n)}</b><span class="small muted stat-sub">${perJenis[j].c} pemasukan · ${total ? Math.round((perJenis[j].n / total) * 100) : 0}%</span></div>`).join('')}
        </div>`;
        const pg = App.paginate('pemasukanlain', data, { selalu: true });
        $('#swKartu').innerHTML = kartu;
        // Filter kumpulan RW + kontrol halaman dalam satu baris
        $('#swFilter').innerHTML = `<div class="card bar-satu">
            <div class="bs-filter"><label class="f" for="swPer">Kumpulan RW</label><select id="swPer" data-change="pemasukanPeriode" title="Pemasukan sejak kumpulan sebelumnya sampai tanggal kumpulan terpilih (cut off)">
                <option value="">Semua periode</option>
                ${SS.daftar.map((x) => `<option value="${esc(x.tanggal)}" ${x.tanggal === SS.periode ? 'selected' : ''}>Kumpulan ke-${x.no} · ${esc(x.weton)}, ${App.tglId(x.tanggal)}${x.hari_ini ? ' · hari ini' : ''}</option>`).join('')}</select></div>
            <div class="bs-pager">${pg.bar}</div></div>`;
        $('#swList').innerHTML = data.length ? `<div class="card tbl-card"><div class="tbl-wrap"><table class="tbl-peng"><thead><tr><th>Tanggal</th><th>Uraian</th><th>Jenis</th><th class="r">Nominal</th>${tulis ? '<th></th>' : ''}</tr></thead><tbody>
                ${pg.items.map((x) => `<tr class="${x.status === 'batal' ? 'opacity-dim' : ''}">
                    <td class="nowrap">${App.tglId(x.tanggal)}</td>
                    <td class="wrap-normal min-col"><b>${esc(x.uraian)}</b>${x.status === 'batal' ? `<div class="small"><span class="badge red">batal: ${esc(x.alasan_batal || '')}</span></div>` : ''}</td>
                    <td><span class="badge">${esc(JENIS[x.jenis] || 'Lainnya')}</span></td>
                    <td class="r num"><b>${rp(x.nominal)}</b></td>
                    ${tulis ? `<td class="r nowrap">${x.status === 'sah' ? `<button class="btn sm danger" data-act="sewaBatal" data-id="${esc(x.id)}">Batalkan</button>` : ''}</td>` : ''}</tr>`).join('')}
                </tbody><tfoot><tr><td colspan="3"><b>Total halaman ini</b></td><td class="r num"><b>${rp(pg.items.filter((x) => x.status === 'sah').reduce((a, x) => a + x.nominal, 0))}</b></td>${tulis ? '<td></td>' : ''}</tr></tfoot></table></div></div>`
            : '<div class="card empty">Belum ada pemasukan lainnya.</div>';
    }

    App.changes.pemasukanPeriode = async (el) => { SS.periode = el.value; await muat(); };

    // Form pencatatan (dialog): tanggal, jenis, uraian, nominal
    App.actions.pemasukanForm = () => {
        App.dialog(`
            <h3>Catat pemasukan lainnya</h3>
            <form data-form="pemasukanlain">
                <div class="form-grid">
                    <div><label class="f" for="swTgl">Tanggal</label><input type="date" id="swTgl" name="tanggal" value="${App.today()}" max="${App.today()}" required></div>
                    <div><label class="f" for="swJenis">Jenis</label><select id="swJenis" name="jenis">${Object.entries(JENIS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                    <div class="full"><label class="f" for="swUr">Uraian</label><input id="swUr" name="uraian" required minlength="3" maxlength="200" placeholder="mis. Sewa tenda & kursi / Donasi warga"></div>
                    <div><label class="f" for="swNom">Nominal (Rp)</label><input type="number" id="swNom" name="nominal" min="1" required inputmode="numeric"></div>
                </div>
                <p class="small muted mt-sm">Cukup catat uang yang <b>diterima</b>, tanpa data penyewa/pemberi.${SS.batas_rt ? ` Dicatat untuk RT ${esc(SS.batas_rt)}.` : ''}</p>
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Batal</button><button type="submit" class="btn primary">Simpan</button></div>
            </form>`);
    };
    App.forms.pemasukanlain = async (f) => {
        await App.api('/api/pemasukan-lain', { method: 'POST', body: { tanggal: f.tanggal.value, jenis: f.jenis.value, uraian: f.uraian.value, nominal: Number(f.nominal.value) } });
        App.closeDialog();
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
        App.toast('Pemasukan dibatalkan.');
        await muat();
    };
})();
