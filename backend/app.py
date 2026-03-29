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

# Load your best.pt (ensure it's in the same folder)
model = YOLO('best.pt') 

accelModel = joblib.load('models/driving_accel_model.pkl')
gyroModel = joblib.load('models/driving_gyro_model.pkl')

data_store = {
    "gyroMeasures": [],
    "accelMeasures": []
}


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


@sock.route('/')
def echo(ws):
    while True:
        message = ws.receive()
        
        if isinstance(message, str):
            if message.startswith('{'):
                # Handle JSON sensor data
                try:
                    data = json.loads(message)

                    if isinstance(data, dict) and '_data' in data:
                        print("Warning: Received stringified Blob JSON! Ensure React Native sends ArrayBuffer.")
                
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
            else:
                # Failsafe: if a binary frame accidentally arrives as text, re-encode it
                message = message.encode('latin1', errors='ignore')

        if isinstance(message, bytes):
            # Handle binary image data (blob)
            try:
                nparr = np.frombuffer(message, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None:
                    # Run inference (auto-device safely falls back; verbose=False stops YOLO log spam)
                    results = model(frame, conf=0.4, verbose=False)
                    
                    predictions = [{"label": model.names[int(box.cls[0])], "confidence": float(box.conf[0])} for r in results for box in r.boxes]
                            
                    # Send predictions back to React Native
                    ws.send(json.dumps({"type": "inference", "predictions": predictions}))
                else:
                    print(f"Error: Could not decode binary data of length {len(message)}")
            except Exception as e:
                print(f"Error processing image: {e}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)