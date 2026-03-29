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

SIGNAL_WINDOW = 50
ACCEL_BOOST_FACTOR = 9
GYRO_NOISE_FLOOR = 0.75
GYRO_TOLERANCE = 0.03
PROBABILITY_THRESHOLD = 0.4

# Extract features for acceleration and gyroscope models
def extract_features_from_json(data_list, dataType):
    """
    Converts the incoming WebSocket JSON list into the 8 features 
    your model expects.
    """
    df = pd.DataFrame(data_list)

    if dataType == "accel":
        df['x'] *= ACCEL_BOOST_FACTOR
        df['y'] *= ACCEL_BOOST_FACTOR
        df['z'] *= ACCEL_BOOST_FACTOR
    
    # Vector Magnitudes
    mag = np.sqrt(df['x']**2 + df['y']**2 + df['z']**2)
    jerk = np.diff(mag)

    is_gyro_noisy = mag.std() < GYRO_NOISE_FLOOR
    
    features = [
        mag.mean(),
        mag.std(),
        mag.max(),
        mag.min(),
        np.mean(np.abs(jerk)) if len(jerk) > 0 else 0,
        mag.quantile(0.75) - mag.quantile(0.25)
    ]

    return features, is_gyro_noisy

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
                        if len(data_store["gyroMeasures"]) <= SIGNAL_WINDOW:
                            features, is_inert = extract_features_from_json(data_store["gyroMeasures"], "gyro")

                            # Check for tolerance

                            if abs(features[0]) < GYRO_TOLERANCE:
                                prediction = 0
                            else:
                                prediction = int(gyroModel.predict([features])[0])

                            if not is_inert and prediction != 0:
                                ws.send(json.dumps({"type": "gyro_inference", "label": "Dangerous"}))
                            else:
                                ws.send(json.dumps({"type": "gyro_inference", "label": "Normal"}))

                            data_store["gyroMeasures"] = []

                    elif data['type'] == 'accelerometer':
                        data_store["accelMeasures"].append(data['data'])
                        if len(data_store["accelMeasures"]) <= SIGNAL_WINDOW:
                            features, _ = extract_features_from_json(data_store["accelMeasures"], "accel")
                            prediction_probs = accelModel.predict_proba([features])[0]

                            if prediction_probs[1] > PROBABILITY_THRESHOLD:
                                ws.send(json.dumps({"type": "accel_inference", "label": "Dangerous"}))
                            else:
                                ws.send(json.dumps({"type": "accel_inference", "label": "Normal"}))

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
                    # Run inference (lowered conf slightly to catch more yawns)
                    results = model(frame, conf=0.3, verbose=False)
                    
                    predictions = [{"label": model.names[int(box.cls[0])], "confidence": float(box.conf[0])} for r in results for box in r.boxes]
                            
                    # Prioritize 'yawning' over 'sleepy' over 'active' so it displays on screen
                    def get_priority(p):
                        lbl = str(p["label"]).lower()
                        if "yawn" in lbl or lbl == "2": return 0
                        if "sleep" in lbl or lbl == "1": return 1
                        return 2
                        
                    predictions.sort(key=get_priority)
                            
                    # Debugging: Print to console so you can explicitly see if YOLO is detecting it
                    print(f"YOLO Detections: {[f'{p['label']} ({p['confidence']:.2f})' for p in predictions]}")
                            
                    # Send predictions back to React Native
                    ws.send(json.dumps({"type": "inference", "predictions": predictions}))
            except Exception as e:
                print(f"Error processing image: {e}")

if __name__ == '__main__':
    # Ensure port 3000 matches your setup
    app.run(host='0.0.0.0', port=3000)