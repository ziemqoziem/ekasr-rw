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
                    ${tulis ? `<td class="r nowrap"><div class="aksi-ico">${x.status === 'sah' ? `<button type="button" class="btn-ico ico-edit" data-act="pemasukanForm" data-id="${esc(x.id)}" title="Ubah" aria-label="Ubah pemasukan">${App.icon('edit')}</button><button type="button" class="btn-ico ico-batal" data-act="sewaBatal" data-id="${esc(x.id)}" title="Batalkan" aria-label="Batalkan pemasukan">${App.icon('ban')}</button>` : ''}<button type="button" class="btn-ico ico-hapus" data-act="sewaHapus" data-id="${esc(x.id)}" title="Hapus permanen" aria-label="Hapus pemasukan">${App.icon('trash')}</button></div></td>` : ''}</tr>`).join('')}
                </tbody><tfoot><tr><td colspan="3"><b>Total halaman ini</b></td><td class="r num"><b>${rp(pg.items.filter((x) => x.status === 'sah').reduce((a, x) => a + x.nominal, 0))}</b></td>${tulis ? '<td></td>' : ''}</tr></tfoot></table></div></div>`
            : '<div class="card empty">Belum ada pemasukan lainnya.</div>';
    }

    App.changes.pemasukanPeriode = async (el) => { SS.periode = el.value; await muat(); };

    // Form pencatatan / perubahan (dialog): tanggal, jenis, uraian, nominal
    App.actions.pemasukanForm = (el) => {
        const e = el && el.dataset && el.dataset.id ? SS.data.find((x) => x.id === el.dataset.id) : null;
        const v = e || { tanggal: App.today(), jenis: 'hasil_sewa', uraian: '', nominal: '' };
        App.dialog(`
            <h3>${e ? 'Ubah pemasukan lainnya' : 'Catat pemasukan lainnya'}</h3>
            <form data-form="pemasukanlain" data-id="${e ? esc(e.id) : ''}">
                <div class="form-grid">
                    <div><label class="f" for="swTgl">Tanggal</label><input type="date" id="swTgl" name="tanggal" value="${esc(v.tanggal)}" max="${App.today()}" required></div>
                    <div><label class="f" for="swJenis">Jenis</label><select id="swJenis" name="jenis">${Object.entries(JENIS).map(([k, l]) => `<option value="${k}" ${v.jenis === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                    <div class="full"><label class="f" for="swUr">Uraian</label><input id="swUr" name="uraian" value="${esc(v.uraian)}" required minlength="3" maxlength="200" placeholder="mis. Sewa tenda & kursi / Donasi warga"></div>
                    <div><label class="f" for="swNom">Nominal (Rp)</label><input type="number" id="swNom" name="nominal" value="${esc(v.nominal)}" min="1" required inputmode="numeric"></div>
                </div>
                <p class="small muted" style="margin-top:8px">Cukup catat uang yang <b>diterima</b>, tanpa data penyewa/pemberi.${SS.batas_rt ? ` Dicatat untuk RT ${esc(SS.batas_rt)}.` : ''}</p>
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Batal</button><button type="submit" class="btn primary">${e ? 'Simpan perubahan' : 'Simpan'}</button></div>
            </form>`);
    };
    App.forms.pemasukanlain = async (f) => {
        const body = { tanggal: f.tanggal.value, jenis: f.jenis.value, uraian: f.uraian.value, nominal: Number(f.nominal.value) };
        if (f.dataset.id) {
            await App.api('/api/pemasukan-lain', { method: 'PUT', body: { ...body, aksi: 'ubah', id: f.dataset.id } });
            App.toast('Pemasukan lainnya diperbarui.');
        } else {
            await App.api('/api/pemasukan-lain', { method: 'POST', body });
            App.toast('Pemasukan lainnya tercatat.');
        }
        App.closeDialog();
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
    App.actions.sewaHapus = (el) => {
        const x = SS.data.find((d) => d.id === el.dataset.id);
        App.dialog(`
            <h3>Hapus pemasukan lainnya</h3>
            ${x ? `<p class="small muted" style="margin-bottom:8px"><b>${esc(x.uraian)}</b> · ${rp(x.nominal)} · ${App.tglId(x.tanggal)}</p>` : ''}
            <p class="small">Data dihapus <b>permanen</b> dan tidak ikut dihitung di kas. Isinya tetap tersimpan di log aktivitas. Bila hanya salah catat, gunakan <b>Batalkan</b> agar jejaknya tetap terlihat.</p>
            <form data-form="sewaHapus" data-id="${esc(el.dataset.id)}">
                <label class="f" for="shAlasan">Alasan penghapusan</label>
                <input id="shAlasan" name="alasan" required minlength="3" maxlength="255" placeholder="mis. input ganda">
                <div class="dlg-actions"><button type="button" class="btn" data-act="closeDialog">Kembali</button><button type="submit" class="btn danger">Hapus permanen</button></div>
            </form>`);
    };
    App.forms.sewaHapus = async (f) => {
        await App.api('/api/pemasukan-lain?' + App.qs({ id: f.dataset.id, alasan: f.alasan.value }), { method: 'DELETE' });
        App.closeDialog();
        App.toast('Pemasukan dihapus.');
        await muat();
    };
})();
