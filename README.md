# Crypto LSTM Prediction Web App

A full-stack web application for demonstrating LSTM-based cryptocurrency price prediction. Built with Flask (backend) and vanilla HTML/CSS/JS + Chart.js (frontend).

## Prerequisites

- Python 3.9+
- pip

## Installation

```bash
pip install -r requirements.txt
```

## Usage

```bash
python app.py
```

Open `http://localhost:5000` in your browser.

## Project Structure

```
crypto-prediction-webapp/
├── app.py                  # Flask app + REST API
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
