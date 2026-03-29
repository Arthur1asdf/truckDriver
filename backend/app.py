from flask import Flask
from flask_sock import Sock
import cv2
import joblib
import numpy as np
import json
from ultralytics import YOLO
import pandas as pd

app = Flask(__name__)
sock = Sock(app)

# Load models
model = YOLO('best.pt') 
accelModel = joblib.load('models/driving_accel_model.pkl')
gyroModel = joblib.load('models/driving_gyro_model.pkl')

data_store = {
    "gyroMeasures": [],
    "accelMeasures": []
}

# Keep track of frontend dashboard connections
connected_frontend_clients = set()

SIGNAL_WINDOW = 100

def extract_features_from_json(data_list):
    df = pd.DataFrame(data_list)
    mag = np.sqrt(df['x']**2 + df['y']**2 + df['z']**2)
    jerk = np.diff(mag)
    return [
        mag.mean(),
        mag.std(),
        mag.max(),
        mag.min(),
        np.mean(np.abs(jerk)) if len(jerk) > 0 else 0,
        mag.quantile(0.75) - mag.quantile(0.25)
    ]

@sock.route('/frontend')
def frontend_handler(ws):
    """Route specifically for the Vite Dashboard to connect to."""
    connected_frontend_clients.add(ws)
    print(f"✅ Frontend Dashboard connected. Total: {len(connected_frontend_clients)}")
    try:
        while True:
            # Keep the connection open
            ws.receive()
    except Exception:
        pass
    finally:
        connected_frontend_clients.remove(ws)
        print("❌ Frontend Dashboard disconnected.")

@sock.route('/')
def echo(ws):
    """Route for the React Native phone app to send data to."""
    while True:
        message = ws.receive()
        
        if isinstance(message, str):
            if message.startswith('{'):
                try:
                    data = json.loads(message)
                    # Relay sensor data to frontend for future-proofing
                    for client in connected_frontend_clients:
                        client.send(message)

                    if data['type'] == 'gyro':
                        data_store["gyroMeasures"].append(data['data'])
                        if len(data_store["gyroMeasures"]) >= SIGNAL_WINDOW:
                            features = extract_features_from_json(data_store["gyroMeasures"])
                            prediction = int(gyroModel.predict([features])[0])
                            label = "Dangerous" if prediction != 0 else "Normal"
                            ws.send(json.dumps({"type": "gyro_inference", "label": label}))
                            data_store["gyroMeasures"] = []

                    elif data['type'] == 'accelerometer':
                        data_store["accelMeasures"].append(data['data'])
                        if len(data_store["accelMeasures"]) >= SIGNAL_WINDOW:
                            features = extract_features_from_json(data_store["accelMeasures"])
                            prediction = int(accelModel.predict([features])[0])
                            label = "Dangerous" if prediction != 0 else "Normal"
                            ws.send(json.dumps({"type": "accel_inference", "label": label}))
                            data_store["accelMeasures"] = []

                except json.JSONDecodeError:
                    pass
                continue

        if isinstance(message, bytes):
            # 1. Relay the raw image bytes to all frontend clients immediately
            for client in connected_frontend_clients:
                try:
                    client.send(message)
                except:
                    continue

            # 2. Process for local inference
            try:
                nparr = np.frombuffer(message, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None:
                    results = model(frame, conf=0.4, verbose=False)
                    predictions = [{"label": model.names[int(box.cls[0])], "confidence": float(box.conf[0])} for r in results for box in r.boxes]
                    ws.send(json.dumps({"type": "inference", "predictions": predictions}))
            except Exception as e:
                print(f"Error processing image: {e}")

if __name__ == '__main__':
    # Ensure port 3000 matches your setup
    app.run(host='0.0.0.0', port=3000)