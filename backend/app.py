from flask import Flask
from flask_sock import Sock
import cv2
import numpy as np
import json
from ultralytics import YOLO

app = Flask(__name__)
sock = Sock(app)

# Load your best.pt (ensure it's in the same folder)
model = YOLO('best.pt') 

@sock.route('/')
def echo(ws):
    while True:
        message = ws.receive()
        
        if isinstance(message, str):
            if message.startswith('{'):
                # Handle JSON sensor data
                try:
                    data = json.loads(message)
                    # Detect if RN accidentally sent a Blob object instead of raw bytes
                    if isinstance(data, dict) and '_data' in data:
                        print("Warning: Received stringified Blob JSON! Ensure React Native sends ArrayBuffer.")
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
                else:
                    print(f"Error: Could not decode binary data of length {len(message)}")
            except Exception as e:
                print(f"Error processing image: {e}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)