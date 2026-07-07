from tensorflow import keras

model = keras.models.load_model("models/model_btc.keras")

model.summary()