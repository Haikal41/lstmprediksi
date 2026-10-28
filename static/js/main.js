const tickerMap = {
    'BTC-USD': { name: 'Bitcoin', symbol: 'BTC', accent: '#F7931A' },
    'ETH-USD': { name: 'Ethereum', symbol: 'ETH', accent: '#627EEA' },
    'SOL-USD': { name: 'Solana', symbol: 'SOL', accent: '#14F195' }
};

const COLORS = {
    text: '#8B93A1',
    textStrong: '#E8EAED',
    grid: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.08)',
    axis: 'rgba(255,255,255,0.18)',
    up: '#8CC63F',
    down: '#ED454A',
    neutral: '#4A7FE8'
};

const state = {
    ticker: 'BTC-USD',
    range: '365',
    history: [],
    metrics: null,
    prediction: null,
    loadToken: 0
};

let historyChart = null;
let predictChart = null;
let resizeTimer = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

if (window.Chart) {
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = COLORS.text;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation = { duration: 400, easing: 'easeOutQuart' };
}

// Re-render charts saat ukuran jendela berubah
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (historyChart) historyChart.resize();
        if (predictChart) predictChart.resize();
    }, 150);
});

/* ---------- Formatting ---------- */

function formatPrice(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '--';
    if (Math.abs(value) < 1) {
        return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatMetric(value, decimals) {
    if (value === null || value === undefined) return '--';
    const digits = decimals !== undefined ? decimals : (Math.abs(value) >= 100 ? 2 : 4);
    return value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function parseISODate(iso) {
    return new Date(iso + 'T00:00:00Z');
}

function formatFullDate(iso) {
    return parseISODate(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
}

function formatAxisDate(iso, range) {
    const date = parseISODate(iso);
    const longRange = range === 'all' || parseInt(range, 10) >= 365;
    const text = date.toLocaleDateString('en-GB', longRange
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { day: '2-digit', month: 'short', timeZone: 'UTC' });
    return text.replace('Sept', 'Sep');
}

function axisTickLimit() {
    return window.innerWidth < 600 ? 5 : 8;
}

function formatAxisPrice(value) {
    return '$' + new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(value);
}

/* ---------- Chart plugins ---------- */

const currentPricePlugin = {
    id: 'currentPriceLine',
    afterDraw: (chart) => {
        const ds = chart.data.datasets[0];
        const data = ds.data;
        const yScale = chart.scales.y;
        if (!data.length || !yScale) return;
        const ctx = chart.ctx;
        const last = data[data.length - 1];
        const close = last && last.c !== undefined ? last.c : last;
        const y = yScale.getPixelForValue(close);
        const color = COLORS.textStrong;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label di sisi kanan (dengan latar agar tetap terbaca di atas lilin).
        // Disembunyikan saat crosshair aktif agar tidak bertumpuk dengan label harga kursor.
        if (!chart._crosshair) {
            const label = formatPrice(close);
            ctx.font = '600 11px "Inter", sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const labelX = chart.chartArea.right - 6;
            const labelW = ctx.measureText(label).width;
            ctx.fillStyle = '#141920';
            ctx.fillRect(labelX - labelW - 5, y - 9, labelW + 10, 18);
            ctx.fillStyle = color;
            ctx.fillText(label, labelX, y + 3);
        }
        ctx.restore();
    }
};

Chart.register(currentPricePlugin);

/* ---------- Candlestick (lilin) plugin ---------- */
// Gambar tiap data OHLC sebagai lilin: badan (open-close) + cabang (high-low).
// Hijau = naik (close >= open), merah = turun, seperti di aplikasi trading.

Chart.register({
    id: 'candlestick',
    afterDraw: (chart) => {
        const ctx = chart.ctx;
        const area = chart.chartArea;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale || !area) return;

        chart.data.datasets.forEach((ds) => {
            if (ds.candlestick !== true) return;
            const data = ds.data;
            if (!data.length) return;

            const upColor = ds.upColor || COLORS.up;
            const downColor = ds.downColor || COLORS.down;

            // Jarak antar candle dihitung langsung dari skala, bukan dari tick
            // yang sudah di-autoskip (kalau pakai getPixelForTick, candle menumpuk).
            let spacing = 12;
            if (data.length > 1) {
                const p0 = xScale.getPixelForValue(0);
                const p1 = xScale.getPixelForValue(1);
                if (Number.isFinite(p0) && Number.isFinite(p1)) {
                    spacing = Math.abs(p1 - p0);
                }
            }
            const bodyW = Math.max(Math.min(spacing * 0.66, 14), 1.5);

            ctx.save();
            ctx.beginPath();
            ctx.rect(area.left, area.top, area.width, area.height);
            ctx.clip();

            data.forEach((c, i) => {
                const isUp = c.c >= c.o;
                const color = isUp ? upColor : downColor;

                const x = xScale.getPixelForValue(i);
                const yO = yScale.getPixelForValue(c.o);
                const yH = yScale.getPixelForValue(c.h);
                const yL = yScale.getPixelForValue(c.l);
                const yC = yScale.getPixelForValue(c.c);
                if (!Number.isFinite(x) || !Number.isFinite(yC)) return;

                // Cabang lilin (wick): high → low, tipis 1px seperti contoh
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.lineCap = 'butt';
                ctx.beginPath();
                const wx = Math.round(x) + 0.5;
                ctx.moveTo(wx, Math.round(yH) + 0.5);
                ctx.lineTo(wx, Math.round(yL) + 0.5);
                ctx.stroke();

                // Badan lilin (body): open → close, persegi penuh tanpa sudut bulat
                const top = Math.min(yO, yC);
                const bodyH = Math.max(Math.abs(yC - yO), 1);
                ctx.fillStyle = color;
                ctx.fillRect(
                    Math.round(x - bodyW / 2),
                    Math.round(top),
                    Math.max(Math.round(bodyW), 1),
                    Math.max(Math.round(bodyH), 1)
                );
            });

            ctx.restore();
        });
    }
});

/* ---------- Crosshair (garis bantu interaktif) ---------- */
// Garis vertikal & horizontal menempel ke candle terdekat (harga close).
// Panel OHLC + label harga muncul saat kursor berada di area chart.

const crosshairPlugin = {
    id: 'crosshair',
    afterEvent(chart, args) {
        const area = chart.chartArea;
        const e = args.event;
        if (!area) return;

        if (e.type === 'mouseout') {
            if (chart._crosshair) {
                chart._crosshair = null;
                chart.draw();
            }
            return;
        }
        if (e.type !== 'mousemove') return;

        const inside = e.x >= area.left && e.x <= area.right && e.y >= area.top && e.y <= area.bottom;
        if (!inside) {
            if (chart._crosshair) {
                chart._crosshair = null;
                chart.draw();
            }
            return;
        }

        chart._crosshair = { x: e.x, y: e.y };

        // Throttle redraw ke satu kali per frame
        if (!chart._crosshairFrame) {
            chart._crosshairFrame = requestAnimationFrame(() => {
                chart._crosshairFrame = null;
                chart.draw();
            });
        }
    },
    afterDraw(chart) {
        const pos = chart._crosshair;
        const area = chart.chartArea;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!pos || !area || !xScale || !yScale) return;

        const labels = chart.data.labels || [];
        if (!labels.length) return;

        const idx = Math.max(0, Math.min(labels.length - 1, Math.round(xScale.getValueForPixel(pos.x))));
        const candle = chart.data.datasets[0].data[idx];
        const x = xScale.getPixelForValue(idx);
        if (!Number.isFinite(x)) return;

        // Garis horizontal menempel ke harga close candle yang disorot
        const lineYValue = candle ? candle.c : yScale.getValueForPixel(pos.y);
        const y = yScale.getPixelForValue(lineYValue);
        if (!Number.isFinite(y)) return;

        const ctx = chart.ctx;
        const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.width, area.height);
        ctx.clip();

        // Garis bantu putus-putus
        ctx.strokeStyle = 'rgba(232,234,237,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        const lineX = Math.round(x) + 0.5;
        const lineY = Math.round(y) + 0.5;
        ctx.beginPath();
        ctx.moveTo(lineX, area.top);
        ctx.lineTo(lineX, area.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(area.left, lineY);
        ctx.lineTo(area.right, lineY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label dengan latar gelap
        const drawPill = (text, px, py) => {
            const padX = 7;
            ctx.font = '500 10px "JetBrains Mono", monospace';
            const w = ctx.measureText(text).width + padX * 2;
            const h = 18;
            ctx.fillStyle = '#141920';
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(px, py, w, h, 3);
            } else {
                ctx.rect(px, py, w, h);
            }
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = COLORS.textStrong;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, px + padX, py + h / 2 + 0.5);
            return w;
        };

        // Panel info OHLC di kiri atas
        if (candle) {
            const padX = 8;
            const padY = 6;
            const lineH = 14;
            const plain = (v) => formatPrice(v).replace('$', '');
            const dateText = formatFullDate(labels[idx]).replace('Sept', 'Sep');
            const row1 = `O ${plain(candle.o)}    H ${plain(candle.h)}`;
            const row2Prefix = `L ${plain(candle.l)}    C ${plain(candle.c)}`;
            const change = candle.c - candle.o;
            const pct = candle.o ? (change / candle.o) * 100 : 0;
            const pctText = `  ${change >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`;

            ctx.font = '600 10px "JetBrains Mono", monospace';
            const wDate = ctx.measureText(dateText).width;
            ctx.font = '500 10px "JetBrains Mono", monospace';
            const wRow1 = ctx.measureText(row1).width;
            const wRow2 = ctx.measureText(row2Prefix + pctText).width;
            const panelW = Math.max(wDate, wRow1, wRow2) + padX * 2;
            const panelH = padY * 2 + lineH * 3;
            const panelX = area.left + 8;
            const panelY = area.top + 8;

            ctx.fillStyle = 'rgba(20,25,32,0.92)';
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(panelX, panelY, panelW, panelH, 4);
            } else {
                ctx.rect(panelX, panelY, panelW, panelH);
            }
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = COLORS.textStrong;
            ctx.fillText(dateText, panelX + padX, panelY + padY + lineH / 2);

            ctx.font = '500 10px "JetBrains Mono", monospace';
            ctx.fillStyle = COLORS.text;
            ctx.fillText(row1, panelX + padX, panelY + padY + lineH * 1.5);

            const row2Y = panelY + padY + lineH * 2.5;
            ctx.fillText(row2Prefix, panelX + padX, row2Y);
            const prefixW = ctx.measureText(row2Prefix).width;
            ctx.fillStyle = change >= 0 ? COLORS.up : COLORS.down;
            ctx.fillText(pctText, panelX + padX + prefixW, row2Y);
        }

        // Harga close tanggal terpilih, di sisi kanan
        const priceText = formatPrice(lineYValue);
        const pricePad = 7;
        ctx.font = '500 10px "JetBrains Mono", monospace';
        const priceW = ctx.measureText(priceText).width + pricePad * 2;
        drawPill(
            priceText,
            area.right - priceW - 2,
            clamp(pos.y - 9, area.top + 2, area.bottom - 20)
        );

        ctx.restore();
    }
};

/* ---------- Axis style (mengikuti contoh.svg) ---------- */
// Sumbu bersih: hanya garis sumbu + tick pendek, tanpa garis grid.

function axisScale(extra) {
    return {
        grid: {
            display: false,
            drawTicks: true,
            tickLength: 5,
            tickColor: COLORS.axis
        },
        border: {
            display: true,
            color: COLORS.axis,
            width: 1
        },
        ...extra
    };
}

/* ---------- UI helpers ---------- */

function setLoading(active, text) {
    const overlay = $('#loadingOverlay');
    overlay.classList.toggle('active', active);
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (text) $('#loadingText').textContent = text;
    $('#predictBtn').disabled = active;
    $('.days-input').disabled = active;
}

function showError(msg) {
    const toast = $('#errorToast');
    toast.textContent = msg;
    toast.classList.add('active');
    clearTimeout(showError._timer);
    showError._timer = setTimeout(() => toast.classList.remove('active'), 5000);
}

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/* ---------- Data ---------- */

function getDays() {
    const days = parseInt($('#daysInput').value, 10);
    if (Number.isNaN(days) || days < 1 || days > 30) return null;
    return days;
}

function filterHistory() {
    const data = state.history;
    if (!data.length) return [];
    if (state.range === 'all') return data;

    const days = parseInt(state.range, 10);
    const last = parseISODate(data[data.length - 1].Date);
    const cutoff = new Date(last.getTime() - (days - 1) * 86400000);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    return data.filter(d => d.Date >= cutoffISO);
}

/* ---------- History chart ---------- */

function renderHistoryChart() {
    const data = filterHistory();
    if (!data.length) return;

    const labels = data.map(d => d.Date);
    const candles = data.map(d => ({
        o: d.Open, h: d.High, l: d.Low, c: d.Close
    }));

    // Rentang sumbu Y harus mencakup high/low (bukan hanya close), seperti contoh.svg
    let low = Infinity;
    let high = -Infinity;
    candles.forEach((c) => {
        if (c.l < low) low = c.l;
        if (c.h > high) high = c.h;
    });
    const yPad = Math.max((high - low) * 0.04, Math.abs(high) * 0.002, 0.0001);

    $('#historyRangeLabel').textContent =
        `${formatFullDate(labels[0])} — ${formatFullDate(labels[labels.length - 1])}`;

    if (historyChart) historyChart.destroy();

    const canvas = document.getElementById('historyChart');
    const ctx = canvas.getContext('2d');

    historyChart = new Chart(ctx, {
        type: 'scatter',
        plugins: [crosshairPlugin],
        data: {
            labels,
            datasets: [
                {
                    candlestick: true,
                    label: tickerMap[state.ticker].name,
                    data: candles,
                    upColor: COLORS.up,
                    downColor: COLORS.down
                },
                {
                    // Titik terpadu (tidak terlihat) untuk trigger tooltip pada setiap indeks candle
                    label: 'Close',
                    data: candles.map((c, i) => ({ x: labels[i], y: c.c })),
                    pointRadius: 0,
                    hitRadius: 14,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: { intersect: false, mode: 'index', axis: 'x' },
            plugins: {
                legend: { display: false },
                // Nilai OHLC ditampilkan oleh crosshair, bukan tooltip bawaan
                tooltip: { enabled: false }
            },
            scales: {
                x: axisScale({
                    type: 'category',
                    offset: true,
                    ticks: {
                        color: COLORS.text,
                        maxTicksLimit: axisTickLimit(),
                        maxRotation: 0,
                        autoSkip: true,
                        padding: 6,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: function (value) {
                            return formatAxisDate(this.getLabelForValue(value), state.range);
                        }
                    }
                }),
                y: axisScale({
                    suggestedMin: low - yPad,
                    suggestedMax: high + yPad,
                    ticks: {
                        color: COLORS.text,
                        maxTicksLimit: 6,
                        padding: 6,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: (value) => formatAxisPrice(value)
                    }
                })
            }
        }
    });
}

/* ---------- Forecast chart ---------- */

function renderPredictionChart(prediction) {
    const history = state.history;
    if (!history.length) return;

    const accent = tickerMap[state.ticker].accent;
    const displayLen = Math.min(90, history.length);
    const histSlice = history.slice(-displayLen);
    const histLabels = histSlice.map(d => d.Date);
    const histPrices = histSlice.map(d => d.Close);
    const forecastDates = prediction.dates;
    const forecastValues = prediction.predictions;

    const labels = [...histLabels, ...forecastDates];
    const actual = [...histPrices, ...Array(forecastDates.length).fill(null)];
    const forecast = [
        ...Array(Math.max(histLabels.length - 1, 0)).fill(null),
        histPrices[histPrices.length - 1],
        ...forecastValues
    ];

    $('#forecastSub').textContent =
        `${prediction.days}-day forecast · ${formatFullDate(forecastDates[0])} — ${formatFullDate(forecastDates[forecastDates.length - 1])}`;

    if (predictChart) predictChart.destroy();

    const canvas = document.getElementById('predictChart');
    const ctx = canvas.getContext('2d');

    // Zona latar belakang forecast (area bayang-bayang di kanan)
    const forecastZonePlugin = {
        id: 'forecastZone',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const xScale = chart.scales.x;
            // Mulai dari indeks terakhir aktual, sampai tepi kanan area chart
            const startIndex = histLabels.length - 1;
            if (startIndex < 0) return;
            const xStart = xScale.getPixelForValue(startIndex);
            if (!Number.isFinite(xStart)) return;

            ctx.save();
            ctx.fillStyle = hexToRgba(accent, 0.05);
            ctx.fillRect(xStart, chart.chartArea.top, Math.max(0, chart.chartArea.right - xStart), chart.chartArea.height);
            ctx.restore();
        }
    };

    predictChart = new Chart(ctx, {
        type: 'line',
        plugins: [forecastZonePlugin],
        data: {
            labels,
            datasets: [
                {
                    label: 'Actual',
                    data: actual,
                    borderColor: COLORS.up,
                    borderWidth: 1.8,
                    borderCapStyle: 'round',
                    pointRadius: 0,
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Forecast',
                    data: forecast,
                    borderColor: accent,
                    borderWidth: 2.2,
                    borderDash: [7, 5],
                    borderCapStyle: 'round',
                    pointRadius: (c) => (
                        c.dataIndex === histLabels.length - 1 || c.dataIndex === labels.length - 1 ? 4.5 : 0
                    ),
                    pointBackgroundColor: accent,
                    pointBorderColor: '#0B0E14',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            animation: { duration: 600 },
            plugins: {
                forecastZone: {},
                legend: {
                    labels: {
                        color: COLORS.text,
                        usePointStyle: true,
                        boxWidth: 10,
                        padding: 20,
                        font: { size: 11, family: "'Inter', sans-serif" },
                        generateLabels: (chart) => {
                            const datasets = chart.data.datasets;
                            return datasets.map((ds, i) => ({
                                text: ds.label === 'Forecast' ? 'Forecast (LSTM)' : 'Actual',
                                fillStyle: ds.borderColor || '#fff',
                                strokeStyle: ds.borderColor || '#fff',
                                lineWidth: 2,
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#141920',
                    titleColor: COLORS.text,
                    bodyColor: COLORS.textStrong,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    usePointStyle: true,
                    callbacks: {
                        title: (items) => formatFullDate(items[0].label),
                        label: (c) => {
                            if (c.parsed.y === null || c.parsed.y === undefined) return null;
                            return `${c.dataset.label === 'Forecast' ? 'Forecast' : 'Actual'}: ${formatPrice(c.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: axisScale({
                    type: 'category',
                    offset: true,
                    ticks: {
                        color: COLORS.text,
                        maxTicksLimit: axisTickLimit(),
                        maxRotation: 0,
                        autoSkip: true,
                        padding: 6,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: function (value) {
                            return formatAxisDate(this.getLabelForValue(value), '90');
                        }
                    }
                }),
                y: axisScale({
                    ticks: {
                        color: COLORS.text,
                        maxTicksLimit: 6,
                        padding: 6,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: (value) => formatAxisPrice(value)
                    }
                })
            }
        }
    });
}

/* ---------- Cards & metrics ---------- */

function renderPriceDisplay(prediction) {
    const last = state.history[state.history.length - 1];
    const lastClose = last.Close;
    const values = prediction.predictions;
    const finalPrice = values[values.length - 1];
    const delta = finalPrice - lastClose;
    const pct = lastClose ? (delta / lastClose) * 100 : 0;
    const isUp = delta >= 0;

    $('#priceValue').textContent = formatPrice(finalPrice);

    const change = $('#priceChange');
    change.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`;
    change.className = 'price-change ' + (isUp ? 'up' : 'down');
    change.title = `${formatPrice(Math.abs(delta))} ${isUp ? 'higher' : 'lower'} than last close`;

    $('#priceLast').textContent = 'Last close: ' + formatPrice(lastClose);
    $('#priceDate').textContent = 'Forecast for ' + formatFullDate(prediction.dates[prediction.dates.length - 1]);
    $('#priceHorizon').textContent =
        `${prediction.days}-day horizon · from ${formatFullDate(prediction.dates[0])}`;
    $('#priceTicker').textContent = `${tickerMap[state.ticker].name} (${state.ticker})`;
}

function renderMetrics(metrics) {
    $('#metricRmse').textContent = formatMetric(metrics.RMSE, 2);
    $('#metricMae').textContent = formatMetric(metrics.MAE, 2);
    $('#metricMape').textContent = formatMetric(metrics.MAPE, 2) + '%';
    $('#epochInfo').textContent =
        `Epoch: ${metrics.epochs_actual} / ${metrics.epochs_max}` +
        (metrics.epochs_actual < metrics.epochs_max ? ' (early stopping)' : '');
}

function renderDataInfo() {
    const data = state.history;
    if (!data.length) {
        $('#dataInfo').textContent = 'Data: --';
        return;
    }
    $('#dataInfo').textContent =
        `Data: ${formatFullDate(data[0].Date)} — ${formatFullDate(data[data.length - 1].Date)} · ${data.length.toLocaleString('en-US')} days`;
}

/* ---------- Helpers ---------- */

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- Loading flows ---------- */

async function loadAll() {
    const token = ++state.loadToken;
    setLoading(true, 'Memuat data historis...');

    try {
        const [history, metrics] = await Promise.all([
            fetchJSON(`/api/history/${state.ticker}`),
            fetchJSON(`/api/metrics/${state.ticker}`)
        ]);
        if (token !== state.loadToken) return;

        state.history = history;
        state.metrics = metrics;
        renderMetrics(metrics);
        renderHistoryChart();
        renderDataInfo();

        setLoading(true, 'Menjalankan prediksi...');
        const prediction = await fetchJSON('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: state.ticker, days: getDays() || 7 })
        });
        if (token !== state.loadToken) return;

        state.prediction = prediction;
        renderPriceDisplay(prediction);
        renderPredictionChart(prediction);
        setLoading(false);
    } catch (err) {
        if (token !== state.loadToken) return;
        setLoading(false);
        showError(err.message);
    }
}

async function doPredict() {
    const days = getDays();
    if (days === null) {
        showError('Jumlah hari harus antara 1 dan 30');
        return;
    }

    const token = ++state.loadToken;
    setLoading(true, 'Menjalankan prediksi...');

    try {
        const prediction = await fetchJSON('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: state.ticker, days })
        });
        if (token !== state.loadToken) return;

        state.prediction = prediction;
        renderPriceDisplay(prediction);
        renderPredictionChart(prediction);
        setLoading(false);
    } catch (err) {
        if (token !== state.loadToken) return;
        setLoading(false);
        showError(err.message);
    }
}

/* ---------- Events ---------- */

$$('.ticker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.ticker === state.ticker) return;
        $$('.ticker-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.ticker = btn.dataset.ticker;
        loadAll();
    });
});

$$('.range-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    btn.addEventListener('click', () => {
        if (btn.dataset.range === state.range) return;
        $$('.range-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        state.range = btn.dataset.range;
        renderHistoryChart();
    });
});

$('#predictBtn').addEventListener('click', doPredict);

$('#daysInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doPredict();
});

$('#daysInput').addEventListener('blur', () => {
    const days = getDays();
    if (days !== null) $('#daysInput').value = days;
});

document.addEventListener('DOMContentLoaded', loadAll);
