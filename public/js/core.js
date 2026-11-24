/* Inti aplikasi: state, API, util UI, navigasi, dan tema. */
(function () {
    'use strict';

    const App = (window.App = {
        user: null,
        token: null,
        tab: 'beranda',
        theme: 'dark',
        views: {},
        actions: {},
        forms: {},
        changes: {},
        timers: []
    });

    /* ---------- penyimpanan local ---------- */
    function store(op, key, val) {
        try {
            if (op === 'get') return localStorage.getItem(key);
            if (op === 'set') localStorage.setItem(key, val);
            if (op === 'del') localStorage.removeItem(key);
        } catch (_) { /* penyimpanan diblokir */ }
        return null;
    }
    App.store = store;

    // Inisialisasi tema
    App.theme = store('get', 'jimpitan_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', App.theme);

    /* ---------- util ---------- */
    App.$ = (s, r) => (r || document).querySelector(s);
    App.esc = (s) =>
        String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    App.rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    App.today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    App.ymd = (v) => String(v || '').slice(0, 10);
    App.tglId = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
        return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
    };
    App.loading = (t) => `<div class="loading"><span class="small muted">${App.esc(t || 'Memuat data…')}</span></div>`;
    App.can = (...roles) => !!App.user && roles.includes(App.user.role);
    // Izin dikirim server (api/_lib/izin.js) → menu & tombol mengikuti aturan yang sama dengan API
    // Peran "dibatasi RT" (mis. Pengurus RT): data yang tampil hanya milik RT pada akunnya
    App.rtKunci = () => !!(App.user && App.user.batas_rt);
    App.has = (...izin) => !!App.user && Array.isArray(App.user.izin) && izin.some((i) => App.user.izin.includes(i));
    App.ROLE_LABEL = { admin: 'Admin Sistem', bendahara_rw: 'Bendahara RW', bendahara_jimpitan: 'Bendahara Jimpitan', pengurus_rt: 'Pengurus RT' };

    const ICONS = {
        home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/>',
        alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        wallet: '<path d="M20 7h-7m7 10h-7M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><circle cx="16" cy="12" r="1"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        out: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
        cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
        moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
    };
    App.icon = (n) =>
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

    /* ---------- API ---------- */
    App.api = async function (path, opts) {
        opts = opts || {};
        const headers = { Accept: 'application/json' };
        if (App.token) headers.Authorization = 'Bearer ' + App.token;
        let body;
        if (opts.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(opts.body);
        }
        let res;
        try {
            res = await fetch(path, { method: opts.method || 'GET', headers, body });
        } catch (_) {
            throw new Error('Tidak dapat terhubung ke server.');
        }
        let data = null;
        try { data = await res.json(); } catch (_) { /* bukan JSON */ }
        if (res.status === 401 && App.token) {
            App.logout(true);
            throw new Error('Sesi berakhir. Silakan login kembali.');
        }
        if (!res.ok || !data || data.success === false) {
            if (res.status === 403 && !data) {
                throw new Error('Akses ditolak (HTTP 403). Pastikan aplikasi dibuka melalui alamat server Node.js (misal http://localhost:3333), bukan dibuka langsung sebagai file:// atau subfolder Apache tanpa reverse proxy.');
            }
            throw new Error((data && data.error) || `Permintaan gagal (${res.status}).`);
        }
        return data;
    };

    App.download = async function (path, filename) {
        const res = await fetch(path, { headers: App.token ? { Authorization: 'Bearer ' + App.token } : {} });
        if (!res.ok) throw new Error('Gagal mengunduh berkas.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };


    /* ---------- pagination (di sisi tampilan; default: 10 per halaman) ---------- */
    App.pgState = {};
    App.pgRedraw = {};
    App.pgGet = (k) => App.pgState[k] || (App.pgState[k] = { size: '10', page: 1 });
    App.pgReset = (k) => { App.pgGet(k).page = 1; };
    // Potong array sesuai pengaturan; kembalikan { items, bar } (bar = HTML kontrol halaman)
    App.paginate = function (k, arr) {
        const st = App.pgGet(k);
        const total = arr.length;
        const size = st.size === 'all' ? Math.max(total, 1) : Number(st.size);
        const pages = Math.max(1, Math.ceil(total / size));
        if (st.page > pages) st.page = pages;
        if (st.page < 1) st.page = 1;
        const a = (st.page - 1) * size;
        const items = st.size === 'all' ? arr : arr.slice(a, a + size);
        let bar = '';
        if (total > 10 || String(st.size) !== '10') {
            const opt = [['all', 'Semua'], ['10', '10'], ['15', '15'], ['20', '20']]
                .map(([v, l]) => `<option value="${v}" ${String(st.size) === v ? 'selected' : ''}>${l}</option>`).join('');
            const info = total ? `${a + 1}–${a + items.length} dari ${total}` : '0 data';
            bar = `<div class="pager no-print">
                <label class="pager-size small muted">Tampilkan <select data-change="pgSize" data-pg="${k}" aria-label="Jumlah data per halaman">${opt}</select></label>
                <span class="small muted pager-info">${info}</span>
                ${pages > 1 ? `<div class="pager-nav">
                    <button class="btn sm" data-act="pgGo" data-pg="${k}" data-n="-1" ${st.page <= 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">‹</button>
                    <span class="small">Hal <b>${st.page}</b>/${pages}</span>
                    <button class="btn sm" data-act="pgGo" data-pg="${k}" data-n="1" ${st.page >= pages ? 'disabled' : ''} aria-label="Halaman berikutnya">›</button></div>` : ''}
            </div>`;
        }
        return { items, bar };
    };
    App.changes.pgSize = (el) => {
        const st = App.pgGet(el.dataset.pg);
        st.size = el.value;
        st.page = 1;
        const fn = App.pgRedraw[el.dataset.pg];
        if (fn) fn();
    };
    App.actions.pgGo = (el) => {
        const st = App.pgGet(el.dataset.pg);
        st.page += Number(el.dataset.n);
        const fn = App.pgRedraw[el.dataset.pg];
        if (fn) fn();
        const v = App.$('#view');
        if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /* ---------- toast & dialog ---------- */
    App.toast = function (msg, type) {
        const box = App.$('#toasts');
        if (!box) return;
        const el = document.createElement('div');
        el.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
        const iconSvg = type === 'err' ? App.icon('alert') : App.icon('check');
        el.innerHTML = `<span style="width:16px;height:16px;flex:none;display:flex">${iconSvg}</span><span style="flex:1">${App.esc(msg)}</span>`;
        box.appendChild(el);
        setTimeout(() => el.remove(), type === 'err' ? 6000 : 3500);
    };
    App.fail = (e) => App.toast(e && e.message ? e.message : String(e), 'err');

    App.dialog = function (html) {
        const d = App.$('#dlg');
        d.innerHTML = html;
        if (!d.open) d.showModal();
        return d;
    };
    App.closeDialog = () => {
        const d = App.$('#dlg');
        if (d && d.open) d.close();
    };

    /* ---------- navigasi ---------- */
    function tabsFor(user) {
        const t = [{ id: 'beranda', label: 'Beranda', icon: 'home' }];
        if (!user) return t;
        const ada = (i) => App.has(i);
        const G1 = 'Pencatatan', G2 = 'Pantau & Laporan', G3 = 'Data & Sistem';
        if (ada('jimpitan.lihat')) t.push({ id: 'setoran', label: 'Setor Jimpitan', icon: 'cash', group: G1 });
        if (ada('iuran.lihat')) t.push({ id: 'iuran', label: 'Iuran Wajib', icon: 'wallet', group: G1 });
        if (ada('sewa.lihat')) t.push({ id: 'pemasukanlain', label: 'Pemasukan Lainnya', icon: 'tag', group: G1 });
        if (ada('pengeluaran.lihat')) t.push({ id: 'pengeluaran', label: 'Pengeluaran', icon: 'out', group: G1 });
        if (ada('jimpitan.lihat')) {
            t.push({ id: 'kalender', label: 'Kalender', icon: 'cal', group: G2 });
            t.push({ id: 'tunggakan', label: 'Tunggakan', icon: 'alert', group: G2 });
        }
        if (ada('kas.lihat')) t.push({ id: 'kas', label: 'Buku Kas', icon: 'book', group: G2 });
        if (ada('laporan.lihat')) t.push({ id: 'laporan', label: 'Laporan', icon: 'chart', group: G2 });
        if (ada('warga.lihat')) t.push({ id: 'warga', label: 'Warga', icon: 'users', group: G3 });
        if (ada('sistem.kelola')) t.push({ id: 'pengaturan', label: 'Pengaturan', icon: 'gear', group: G3 });
        return t;
    }

    /* ---------- sidebar: terbuka / ciut (ikon saja) / tersembunyi; di HP berupa laci ---------- */
    const SB = (App.sidebar = {
        mode: 'open',                                   // open | mini | hidden (desktop)
        drawer: false,                                  // laci terbuka (HP)
        mq: window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false },
        load() { const v = store('get', 'ekas_sidebar'); if (['open', 'mini', 'hidden'].includes(v)) this.mode = v; },
        save() { store('set', 'ekas_sidebar', this.mode); },
        mobile() { return !!this.mq.matches; },
        ada() { return !!App.user; },                   // tamu hanya punya Beranda → tanpa sidebar
        apply() {
            const b = document.body;
            const ada = this.ada();
            b.classList.toggle('no-sb', !ada);
            b.classList.toggle('sb-open', ada && !this.mobile() && this.mode === 'open');
            b.classList.toggle('sb-mini', ada && !this.mobile() && this.mode === 'mini');
            b.classList.toggle('sb-hidden', ada && !this.mobile() && this.mode === 'hidden');
            b.classList.toggle('sb-drawer', ada && this.mobile() && this.drawer);
            const tampil = this.mobile() ? this.drawer : this.mode !== 'hidden';
            const btn = App.$('#sbToggle');
            if (btn) btn.setAttribute('aria-expanded', String(!!tampil));
            const bd = App.$('#sbBackdrop');
            if (bd) bd.setAttribute('aria-hidden', String(!(this.mobile() && this.drawer)));
            this.ukurTopbar();
        },
        ukurTopbar() {
            const t = App.$('#topbar');
            if (t) document.documentElement.style.setProperty('--topbar-h', t.offsetHeight + 'px');
        },
        toggle() {                                      // tombol ☰ di topbar
            if (this.mobile()) { this.drawer = !this.drawer; }
            else { this.mode = this.mode === 'hidden' ? 'open' : 'hidden'; this.save(); }
            this.apply();
        },
        mini() {                                        // tombol ciutkan di dasar sidebar
            if (this.mobile()) { this.drawer = false; }
            else { this.mode = this.mode === 'mini' ? 'open' : 'mini'; this.save(); }
            this.apply();
        },
        tutup() { if (this.drawer) { this.drawer = false; this.apply(); } }
    });
    SB.load();
    const tbEl = document.getElementById('topbar');
    if (tbEl && window.ResizeObserver) new ResizeObserver(() => SB.ukurTopbar()).observe(tbEl);
    App.actions.sbToggle = () => SB.toggle();
    App.actions.sbMini = () => SB.mini();
    App.actions.sbClose = () => SB.tutup();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') SB.tutup(); });
    window.addEventListener('resize', () => { if (!SB.mobile()) SB.drawer = false; SB.apply(); });

    App.go = function (tab) {
        App.tab = tab;
        try { history.replaceState(null, '', '#' + tab); } catch (_) { /* abaikan */ }
        SB.drawer = false;                              // HP: tutup laci setelah memilih menu
        App.render();
    };

    /* Render user area & theme toggle */
    App.renderUserArea = function () {
        const ua = App.$('#userArea');
        if (!ua) return;
        const themeBtn = `<button class="theme-btn" data-act="toggleTheme" title="${App.theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}" aria-label="Ganti mode tampilan">${App.icon(App.theme === 'light' ? 'moon' : 'sun')}</button>`;
        if (App.user) {
            const initial = (App.user.nama || 'U').slice(0, 1).toUpperCase();
            ua.innerHTML = `
                <div class="user-chip">
                    <div class="user-avatar">${App.esc(initial)}</div>
                    <div class="user-info">
                        <b>${App.esc(App.user.nama)}</b>
                        <span>${App.esc(App.user.role_nama || App.ROLE_LABEL[App.user.role] || App.user.role)}${App.user.rt ? ' · RT ' + App.esc(App.user.rt) : ''}</span>
                    </div>
                </div>
                ${themeBtn}
                <button class="btn sm ghost" data-act="logout" title="Keluar dari akun">Keluar</button>`;
        } else {
            ua.innerHTML = `
                ${themeBtn}
                <button class="btn sm primary" data-act="loginDialog">Masuk</button>`;
        }
    };

    App.render = async function () {
        App.timers.forEach(clearInterval);
        App.timers = [];
        const tabs = tabsFor(App.user);
        if (!tabs.some((t) => t.id === App.tab)) App.tab = 'beranda';

        let grup = null;
        App.$('#tabs').innerHTML = tabs.map((t) => {
            const head = t.group && t.group !== grup ? `<div class="nav-group">${App.esc(t.group)}</div>` : (!t.group && grup ? '<div class="nav-sep"></div>' : '');
            grup = t.group || null;
            return head + `<button class="nav-item ${t.id === App.tab ? 'active' : ''}" data-act="go" data-tab="${t.id}" title="${App.esc(t.label)}" ${t.id === App.tab ? 'aria-current="page"' : ''}>${App.icon(t.icon)}<span class="nav-label">${App.esc(t.label)}</span></button>`;
        }).join('');

        App.renderUserArea();
        SB.apply();

        const root = App.$('#view');
        const view = App.views[App.tab];
        root.innerHTML = App.loading();
        try {
            await view(root);
        } catch (e) {
            root.innerHTML = `<div class="card empty">${App.esc(e.message || 'Terjadi kesalahan.')}</div>`;
        }
    };

    /* ---------- login / logout ---------- */
    App.actions.loginDialog = () => {
        const d = App.dialog(`
            <h3>Masuk E-Kas</h3>
            <p class="small muted" style="margin-bottom:16px">Silakan masukkan username dan password akun Anda.</p>
            <form data-form="login" autocomplete="on">
                <div class="form-grid">
                    <div class="full"><label class="f" for="lu">Username</label><input id="lu" name="username" autocomplete="username" required maxlength="50" placeholder="Username akun"></div>
                    <div class="full"><label class="f" for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="••••••••"></div>
                </div>
                <div class="dlg-actions">
                    <button type="button" class="btn" data-act="closeDialog">Batal</button>
                    <button type="submit" class="btn primary">Masuk</button>
                </div>
            </form>`);
        setTimeout(() => App.$('#lu', d) && App.$('#lu', d).focus(), 40);
    };
    App.actions.closeDialog = () => App.closeDialog();

    App.forms.login = async (f) => {
        const btn = App.$('button[type=submit]', f);
        btn.disabled = true;
        try {
            const r = await App.api('/api/auth/login', {
                method: 'POST',
                body: { username: f.username.value, password: f.password.value }
            });
            App.token = r.token;
            App.user = r.user;
            store('set', 'jimpitan_token', r.token);
            App.closeDialog();
            App.toast(`Selamat datang, ${r.user.nama}.`);
            const iz = (i) => (r.user.izin || []).includes(i);
            App.tab = iz('dashboard.lihat') ? (iz('jimpitan.tulis') ? 'setoran' : 'beranda')
                : iz('jimpitan.tulis') ? 'setoran' : iz('iuran.lihat') ? 'iuran' : iz('sewa.lihat') ? 'pemasukanlain' : 'beranda';
            App.render();
        } catch (e) {
            App.fail(e);
            btn.disabled = false;
        }
    };

    App.logout = function (silent) {
        App.token = null;
        App.user = null;
        store('del', 'jimpitan_token');
        App.tab = 'beranda';
        if (!silent) App.toast('Anda telah keluar.');
        App.render();
    };
    App.actions.logout = () => App.logout(false);
    App.actions.go = (el) => App.go(el.dataset.tab);

    /* ---------- Ganti Mode Tema ---------- */
    App.actions.toggleTheme = () => {
        App.theme = App.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', App.theme);
        store('set', 'jimpitan_theme', App.theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = App.theme === 'light' ? '#f8fafc' : '#090d16';
        App.renderUserArea();
        window.dispatchEvent(new Event('resize'));
    };

    /* ---------- delegasi event ---------- */
    document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        if (t.tagName === 'A' && t.getAttribute('href') && t.getAttribute('target') !== '_blank') e.preventDefault();
        const fn = App.actions[t.dataset.act];
        if (fn) {
            Promise.resolve(fn(t, e)).catch(App.fail);
        }
    });
    document.addEventListener('submit', (e) => {
        const f = e.target.closest('form[data-form]');
        if (!f) return;
        e.preventDefault();
        const fn = App.forms[f.dataset.form];
        if (fn) Promise.resolve(fn(f, e)).catch(App.fail);
    });
    document.addEventListener('change', (e) => {
        const t = e.target.closest('[data-change]');
        if (!t) return;
        const fn = App.changes[t.dataset.change];
        if (fn) Promise.resolve(fn(t, e)).catch(App.fail);
    });
    document.addEventListener('input', (e) => {
        const t = e.target.closest('[data-input]');
        if (!t) return;
        const fn = App.changes[t.dataset.input];
        if (fn) fn(t, e);
    });

    /* ---------- mulai ---------- */
    App.start = async function () {
        const hash = location.hash.replace('#', '');
        if (hash) App.tab = hash === 'sewa' ? 'pemasukanlain' : hash;
        App.token = store('get', 'jimpitan_token');
        if (App.token) {
            try {
                const r = await App.api('/api/me');
                App.user = r.user;
            } catch (_) {
                App.token = null;
                store('del', 'jimpitan_token');
            }
        }
        App.render();
        // judul dari pengaturan publik
        try {
            const r = await App.api('/api/pengaturan');
            if (r.pengaturan.nama_web) App.$('#brandTitle').textContent = r.pengaturan.nama_web;
            if (r.pengaturan.subjudul) App.$('#brandSub').textContent = r.pengaturan.subjudul;
        } catch (_) { /* gunakan teks bawaan */ }
    };
})();
