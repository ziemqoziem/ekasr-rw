/* Pustaka grafik SVG/HTML ringan (tanpa dependensi): kolom, area, donut, pie, gauge, bar horizontal, sparkline.
 * Mengikuti spesifikasi dataviz: warna kategorikal berurutan tetap, batang <= 24px berujung bulat 4px,
 * garis 2px, jarak 2px antar-bagian, cincin permukaan pada titik, grid hairline, legenda selalu ada
 * untuk >= 2 seri, tooltip saat hover/tap, dan tampilan tabel sebagai alternatif aksesibel. */
(function () {
    'use strict';
    const App = window.App;
    const esc = App.esc;

    // Palet kategorikal — urutan TETAP, adaptif terhadap tema terang/gelap.
    const C = {
        s: ['#0d9488', '#f97316', '#10b981', '#f59e0b', '#0284c7', '#06b6d4', '#0e7490', '#ef4444'],
        good: '#10b981', warn: '#f59e0b', serious: '#f97316', crit: '#ef4444'
    };
    Object.defineProperty(C, 'grid', {
        get() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; }
    });
    Object.defineProperty(C, 'axis', {
        get() { return document.documentElement.getAttribute('data-theme') === 'light' ? '#64748b' : '#94a3b8'; }
    });
    Object.defineProperty(C, 'track', {
        get() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)'; }
    });
    Object.defineProperty(C, 'ink', {
        get() { return document.documentElement.getAttribute('data-theme') === 'light' ? '#0f172a' : '#f8fafc'; }
    });
    Object.defineProperty(C, 'muted', {
        get() { return document.documentElement.getAttribute('data-theme') === 'light' ? '#64748b' : '#94a3b8'; }
    });
    const NUM = new Intl.NumberFormat('id-ID');
    const rp = (n) => 'Rp ' + NUM.format(Math.round(n || 0));
    const compact = (n) => {
        const a = Math.abs(n);
        const f = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
        if (a >= 1e9) return f(n / 1e9) + ' M';
        if (a >= 1e6) return f(n / 1e6) + ' jt';
        if (a >= 1e3) return f(n / 1e3) + ' rb';
        return String(Math.round(n));
    };
    const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const bulanPendek = (ym) => BLN[Number(ym.slice(5, 7)) - 1];

    function niceMax(max) {
        if (max <= 0) return 1;
        const pow = Math.pow(10, Math.floor(Math.log10(max)));
        for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
        return 10 * pow;
    }
    const ticksFor = (max, n) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
    const tip = (lines) => esc(lines.join('\n'));

    /* ---------- kolom (grouped) ---------- */
    function columns(o, w) {
        const H = o.height || 230;
        const m = { l: 48, r: 8, t: 12, b: 26 };
        const pw = Math.max(50, w - m.l - m.r);
        const ph = H - m.t - m.b;
        const n = o.labels.length;
        const max = niceMax(Math.max(1, ...o.series.flatMap((s) => s.values)));
        const ticks = ticksFor(max, 4);
        const y = (v) => m.t + ph - (v / max) * ph;
        const slot = pw / n;
        const k = o.series.length;
        const thick = Math.max(4, Math.min(24, (slot * 0.74 - (k - 1) * 2) / k));
        const groupW = thick * k + (k - 1) * 2;
        let g = '';
        for (const t of ticks) {
            g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}" stroke-width="1"/>`;
            g += `<text x="${m.l - 7}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="${C.axis}">${compact(t)}</text>`;
        }
        const step = n > 8 && slot < 38 ? 2 : 1;
        for (let i = 0; i < n; i++) {
            const cx = m.l + slot * i + slot / 2;
            if (i % step === 0 || i === n - 1) {
                g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${C.axis}">${esc(o.labels[i])}</text>`;
            }
            const lines = [o.tipTitle ? o.tipTitle(i) : o.labels[i], ...o.series.map((s) => `${s.name}: ${rp(s.values[i])}`)];
            g += `<rect class="hit" x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ph}" fill="transparent" data-tip="${tip(lines)}"/>`;
            o.series.forEach((s, j) => {
                const v = s.values[i];
                if (!v) return;
                const x = cx - groupW / 2 + j * (thick + 2);
                const top = y(v);
                const h = m.t + ph - top;
                const r = Math.min(4, h, thick / 2);
                g += `<path d="M${x} ${m.t + ph} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + thick - r} Q${x + thick} ${top} ${x + thick} ${top + r} V${m.t + ph} Z" fill="${s.color}" pointer-events="none"/>`;
            });
        }
        const legend = o.series.length > 1
            ? `<ul class="legend inline">${o.series.map((s) => `<li><i style="background:${s.color}"></i>${esc(s.name)}</li>`).join('')}</ul>` : '';
        return `${legend}<svg class="svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
    }

    /* ---------- area / garis (satu seri) ---------- */
    function area(o, w) {
        const H = o.height || 200;
        const m = { l: 48, r: 14, t: 18, b: 26 };
        const pw = Math.max(50, w - m.l - m.r);
        const ph = H - m.t - m.b;
        const pts = o.points;
        const n = pts.length;
        const max = niceMax(Math.max(1, ...pts.map((p) => p.y)));
        const x = (i) => m.l + (n === 1 ? pw / 2 : (pw * i) / (n - 1));
        const y = (v) => m.t + ph - (v / max) * ph;
        let g = '';
        for (const t of ticksFor(max, 4)) {
            g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}" stroke-width="1"/>`;
            g += `<text x="${m.l - 7}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="${C.axis}">${compact(t)}</text>`;
        }
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
        g += `<path d="${line} L${x(n - 1)} ${m.t + ph} L${x(0)} ${m.t + ph} Z" fill="${o.color}" fill-opacity="0.1"/>`;
        g += `<path d="${line}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        const every = Math.max(1, Math.round(n / Math.max(2, Math.floor(pw / 70))));
        const half = pw / Math.max(1, n - 1) / 2;
        pts.forEach((p, i) => {
            if (i % every === 0 || i === n - 1) {
                const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
                g += `<text x="${x(i)}" y="${H - 8}" text-anchor="${anchor}" font-size="10.5" fill="${C.axis}">${esc(p.label)}</text>`;
            }
            g += `<g class="hitg" data-tip="${tip([p.tip || p.label, rp(p.y)])}">
                <rect class="hit" x="${x(i) - half}" y="${m.t}" width="${Math.max(2, half * 2)}" height="${ph}" fill="transparent"/>
                <g class="xh"><line x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${m.t + ph}" stroke="${C.axis}" stroke-width="1"/>
                <circle cx="${x(i)}" cy="${y(p.y)}" r="4" fill="${o.color}" style="stroke:var(--surf)" stroke-width="2"/></g></g>`;
        });
        const last = pts[n - 1];
        g += `<circle cx="${x(n - 1)}" cy="${y(last.y)}" r="4" fill="${o.color}" style="stroke:var(--surf)" stroke-width="2" pointer-events="none"/>`;
        g += `<text x="${x(n - 1)}" y="${Math.max(11, y(last.y) - 9)}" text-anchor="end" font-size="11" font-weight="700" fill="${C.ink}" pointer-events="none">${compact(last.y)}</text>`;
        return `<svg class="svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
    }

    /* ---------- donut / pie ---------- */
    function arcPath(cx, cy, R, r, a0, a1) {
        const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1);
        if (r <= 0) return `M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
        const [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
        return `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
    }
    function donut(o) {
        const size = o.size || 170;
        const R = size / 2 - 2;
        const r = o.inner === 0 ? 0 : R * (o.inner || 0.62);
        const cx = size / 2, cy = size / 2;
        const parts = o.parts.filter((p) => p.value > 0);
        const total = parts.reduce((a, p) => a + p.value, 0);
        let svg = '';
        if (!total) {
            svg = `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${C.track}" stroke-width="${R - r || 8}"/>`;
        } else if (parts.length === 1) {
            const p = parts[0];
            svg = r > 0
                ? `<circle class="arc" cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}" data-tip="${tip([p.name, `${o.fmt ? o.fmt(p.value) : rp(p.value)} (100%)`])}"/>`
                : `<circle class="arc" cx="${cx}" cy="${cy}" r="${R}" fill="${p.color}" data-tip="${tip([p.name, `${o.fmt ? o.fmt(p.value) : rp(p.value)} (100%)`])}"/>`;
        } else {
            let a = -Math.PI / 2;
            const gap = 2 / R; // jarak 2px antar-bagian
            for (const p of parts) {
                const sweep = (p.value / total) * Math.PI * 2;
                const a0 = a + gap / 2, a1 = a + sweep - gap / 2;
                if (a1 > a0) {
                    svg += `<path class="arc" d="${arcPath(cx, cy, R, r, a0, a1)}" fill="${p.color}" data-tip="${tip([p.name, `${o.fmt ? o.fmt(p.value) : rp(p.value)} (${Math.round((p.value / total) * 100)}%)`])}"/>`;
                }
                a += sweep;
            }
        }
        const center = r > 0 && (o.centerTop || o.centerBottom)
            ? `<text x="${cx}" y="${cy + (o.centerBottom ? -1 : 6)}" text-anchor="middle" font-size="${o.centerSize || 17}" font-weight="800" fill="${C.ink}">${esc(o.centerTop || '')}</text>
               ${o.centerBottom ? `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10.5" fill="${C.muted}">${esc(o.centerBottom)}</text>` : ''}` : '';
        const legend = `<ul class="legend">${o.parts.map((p) => {
            const pct = total ? Math.round((p.value / total) * 100) : 0;
            return `<li><i style="background:${p.color}"></i><span class="lg-name">${esc(p.name)}</span><span class="lg-val">${o.fmt ? esc(o.fmt(p.value)) : rp(p.value)}</span><span class="lg-pct">${pct}%</span></li>`;
        }).join('')}</ul>`;
        return `<div class="donut"><svg class="svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(o.aria || '')}">${svg}${center}</svg>${legend}</div>`;
    }

    /* ---------- gauge setengah lingkaran ---------- */
    function gauge(o) {
        const W = 200, H = 122, cx = 100, cy = 100, R = 78, sw = 14;
        const v = Math.max(0, Math.min(100, o.value));
        const hi = o.good === undefined ? 75 : o.good;
        const lo = o.warn === undefined ? 40 : o.warn;
        const st = v >= hi ? { c: C.good, t: '✔ Baik' } : v >= lo ? { c: C.warn, t: '▲ Perlu perhatian' } : { c: C.crit, t: '● Rendah' };
        const pt = (pct, rad = R) => {
            const phi = Math.PI * (1 - pct / 100);
            return [cx + rad * Math.cos(phi), cy - rad * Math.sin(phi)];
        };
        const [sx, sy] = pt(0), [ex, ey] = pt(100), [vx, vy] = pt(v);
        const track = `<path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${ex} ${ey}" fill="none" stroke="${C.track}" stroke-width="${sw}" stroke-linecap="round"/>`;
        const fill = v > 0 ? `<path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${vx} ${vy}" fill="none" stroke="${st.c}" stroke-width="${sw}" stroke-linecap="round"/>
            <circle cx="${vx}" cy="${vy}" r="5" fill="${st.c}" style="stroke:var(--surf)" stroke-width="2"/>` : '';
        const svg = `<svg class="svg gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || `${o.label}: ${v}%`)}">
            ${track}${fill}
            <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="30" font-weight="800" fill="${C.ink}">${v}<tspan font-size="15" font-weight="700" fill="${C.muted}">%</tspan></text>
            <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${C.ink}">${esc(st.t)}</text>
            <text x="${sx}" y="${H - 2}" text-anchor="middle" font-size="10" fill="${C.axis}">0</text>
            <text x="${ex}" y="${H - 2}" text-anchor="middle" font-size="10" fill="${C.axis}">100</text>
            <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent" data-tip="${tip([o.label, o.detail || `${v}%`])}"/>
        </svg>`;
        return `<div class="gauge-box">${svg}<div class="gauge-label">${esc(o.label)}</div><div class="gauge-sub">${esc(o.sub || '')}</div></div>`;
    }

    /* ---------- bar horizontal berurut ---------- */
    function hbars(o) {
        const max = Math.max(1, ...o.items.map((i) => i.value));
        return `<div class="hb">${o.items.map((it, idx) => `
            <div class="hb-row" data-tip="${tip([it.name, o.fmt ? o.fmt(it.value) : rp(it.value), ...(it.sub ? [it.sub] : [])])}">
                <span class="hb-name">${esc(it.name)}</span>
                <span class="hb-track"><i style="width:${Math.max(1.5, (it.value / max) * 100)}%;background:${it.color || o.color || C.s[0]}"></i></span>
                <span class="hb-val">${esc(o.fmt ? o.fmt(it.value) : rp(it.value))}</span>
            </div>`).join('')}</div>`;
    }

    /* ---------- sparkline ---------- */
    function spark(values, color, w = 100, h = 30) {
        if (!values.length) return '';
        const max = Math.max(1, ...values);
        const n = values.length;
        const x = (i) => 3 + ((w - 6) * i) / Math.max(1, n - 1);
        const y = (v) => h - 4 - (v / max) * (h - 9);
        const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
            <path d="${d}" fill="none" stroke="${C.axis}" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${x(n - 1)}" cy="${y(values[n - 1])}" r="3.5" fill="${color}" style="stroke:var(--surf)" stroke-width="2"/></svg>`;
    }

    /* ---------- tooltip global ---------- */
    let tipEl = null;
    function ensureTip() {
        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.className = 'viz-tip';
            tipEl.setAttribute('role', 'tooltip');
            tipEl.hidden = true;
            document.body.appendChild(tipEl);
        }
        return tipEl;
    }
    function showTip(target, x, y) {
        const el = ensureTip();
        const text = target.getAttribute('data-tip');
        if (!text) { el.hidden = true; return; }
        const [head, ...rest] = text.split('\n');
        el.innerHTML = `<b>${esc(head)}</b>${rest.map((l) => `<div>${esc(l)}</div>`).join('')}`;
        el.hidden = false;
        const r = el.getBoundingClientRect();
        const nx = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14));
        const ny = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
    }
    document.addEventListener('pointermove', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (t) showTip(t, e.clientX, e.clientY); else if (tipEl) tipEl.hidden = true;
    });
    document.addEventListener('pointerdown', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (t) showTip(t, e.clientX, e.clientY); else if (tipEl) tipEl.hidden = true;
    });
    document.addEventListener('scroll', () => { if (tipEl) tipEl.hidden = true; }, true);

    /* ---------- mount responsif ---------- */
    // Setiap elemen [data-chart="id"] dirender ulang dengan lebar sesungguhnya (agar teks tidak mengecil di HP).
    const observers = [];
    function mountAll(root, registry) {
        observers.splice(0).forEach((o) => o.disconnect());
        root.querySelectorAll('[data-chart]').forEach((el) => {
            const fn = registry[el.dataset.chart];
            if (!fn) return;
            let last = 0;
            const draw = () => {
                const w = Math.floor(el.clientWidth);
                if (!w || Math.abs(w - last) < 6) return;
                last = w;
                el.innerHTML = fn(w);
            };
            draw();
            if ('ResizeObserver' in window) {
                const ro = new ResizeObserver(() => requestAnimationFrame(draw));
                ro.observe(el);
                observers.push(ro);
            }
        });
    }

    App.charts = { C, rp, compact, bulanPendek, columns, area, donut, gauge, hbars, spark, mountAll };
})();
