# Crypto LSTM Prediction Web App

A full-stack web application for demonstrating LSTM-based cryptocurrency price prediction. Built with Flask (backend) and vanilla HTML/CSS/JS + Chart.js (frontend).

## Prerequisites

- Python 3.9+
- pip

## Installation

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

## Usage

```bash
python app.py
```

Buka `http://localhost:5000` (atau set `PORT` untuk port lain):

```bash
# Windows PowerShell
$env:PORT=5001; python app.py
```

## Fitur Dashboard

- Pilih koin (BTC / ETH / SOL) dan horizon prediksi 1–30 hari.
- Grafik histori dengan filter rentang **1M / 3M / 1Y / ALL**.
- Grafik **Actual vs Forecast** — garis prediksi tersambung ke harga terakhir.
- Kartu metrik evaluasi (RMSE, MAE, MAPE) dan jumlah epoch.
- Badge perubahan harga prediksi terhadap close terakhir.

## Update Data Historis

`data/crypto_data.csv` dapat diperbarui dengan harga terbaru dari Yahoo Finance:

```bash
python update_data.py          # tambahkan data baru sampai hari ini
python update_data.py --check  # cek tanggal terakhir tanpa mengubah file
```

Script akan membuat backup otomatis di `data/crypto_data_backup_<timestamp>.csv`
sebelum menulis ulang dataset. Restart server setelah update agar data baru dimuat.

## Project Structure

```
crypto-prediction-webapp/
├── app.py                  # Flask app + REST API
├── update_data.py          # Ambil data harian terbaru dari Yahoo Finance
├── models/                 # Trained LSTM models and scalers
│   ├── model_btc.keras
│   ├── model_eth.keras
│   ├── model_sol.keras
│   ├── scaler_btc.pkl
│   ├── scaler_eth.pkl
│   ├── scaler_sol.pkl
│   └── hasil_evaluasi_model_final.csv
├── data/
│   └── crypto_data.csv     # Historical OHLCV data
├── static/
│   ├── css/style.css
│   └── js/main.js
├── templates/
│   └── index.html
├── requirements.txt
└── README.md
```

## API Endpoints

- `GET /api/history/<ticker>` — Returns historical Close prices for the given ticker
- `GET /api/metrics/<ticker>` — Returns evaluation metrics (RMSE, MAE, MAPE)
- `POST /api/predict` — Accepts `{"ticker": "BTC-USD", "days": 7}`, returns predicted prices

## Retraining the Model

Replace the model files in `models/` with your new `.keras` and `.pkl` files, following the naming convention:
- `model_{ticker_lower}.keras` (e.g., `model_btc.keras`)
- `scaler_{ticker_lower}.pkl` (e.g., `scaler_btc.pkl`)

Update `hasil_evaluasi_model_final.csv` with new metrics if desired.

## Catatan

- Model memakai window 60 hari dan hanya kolom `Close`.
- Prediksi multi-hari memakai *recursive forecasting*, sehingga error dapat menumpuk untuk horizon panjang.
- Metrik evaluasi berasal dari data uji, bukan jaminan akurasi prediksi ke depan.
- Hasil prediksi bersifat eksperimental dan bukan saran investasi.
