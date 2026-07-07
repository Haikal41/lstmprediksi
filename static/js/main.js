let currentTicker = 'BTC-USD';
let historyChart = null;
let predictChart = null;
let historyData = null;

const tickerMap = {
    'BTC-USD': { name: 'Bitcoin', symbol: 'BTC' },
    'ETH-USD': { name: 'Ethereum', symbol: 'ETH' },
    'SOL-USD': { name: 'Solana', symbol: 'SOL' }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatPrice(value) {
    if (value >= 1000) {
        return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + value.toFixed(2);
}

function formatMetric(value, decimals) {
    if (decimals === undefined) decimals = value >= 100 ? 2 : value >= 1 ? 4 : 4;
    return value.toFixed(decimals);
}

function showLoading() {
    $('#loadingOverlay').classList.add('active');
}

function hideLoading() {
    $('#loadingOverlay').classList.remove('active');
}

function showError(msg) {
    const toast = $('#errorToast');
    toast.textContent = msg;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 5000);
}

// Ticker selection
$$('.ticker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.ticker-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTicker = btn.dataset.ticker;
        loadAll();
    });
});

// Predict button
$('#predictBtn').addEventListener('click', doPredict);

// Enter key on days input
$('#daysInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doPredict();
});

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

async function loadHistory() {
    const data = await fetchJSON(`/api/history/${currentTicker}`);
    historyData = data;
    return data;
}

async function loadMetrics() {
    return await fetchJSON(`/api/metrics/${currentTicker}`);
}

async function loadPrediction(days) {
    return await fetchJSON('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: currentTicker, days })
    });
}

function renderMetrics(metrics) {
    $('#metricRmse').textContent = formatMetric(metrics.RMSE, 2);
    $('#metricMae').textContent = formatMetric(metrics.MAE, 2);
    $('#metricMape').textContent = metrics.MAPE.toFixed(2) + '%';
    $('#epochInfo').textContent = `Epoch: ${metrics.epochs_actual} / ${metrics.epochs_max} (Early Stopping)`;
}

function renderPriceDisplay(data, predictions) {
    const last = data[data.length - 1];
    const lastPrice = last.Close;
    const lastDate = last.Date;
    const predPrice = predictions.predictions[predictions.predictions.length - 1];
    const firstPred = predictions.predictions[0];
    const direction = firstPred >= lastPrice ? 'up' : 'down';
    const arrow = direction === 'up' ? '\u25B2' : '\u25BC';

    $('#priceValue').textContent = formatPrice(predPrice);
    $('#priceDirection').textContent = arrow;
    $('#priceDirection').className = 'price-direction ' + direction;
    $('#priceLast').textContent = 'Last close: ' + formatPrice(lastPrice);
    $('#priceDate').textContent = 'Prediction for ' + predictions.dates[predictions.dates.length - 1];
    $('#priceTicker').textContent = tickerMap[currentTicker].name + ' (' + currentTicker + ')';
}

function renderHistoryChart(data) {
    const labels = data.map(d => d.Date);
    const prices = data.map(d => d.Close);

    if (historyChart) {
        historyChart.destroy();
    }

    const ctx = document.getElementById('historyChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentTicker + ' Close Price',
                data: prices,
                borderColor: '#E8EAED',
                backgroundColor: 'rgba(232, 234, 237, 0.03)',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#141920',
                    titleColor: '#8B93A1',
                    bodyColor: '#E8EAED',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => formatPrice(ctx.parsed.y)
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { color: '#8B93A1', maxTicksLimit: 10, font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: {
                        color: '#8B93A1',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: val => '$' + val.toLocaleString()
                    }
                }
            }
        }
    });
}

function renderPredictionChart(history, prediction) {
    const displayLen = Math.min(120, history.length);
    const histSlice = history.slice(-displayLen);
    const histLabels = histSlice.map(d => d.Date);
    const histPrices = histSlice.map(d => d.Close);

    const labels = [...histLabels, ...prediction.dates];
    const prices = [...histPrices, ...Array(prediction.dates.length).fill(null)];
    const predPrices = [...Array(histLabels.length).fill(null), ...prediction.predictions];

    if (predictChart) {
        predictChart.destroy();
    }

    const ctx = document.getElementById('predictChart').getContext('2d');
    predictChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Actual',
                    data: prices,
                    borderColor: '#E8EAED',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Prediction',
                    data: predPrices,
                    borderColor: '#4A7FE8',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    labels: { color: '#8B93A1', font: { family: 'Inter', size: 11 }, usePointStyle: true, padding: 16 }
                },
                tooltip: {
                    backgroundColor: '#141920',
                    titleColor: '#8B93A1',
                    bodyColor: '#E8EAED',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y !== null ? formatPrice(ctx.parsed.y) : 'N/A')
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { color: '#8B93A1', maxTicksLimit: 10, font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: {
                        color: '#8B93A1',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: val => '$' + val.toLocaleString()
                    }
                }
            }
        }
    });
}

async function loadAll() {
    try {
        showLoading();
        const [history, metrics] = await Promise.all([loadHistory(), loadMetrics()]);
        renderMetrics(metrics);
        renderHistoryChart(history);
        hideLoading();

        // Auto-predict on ticker change
        const days = parseInt($('#daysInput').value) || 7;
        const clamped = Math.min(Math.max(days, 1), 30);
        $('#daysInput').value = clamped;
        await doPredictInternal();
    } catch (err) {
        hideLoading();
        showError(err.message);
    }
}

async function doPredict() {
    const days = parseInt($('#daysInput').value);
    if (isNaN(days) || days < 1 || days > 30) {
        showError('Jumlah hari harus antara 1 dan 30');
        return;
    }
    await doPredictInternal(days);
}

async function doPredictInternal(days) {
    if (!days) days = parseInt($('#daysInput').value) || 7;
    try {
        showLoading();
        const [history, prediction] = await Promise.all([loadHistory(), loadPrediction(days)]);
        renderPriceDisplay(history, prediction);
        renderPredictionChart(history, prediction);
        hideLoading();
    } catch (err) {
        hideLoading();
        showError(err.message);
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', () => loadAll());
