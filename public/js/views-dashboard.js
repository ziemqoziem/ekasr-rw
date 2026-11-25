/* Halaman Dashboard: KPI, grafik (kolom, area, donut, pie, gauge, bar), tabel, dan kartu. */
(function () {
    'use strict';
    const App = window.App;
    const { esc, $ } = App;
    const K = App.charts;
    const { C, rp, compact } = K;

    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const labelBulan = (ym) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // Warna mengikuti entitas, bukan peringkat: tidak berubah saat filter berubah.
    const WARNA = {
        jenis: { harian: C.s[0], mingguan: C.s[1], bulanan: C.s[2] },
        metode: { tunai: C.s[0], transfer: C.s[1] },
        tunggakan: { rutin: C.s[1], lama: C.s[4] },
        setoran: C.s[0], pengeluaran: C.s[1]
    };

    App.dash = { tbl, chartCard, tile, delta, labelBulan, cap, WARNA };

    const DS = (App.stDashboard = { bulan: '', rt: '', sub: 'ringkasan', data: null });

    /* ---------- helper tampilan ---------- */
    function tbl(cols, rows, foot) {
        return `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${cols[i].r ? 'r num' : ''}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted">Tidak ada data.</td></tr>`}</tbody>
            ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${cols[i].r ? 'r num' : ''}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
    }

    // Kartu grafik: tombol "Tabel" menukar grafik dengan data tabelnya (alternatif aksesibel).
    function chartCard(id, title, sub, tableHtml, cls) {
        return `<section class="card chart-card ${cls || ''}">
            <div class="cc-head"><div><h3>${esc(title)}</h3>${sub ? `<p class="small muted">${esc(sub)}</p>` : ''}</div>
            <button class="btn sm" data-act="dTabel" data-t="${id}" aria-pressed="false">Tabel</button></div>
            <div class="cc-body" data-chart="${id}"></div>
            <div class="cc-table hidden" id="tbl-${id}">${tableHtml}</div></section>`;
    }
    App.actions.dTabel = (btn) => {
        const id = btn.dataset.t;
        const card = btn.closest('.chart-card');
        const showTable = $('#tbl-' + id).classList.toggle('hidden') === false;
        card.querySelector('.cc-body').classList.toggle('hidden', showTable);
        btn.textContent = showTable ? 'Grafik' : 'Tabel';
        btn.setAttribute('aria-pressed', String(showTable));
    };

    function delta(cur, prev, naikBaik, nama) {
        if (!prev && !cur) return { cls: 'flat', txt: `— vs ${nama}` };
        if (!prev) return { cls: 'up good', txt: `▲ baru vs ${nama}` };
        const p = ((cur - prev) / prev) * 100;
        if (Math.abs(p) < 0.5) return { cls: 'flat', txt: `■ stabil vs ${nama}` };
        const naik = p > 0;
        const baik = naik === naikBaik;
        return { cls: `${naik ? 'up' : 'down'} ${baik ? 'good' : 'bad'}`, txt: `${naik ? '▲' : '▼'} ${Math.abs(Math.round(p))}% vs ${nama}` };
    }

    function tile(o) {
        const d = o.delta;
        return `<div class="kpi ${o.hero ? 'hero' : ''} ${o.tone || ''}">
            <div class="kpi-label">${esc(o.label)}</div>
            <div class="kpi-value">${o.value}</div>
            ${d ? `<div class="kpi-delta ${d.cls}">${esc(d.txt)}</div>` : ''}
            ${o.sub ? `<div class="kpi-sub">${o.sub}</div>` : ''}
            ${o.spark ? `<div class="kpi-spark">${o.spark}</div>` : ''}
            ${o.meter !== undefined ? `<div class="meter"><i style="width:${Math.min(100, o.meter)}%"></i></div>` : ''}
        </div>`;
    }

    /* ---------- kerangka halaman ---------- */
    App.views.dashboard = async (root) => {
        if (!App.user) { root.innerHTML = '<div class="card empty">Silakan masuk terlebih dahulu.</div>'; return; }
        if (!DS.bulan) DS.bulan = App.today().slice(0, 7);
        if (App.rtKunci()) DS.rt = App.user.rt || '';
        root.innerHTML = `
            <div class="row between"><h2 class="title">Beranda</h2><span class="small muted" id="dStamp"></span></div>
            <div class="card dash-controls no-print">
                <div class="filters">
                    <div><label class="f" for="dBulan">Bulan</label><input type="month" id="dBulan" value="${esc(DS.bulan)}" max="${App.today().slice(0, 7)}" data-change="dashFilter"></div>
                    <div><label class="f" for="dRt">RT</label><select id="dRt" data-change="dashFilter" ${App.rtKunci() ? 'disabled' : ''}>${App.optRt(DS.rt)}</select></div>
                    <div class="row"><button class="btn" data-act="dashMuat">Muat ulang</button></div>
                </div>
                <div class="subtabs" id="dSub"></div>
            </div>
            <div id="dBody">${App.loading()}</div>`;
        await muat();
    };

    async function muat() {
        $('#dBody').innerHTML = App.loading();
        const r = await App.api('/api/dashboard?' + App.qs({ bulan: DS.bulan, rt: DS.rt }));
        DS.data = r;
        $('#dStamp').textContent = `Diperbarui ${new Date(r.dibuat).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
        tampil();
    }
    App.changes.dashFilter = async () => {
        DS.bulan = $('#dBulan').value || App.today().slice(0, 7);
        if (!App.rtKunci()) DS.rt = $('#dRt').value;
        await muat();
    };
    App.actions.dashMuat = () => muat();
    App.actions.dashSub = (el) => { DS.sub = el.dataset.sub; tampil(); };

    function tampil() {
        const d = DS.data;
        const subs = [['ringkasan', 'Ringkasan'], ['rt', 'Per RT'], ['tunggakan', 'Tunggakan']];
        if (d.keuangan) subs.push(['kas', 'Kas']);
        if (!subs.some((s) => s[0] === DS.sub)) DS.sub = 'ringkasan';
        $('#dSub').innerHTML = subs.map(([id, l]) => `<button class="tab ${DS.sub === id ? 'active' : ''}" data-act="dashSub" data-sub="${id}">${esc(l)}</button>`).join('');
        const reg = {};
        const html = { ringkasan: vRingkasan, rt: vRt, tunggakan: vTunggakan, kas: vKas }[DS.sub](d, reg);
        $('#dBody').innerHTML = html;
        K.mountAll($('#dBody'), reg);
    }

    /* ================= RINGKASAN ================= */
    function vRingkasan(d, reg) {
        const k = d.kpi;
        const bl = labelBulan(d.bulan);
        const nmLalu = BULAN[(Number(d.bulan.slice(5, 7)) + 10) % 12].slice(0, 3);
        const rtTxt = d.rt ? ` · RT ${d.rt}` : ' · semua RT';

        const tiles = [
            tile({ hero: true, label: `Setoran ${bl}${rtTxt}`, value: rp(k.setoran_bulan), delta: delta(k.setoran_bulan, k.setoran_lalu, true, nmLalu), spark: K.spark(d.harian.map((x) => x.total), WARNA.setoran, 120, 34), sub: '30 hari terakhir' }),
            d.kas
                ? tile({ label: 'Saldo kas', value: rp(d.kas.saldo), tone: d.kas.saldo < 0 ? 'bad' : 'good', sub: `Saldo jimpitan ${compact(d.kas.sumber.jimpitan)} · Bendahara RW ${compact(d.kas.sumber.iuran_wajib + d.kas.sumber.sewa_aset)}${d.kas.sumber.umum ? ' · umum ' + compact(d.kas.sumber.umum) : ''} · keluar ${compact(d.kas.total_keluar)}` })
                : tile({ label: 'Warga aktif', value: String(k.warga_aktif), sub: `${k.warga_menyetor} sudah menyetor bulan ini` }),
            tile({ label: 'Partisipasi bulan ini', value: `${k.partisipasi}%`, meter: k.partisipasi, sub: `${k.warga_menyetor} dari ${k.warga_aktif} warga` }),
            tile({ label: 'Total tunggakan', value: rp(k.tunggakan_total), tone: k.tunggakan_total > 0 ? 'bad' : 'good', sub: `${k.warga_menunggak} warga · lama ${compact(k.tunggakan_lama)} · titipan ${compact(k.titipan_total || 0)}` }),
            d.kas
                ? tile({ label: 'Pengeluaran bulan ini', value: rp(d.kas.pengeluaran_bulan), delta: delta(d.kas.pengeluaran_bulan, d.kas.pengeluaran_lalu, false, nmLalu) })
                : null
        ].filter(Boolean);

        // Tren 12 bulan
        const lbl = d.tren.map((t) => K.bulanPendek(t.bulan));
        const series = [{ name: 'Setoran', color: WARNA.setoran, values: d.tren.map((t) => t.setoran) }];
        if (d.keuangan) series.push({ name: 'Pengeluaran', color: WARNA.pengeluaran, values: d.tren.map((t) => t.pengeluaran || 0) });
        reg.tren = (w) => K.columns({ labels: lbl, series, tipTitle: (i) => labelBulan(d.tren[i].bulan), aria: 'Tren setoran 12 bulan terakhir' }, w);
        const trenTbl = tbl(
            [{ h: 'Bulan' }, { h: 'Setoran', r: 1 }, ...(d.keuangan ? [{ h: 'Pengeluaran', r: 1 }] : [])],
            d.tren.map((t) => [labelBulan(t.bulan), rp(t.setoran), ...(d.keuangan ? [rp(t.pengeluaran)] : [])])
        );

        // Gauge kepatuhan periode berjalan
        const gauges = d.kepatuhan.length
            ? d.kepatuhan.map((g) => K.gauge({
                value: g.total ? Math.round((g.sudah / g.total) * 100) : 0,
                label: `Warga ${g.jenis}`, sub: `${g.sudah} dari ${g.total} · ${g.periode}`,
                detail: `${g.sudah} dari ${g.total} warga ${g.jenis} sudah menyetor`
            })).join('')
            : '<div class="empty">Tidak ada warga aktif.</div>';
        const gaugeTbl = tbl([{ h: 'Jenis' }, { h: 'Periode' }, { h: 'Sudah', r: 1 }, { h: 'Total', r: 1 }],
            d.kepatuhan.map((g) => [cap(g.jenis), esc(g.periode), g.sudah, g.total]));

        // Donut jenis, pie metode, donut tunggakan
        const jenisParts = d.per_jenis.map((x) => ({ name: cap(x.jenis), value: x.total, color: WARNA.jenis[x.jenis] }));
        const metodeParts = d.per_metode.map((x) => ({ name: cap(x.metode), value: x.total, color: WARNA.metode[x.metode] }));
        const tungParts = [{ name: 'Tunggakan berjalan', value: k.tunggakan_rutin, color: WARNA.tunggakan.rutin }, { name: 'Tunggakan lama', value: k.tunggakan_lama, color: WARNA.tunggakan.lama }];
        const sumJ = jenisParts.reduce((a, p) => a + p.value, 0);
        const sumT = k.tunggakan_total;
        reg.jenis = () => K.donut({ parts: jenisParts, centerTop: compact(sumJ), centerBottom: 'total setoran', aria: 'Komposisi setoran per jenis' });
        reg.metode = () => K.donut({ parts: metodeParts, inner: 0, size: 160, aria: 'Komposisi setoran per metode pembayaran' });
        reg.tung = () => K.donut({ parts: tungParts, centerTop: compact(sumT), centerBottom: 'tunggakan', aria: 'Komposisi tunggakan' });
        const partTbl = (parts) => tbl([{ h: 'Kategori' }, { h: 'Nominal', r: 1 }], parts.map((p) => [esc(p.name), rp(p.value)]));

        // Area harian
        reg.harian = (w) => K.area({
            color: WARNA.setoran,
            points: d.harian.map((x) => ({ label: `${Number(x.tanggal.slice(8))} ${K.bulanPendek(x.tanggal)}`, tip: App.tglId(x.tanggal), y: x.total })),
            aria: 'Setoran harian 30 hari terakhir'
        }, w);
        const harianTbl = tbl([{ h: 'Tanggal' }, { h: 'Setoran', r: 1 }], d.harian.slice().reverse().map((x) => [App.tglId(x.tanggal), rp(x.total)]));

        // Kartu setoran terbaru
        const terbaru = d.terbaru.length ? d.terbaru.map((s) => `
            <li class="feed-item"><span class="feed-dot" aria-hidden="true"></span>
                <div class="grow"><b>${esc(s.nama)}</b> <span class="small muted">RT ${esc(s.rt)}</span>
                <div class="small muted">${App.tglId(s.tanggal)}${s.tipe === 'tunggakan_lama' ? ' · Tunggakan lama' : (s.periode_kunci && s.periode_kunci !== s.tanggal ? ' · ' + esc(s.periode_kunci) : '')} · ${esc(s.metode)}</div></div>
                <b class="num">${rp(s.nominal)}</b></li>`).join('') : '<li class="empty">Belum ada setoran.</li>';

        // Panel "Perlu tindakan": hal operasional yang butuh perhatian pengurus sekarang
        const t = d.tindakan;
        const aksi = [];
        if (t.harian_belum > 0) {
            aksi.push(`<li class="todo"><span class="todo-ic warn" aria-hidden="true">▲</span><div class="grow">
                <b>${t.harian_belum} dari ${t.harian_total} warga harian masih punya tagihan (belum setor / kurang)</b>
                <div class="chips">${t.per_rt.map((r) => `<span class="chip" title="${esc(r.nama.join(', '))}">RT ${esc(r.rt)}: ${r.belum} warga${r.nama.length ? ' — ' + esc(r.nama.slice(0, 3).join(', ')) + (r.belum > 3 ? ', …' : '') : ''}</span>`).join('')}</div></div>
                <button class="btn sm primary" data-act="go" data-tab="setoran">Catat setoran</button></li>`);
        }
        if (t.tarif_belum_diatur.length) {
            aksi.push(`<li class="todo"><span class="todo-ic bad" aria-hidden="true">●</span><div class="grow"><b>Tarif ${esc(t.tarif_belum_diatur.join(', '))} belum diatur</b>
                <div class="small muted">Setoran jenis ini belum dapat dicatat.</div></div>
                ${App.has('sistem.kelola') ? '<button class="btn sm" data-act="go" data-tab="pengaturan">Atur tarif</button>' : ''}</li>`);
        }
        if (d.top_tunggakan.length) {
            const x = d.top_tunggakan[0];
            aksi.push(`<li class="todo"><span class="todo-ic bad" aria-hidden="true">●</span><div class="grow"><b>Tunggakan terbesar: ${esc(x.nama)} (RT ${esc(x.rt)}) ${rp(x.total)}</b>
                <div class="small muted">${k.warga_menunggak} warga memiliki tunggakan, total ${rp(k.tunggakan_total)}.</div></div>
                <button class="btn sm" data-act="go" data-tab="tunggakan">Lihat tunggakan</button></li>`);
        }
        const panelAksi = `<section class="card todo-card"><h3>Perlu tindakan</h3>
            ${aksi.length ? `<ul class="todos">${aksi.join('')}</ul>` : '<p class="muted"><span style="color:var(--green)">✔</span> Tidak ada yang perlu ditindaklanjuti saat ini.</p>'}</section>`;

        return `
            ${panelAksi}
            <div class="kpi-grid n${tiles.length}">${tiles.join('')}</div>
            ${chartCard('tren', 'Tren setoran 12 bulan', d.keuangan ? 'Setoran dibanding pengeluaran' : 'Total setoran per bulan', trenTbl, 'mb')}
            <section class="card chart-card"><div class="cc-head"><div><h3>Warga bebas tunggakan</h3><p class="small muted">Persentase warga yang saldonya tidak kurang pada jatuh tempo polanya</p></div>
                <button class="btn sm" data-act="dTabel" data-t="gauge">Tabel</button></div>
                <div class="cc-body gauges">${gauges}</div><div class="cc-table hidden" id="tbl-gauge">${gaugeTbl}</div></section>
            <div class="dash-grid g-3">
                ${chartCard('jenis', 'Setoran per jenis', labelBulan(d.bulan), partTbl(jenisParts))}
                ${chartCard('metode', 'Metode pembayaran', labelBulan(d.bulan), partTbl(metodeParts))}
                ${chartCard('tung', 'Komposisi tunggakan', 'Berjalan vs tunggakan lama', partTbl(tungParts))}
            </div>
            <div class="dash-grid g-2-1">
                ${chartCard('harian', 'Setoran harian', '30 hari terakhir', harianTbl)}
                <section class="card"><h3>Setoran terbaru</h3><ul class="feed">${terbaru}</ul></section>
            </div>`;
    }

    /* ================= PER RT ================= */
    function vRt(d, reg) {
        const bl = labelBulan(d.bulan);
        const cards = d.per_rt.map((r) => {
            const persen = r.aktif ? Math.round((r.menyetor / r.aktif) * 100) : 0;
            return `<section class="card rt-card"><div class="row between"><h3>RT ${esc(r.rt)}</h3><span class="badge blue">${r.aktif} warga</span></div>
                ${K.gauge({ value: persen, label: 'Partisipasi', sub: `${r.menyetor} dari ${r.aktif} menyetor`, detail: `${r.menyetor} dari ${r.aktif} warga RT ${r.rt}` })}
                <dl class="mini"><div><dt>Setoran</dt><dd>${rp(r.setoran)}</dd></div>
                <div><dt>Tunggakan</dt><dd class="${r.tunggakan_rutin + r.tunggakan_lama > 0 ? 'bad' : ''}">${rp(r.tunggakan_rutin + r.tunggakan_lama)}</dd></div>
                <div><dt>Menunggak</dt><dd>${r.warga_menunggak} warga</dd></div></dl></section>`;
        }).join('');

        const setoranItems = d.per_rt.map((r) => ({ name: `RT ${r.rt}`, value: r.setoran, color: C.s[0], sub: `${r.jml} transaksi` }));
        const tungItems = d.per_rt.map((r) => ({ name: `RT ${r.rt}`, value: r.tunggakan_rutin + r.tunggakan_lama, color: C.s[1], sub: `${r.warga_menunggak} warga menunggak` }));
        const trendRt = (r) => delta(r.setoran, r.setoran_lalu, true, 'bln lalu');

        const rtRows = d.per_rt.map((r) => {
            const persen = r.aktif ? Math.round((r.menyetor / r.aktif) * 100) : 0;
            const dl = trendRt(r);
            return [`<b>RT ${esc(r.rt)}</b>`, r.aktif, r.menyetor, `<div class="row"><div class="bar grow"><i style="width:${persen}%"></i></div><span class="small num">${persen}%</span></div>`,
                rp(r.setoran), `<span class="kpi-delta ${dl.cls}">${esc(dl.txt)}</span>`, rp(r.tunggakan_rutin + r.tunggakan_lama)];
        });
        const sum = (f) => d.per_rt.reduce((a, r) => a + f(r), 0);
        const rtTable = tbl(
            [{ h: 'RT' }, { h: 'Warga aktif', r: 1 }, { h: 'Menyetor', r: 1 }, { h: 'Partisipasi' }, { h: `Setoran ${bl}`, r: 1 }, { h: 'Perubahan' }, { h: 'Tunggakan', r: 1 }],
            rtRows,
            ['<b>Total</b>', sum((r) => r.aktif), sum((r) => r.menyetor), '', rp(sum((r) => r.setoran)), '', rp(sum((r) => r.tunggakan_rutin + r.tunggakan_lama))]
        );

        // Matriks RT × jenis
        const jenisList = ['harian', 'mingguan', 'bulanan'];
        const matriks = tbl(
            [{ h: 'RT' }, ...jenisList.flatMap((j) => [{ h: `${cap(j)} (warga)`, r: 1 }, { h: `${cap(j)} (Rp)`, r: 1 }])],
            d.per_rt.map((r) => [`<b>RT ${esc(r.rt)}</b>`, ...jenisList.flatMap((j) => { const x = r.jenis[j] || { warga: 0, total: 0 }; return [x.warga || '–', x.total ? rp(x.total) : '–']; })])
        );

        reg.hsetoran = () => K.hbars({ items: setoranItems, color: C.s[0] });
        reg.htung = () => K.hbars({ items: tungItems, color: C.s[1] });

        return `
            <div class="dash-grid g-3">${cards || '<div class="card empty">Tidak ada data RT.</div>'}</div>
            <div class="dash-grid g-2">
                ${chartCard('hsetoran', `Setoran per RT — ${bl}`, 'Diurutkan menurut RT', tbl([{ h: 'RT' }, { h: 'Setoran', r: 1 }], setoranItems.map((i) => [esc(i.name), rp(i.value)])))}
                ${chartCard('htung', 'Tunggakan per RT', 'Periode berjalan + tunggakan lama', tbl([{ h: 'RT' }, { h: 'Tunggakan', r: 1 }], tungItems.map((i) => [esc(i.name), rp(i.value)])))}
            </div>
            <section class="card"><h3>Rekap per RT</h3>${rtTable}</section>
            <section class="card"><h3>Matriks RT × jenis setoran — ${esc(bl)}</h3>${matriks}</section>`;
    }

    /* ================= TUNGGAKAN ================= */
    function vTunggakan(d, reg) {
        const k = d.kpi;
        const tungParts = [{ name: 'Tunggakan berjalan', value: k.tunggakan_rutin, color: WARNA.tunggakan.rutin }, { name: 'Tunggakan lama', value: k.tunggakan_lama, color: WARNA.tunggakan.lama }];
        reg.tung2 = () => K.donut({ parts: tungParts, centerTop: compact(k.tunggakan_total), centerBottom: 'total', aria: 'Komposisi tunggakan' });
        const items = d.top_tunggakan.map((t) => ({ name: t.nama, value: t.total, color: C.s[1], sub: `RT ${t.rt} · setara ${t.periode} hari · lama ${rp(t.lama)}` }));
        reg.top = () => K.hbars({ items: items.slice(0, 8), color: C.s[1] });
        const rows = d.top_tunggakan.map((t, i) => [i + 1, `<b>${esc(t.nama)}</b>`, `RT ${esc(t.rt)}`, esc(cap(t.jenis)), t.periode, rp(t.rutin), rp(t.lama), `<b>${rp(t.total)}</b>`]);
        const cols = [{ h: '#' }, { h: 'Nama' }, { h: 'RT' }, { h: 'Jenis' }, { h: 'Setara (hari)', r: 1 }, { h: 'Berjalan', r: 1 }, { h: 'Lama', r: 1 }, { h: 'Total', r: 1 }];
        const persenMenunggak = k.warga_aktif ? Math.round((k.warga_menunggak / k.warga_aktif) * 100) : 0;
        return `
            <div class="kpi-grid n4">
                ${tile({ hero: true, label: 'Total tunggakan', value: rp(k.tunggakan_total), tone: k.tunggakan_total > 0 ? 'bad' : 'good', sub: `${k.warga_menunggak} dari ${k.warga_aktif} warga menunggak` })}
                ${tile({ label: 'Tunggakan berjalan', value: rp(k.tunggakan_rutin) })}
                ${tile({ label: 'Titipan warga', value: rp(k.titipan_total || 0), tone: 'good', sub: `${k.warga_titipan || 0} warga (menutup hari ke depan)` })}
                ${tile({ label: 'Warga menunggak', value: `${persenMenunggak}%`, meter: persenMenunggak, tone: persenMenunggak > 25 ? 'bad' : '' })}
            </div>
            <div class="dash-grid g-1-2">
                ${chartCard('tung2', 'Komposisi tunggakan', '', tbl([{ h: 'Kategori' }, { h: 'Nominal', r: 1 }], tungParts.map((p) => [esc(p.name), rp(p.value)])))}
                ${chartCard('top', 'Penunggak terbesar', '8 warga teratas', tbl(cols, rows))}
            </div>
            <section class="card"><h3>Daftar 10 penunggak terbesar</h3>${tbl(cols, rows)}
                <p class="small muted mt-md">Daftar lengkap dan tombol pengingat WhatsApp ada di menu <a href="#tunggakan" data-act="go" data-tab="tunggakan">Tunggakan</a>.</p></section>`;
    }

    /* ================= KAS ================= */
    function vKas(d, reg) {
        const kas = d.kas;
        const bl = labelBulan(d.bulan);
        const nmLalu = BULAN[(Number(d.bulan.slice(5, 7)) + 10) % 12].slice(0, 3);
        const selisih = d.kpi.setoran_bulan - kas.pengeluaran_bulan;
        const lbl = d.tren.map((t) => K.bulanPendek(t.bulan));
        const series = [{ name: 'Setoran', color: WARNA.setoran, values: d.tren.map((t) => t.setoran) }, { name: 'Pengeluaran', color: WARNA.pengeluaran, values: d.tren.map((t) => t.pengeluaran || 0) }];
        reg.kastren = (w) => K.columns({ labels: lbl, series, tipTitle: (i) => labelBulan(d.tren[i].bulan), aria: 'Setoran dan pengeluaran 12 bulan' }, w);

        // Kategori pengeluaran: maks 5 + "Lainnya" (warna abu-abu, bukan warna baru)
        const kat = kas.kategori.slice(0, 5).map((x, i) => ({ name: x.kategori, value: x.total, color: C.s[i] }));
        const sisa = kas.kategori.slice(5).reduce((a, x) => a + x.total, 0);
        if (sisa > 0) kat.push({ name: 'Lainnya', value: sisa, color: '#64748b' });
        reg.kat = () => K.donut({ parts: kat, centerTop: compact(kas.pengeluaran_bulan), centerBottom: 'pengeluaran', aria: 'Pengeluaran per kategori' });

        // Gauge rasio pengeluaran terhadap setoran bulan ini (rendah = baik)
        const rasio = d.kpi.setoran_bulan ? Math.min(100, Math.round((kas.pengeluaran_bulan / d.kpi.setoran_bulan) * 100)) : (kas.pengeluaran_bulan ? 100 : 0);
        const gaugeRasio = K.gauge({ value: 100 - rasio, label: 'Kesehatan kas bulan ini', sub: `Pengeluaran ${rasio}% dari setoran`, detail: `Pengeluaran ${rp(kas.pengeluaran_bulan)} dari setoran ${rp(d.kpi.setoran_bulan)}`, good: 50, warn: 15 });

        return `
            <div class="kpi-grid n4">
                ${tile({ hero: true, label: 'Saldo kas', value: rp(kas.saldo), tone: kas.saldo < 0 ? 'bad' : 'good', sub: `Total masuk ${rp(kas.total_masuk)}` })}
                ${tile({ label: `Setoran ${bl}`, value: rp(d.kpi.setoran_bulan), delta: delta(d.kpi.setoran_bulan, d.kpi.setoran_lalu, true, nmLalu) })}
                ${tile({ label: 'Pengeluaran', value: rp(kas.pengeluaran_bulan), delta: delta(kas.pengeluaran_bulan, kas.pengeluaran_lalu, false, nmLalu) })}
                ${tile({ label: 'Selisih bulan ini', value: rp(selisih), tone: selisih < 0 ? 'bad' : 'good', sub: selisih < 0 ? '▼ defisit' : '▲ surplus' })}
            </div>
            <div class="dash-grid g-2-1">
                ${chartCard('kastren', 'Setoran vs pengeluaran', '12 bulan terakhir', tbl([{ h: 'Bulan' }, { h: 'Setoran', r: 1 }, { h: 'Pengeluaran', r: 1 }], d.tren.map((t) => [labelBulan(t.bulan), rp(t.setoran), rp(t.pengeluaran)])))}
                <section class="card chart-card"><div class="cc-head"><div><h3>Kesehatan kas</h3><p class="small muted">Makin tinggi makin sehat</p></div></div><div class="cc-body gauges one">${gaugeRasio}</div></section>
            </div>
            <div class="dash-grid g-1-2">
                ${chartCard('kat', 'Pengeluaran per kategori', bl, tbl([{ h: 'Kategori' }, { h: 'Nominal', r: 1 }], kas.kategori.map((x) => [esc(x.kategori), rp(x.total)])))}
                <section class="card"><h3>Ringkasan kas</h3>${tbl([{ h: 'Pos' }, { h: 'Nominal', r: 1 }], [
                    ['Total pemasukan (seluruh waktu)', rp(kas.total_masuk)], ['Total pengeluaran (seluruh waktu)', rp(kas.total_keluar)],
                    [`Setoran ${esc(bl)}`, rp(d.kpi.setoran_bulan)], [`Pengeluaran ${esc(bl)}`, rp(kas.pengeluaran_bulan)]],
                    ['<b>Saldo kas</b>', `<b>${rp(kas.saldo)}</b>`])}</section>
            </div>`;
    }
})();
