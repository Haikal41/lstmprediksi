import os
import json
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, render_template
from tensorflow.keras.models import load_model
import joblib

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
DATA_DIR = os.path.join(BASE_DIR, 'data')

TICKERS = ['BTC-USD', 'ETH-USD', 'SOL-USD']
WINDOW_SIZE = 60
MIN_DAYS = 1
MAX_DAYS = 30

models = {}
scalers = {}
metrics = {}
df = None


TICKER_FILE_MAP = {
    'BTC-USD': 'btc',
    'ETH-USD': 'eth',
    'SOL-USD': 'sol'
}

def load_artifacts():
    global models, scalers, metrics, df

    for ticker in TICKERS:
        key = TICKER_FILE_MAP[ticker]
        model_path = os.path.join(MODELS_DIR, f'model_{key}.keras')
        scaler_path = os.path.join(MODELS_DIR, f'scaler_{key}.pkl')
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            models[ticker] = load_model(model_path)
            scalers[ticker] = joblib.load(scaler_path)

    metrics_path = os.path.join(MODELS_DIR, 'hasil_evaluasi_model_final.csv')
    if os.path.exists(metrics_path):
        mdf = pd.read_csv(metrics_path)
        for _, row in mdf.iterrows():
            metrics[row['ticker']] = {
                'RMSE': row['RMSE'],
                'MAE': row['MAE'],
                'MAPE': row['MAPE'],
                'epochs_actual': int(row['epochs_actual']),
                'epochs_max': int(row['epochs_max'])
            }

    data_path = os.path.join(DATA_DIR, 'crypto_data.csv')
    if os.path.exists(data_path):
        df = pd.read_csv(data_path, parse_dates=['Date'])
        df = df.sort_values('Date').reset_index(drop=True)


load_artifacts()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/history/<ticker>')
def get_history(ticker):
    if ticker not in TICKERS:
        return jsonify({'error': f'Ticker tidak dikenal. Gunakan: {", ".join(TICKERS)}'}), 400
    if df is None:
        return jsonify({'error': 'Data historis tidak tersedia'}), 500

    ticker_df = df[df['Ticker'] == ticker].copy()
    if ticker_df.empty:
        return jsonify({'error': f'Tidak ada data untuk {ticker}'}), 404

    result = ticker_df[['Date', 'Close']].copy()
    result['Date'] = result['Date'].dt.strftime('%Y-%m-%d')
    return jsonify(result.to_dict(orient='records'))


@app.route('/api/metrics/<ticker>')
def get_metrics(ticker):
    if ticker not in TICKERS:
        return jsonify({'error': f'Ticker tidak dikenal. Gunakan: {", ".join(TICKERS)}'}), 400
    if ticker not in metrics:
        return jsonify({'error': f'Metrik evaluasi tidak tersedia untuk {ticker}'}), 404
    return jsonify(metrics[ticker])


@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body harus berupa JSON'}), 400

    ticker = data.get('ticker')
    days = data.get('days', 7)

    if ticker not in TICKERS:
        return jsonify({'error': f'Ticker tidak dikenal. Gunakan: {", ".join(TICKERS)}'}), 400
    if not isinstance(days, int) or days < MIN_DAYS or days > MAX_DAYS:
        return jsonify({'error': f'Days harus berupa angka antara {MIN_DAYS} dan {MAX_DAYS}'}), 400

    if df is None:
        return jsonify({'error': 'Data historis tidak tersedia'}), 500
    if ticker not in models or ticker not in scalers:
        return jsonify({'error': f'Model atau scaler untuk {ticker} tidak tersedia'}), 500

    ticker_df = df[df['Ticker'] == ticker].sort_values('Date')
    if len(ticker_df) < WINDOW_SIZE:
        return jsonify({'error': f'Data historis kurang dari {WINDOW_SIZE} hari'}), 400

    close_prices = ticker_df['Close'].values
    last_dates = ticker_df['Date'].values

    last_60 = close_prices[-WINDOW_SIZE:].reshape(-1, 1)
    scaled = scalers[ticker].transform(last_60)

    model = models[ticker]
    predictions = []

    current_window = scaled.copy()
    for i in range(days):
        pred_input = current_window.reshape(1, WINDOW_SIZE, 1)
        pred_scaled = model.predict(pred_input, verbose=0)
        pred_value = scalers[ticker].inverse_transform(pred_scaled)[0, 0]
        predictions.append(float(pred_value))
        current_window = np.append(current_window[1:], pred_scaled, axis=0)

    last_date = pd.Timestamp(last_dates[-1])
    pred_dates = [(last_date + pd.Timedelta(days=d + 1)).strftime('%Y-%m-%d') for d in range(days)]

    return jsonify({'ticker': ticker, 'days': days, 'dates': pred_dates, 'predictions': predictions})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
