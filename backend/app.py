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

connected_frontend_clients = set()

SIGNAL_WINDOW = 50
ACCEL_BOOST_FACTOR = 9
GYRO_NOISE_FLOOR = 0.75
GYRO_TOLERANCE = 0.03
PROBABILITY_THRESHOLD = 0.4

def extract_features_from_json(data_list, dataType):
    df = pd.DataFrame(data_list)

    if dataType == "accel":
        df['x'] *= ACCEL_BOOST_FACTOR
        df['y'] *= ACCEL_BOOST_FACTOR
        df['z'] *= ACCEL_BOOST_FACTOR
    
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

def broadcast_to_frontend(data_dict):
    """Helper to send inferences to the dashboard"""
    message_str = json.dumps(data_dict)
    for client in list(connected_frontend_clients):
        try:
            client.send(message_str)
        except Exception:
            pass

@sock.route('/frontend')
def frontend_handler(ws):
    connected_frontend_clients.add(ws)
    print(f"✅ Frontend Dashboard connected. Total: {len(connected_frontend_clients)}")
    try:
        while True:
            ws.receive()
    except Exception:
        pass
    finally:
        connected_frontend_clients.remove(ws)
        print("❌ Frontend Dashboard disconnected.")

@sock.route('/')
def echo(ws):
    while True:
        message = ws.receive()
        
        if isinstance(message, str):
            if message.startswith('{'):
                try:
                    data = json.loads(message)
                    
                    # Relay all raw phone JSON (including our new telemetry) to frontend
                    for client in list(connected_frontend_clients):
                        try:
                            client.send(message)
                        except Exception:
                            pass

                    if data['type'] == 'gyro':
                        data_store["gyroMeasures"].append(data['data'])
                        if len(data_store["gyroMeasures"]) <= SIGNAL_WINDOW:
                            features, is_inert = extract_features_from_json(data_store["gyroMeasures"], "gyro")

                            if abs(features[0]) < GYRO_TOLERANCE:
                                prediction = 0
                            else:
                                prediction = int(gyroModel.predict([features])[0])

                            label = "Dangerous" if (not is_inert and prediction != 0) else "Normal"
                            resp = {"type": "gyro_inference", "label": label}
                            
                            ws.send(json.dumps(resp))
                            broadcast_to_frontend(resp) # Broadcast to dashboard

                            data_store["gyroMeasures"] = []

                    elif data['type'] == 'accelerometer':
                        data_store["accelMeasures"].append(data['data'])
                        if len(data_store["accelMeasures"]) <= SIGNAL_WINDOW:
                            features, _ = extract_features_from_json(data_store["accelMeasures"], "accel")
                            prediction_probs = accelModel.predict_proba([features])[0]

                            label = "Dangerous" if prediction_probs[1] > PROBABILITY_THRESHOLD else "Normal"
                            resp = {"type": "accel_inference", "label": label}
                            
                            ws.send(json.dumps(resp))
                            broadcast_to_frontend(resp) # Broadcast to dashboard

                            data_store["accelMeasures"] = []

                except json.JSONDecodeError:
                    pass
                continue

        if isinstance(message, bytes):
            for client in list(connected_frontend_clients):
                try:
                    client.send(message)
                except:
                    continue

            try:
                nparr = np.frombuffer(message, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None:
                    results = model(frame, conf=0.3, verbose=False)
                    predictions = [{"label": model.names[int(box.cls[0])], "confidence": float(box.conf[0])} for r in results for box in r.boxes]
                            
                    def get_priority(p):
                        lbl = str(p["label"]).lower()
                        if "yawn" in lbl or lbl == "2": return 0
                        if "sleep" in lbl or lbl == "1": return 1
                        return 2
                        
                    predictions.sort(key=get_priority)
                    
                    resp = {"type": "inference", "predictions": predictions}
                    ws.send(json.dumps(resp))
                    broadcast_to_frontend(resp) # Broadcast to dashboard
            except Exception as e:
                print(f"Error processing frame: {e}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)