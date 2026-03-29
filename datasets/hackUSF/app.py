import cv2
from ultralytics import YOLO

# Load your best.pt (ensure it's in the same folder)
model = YOLO('best.pt') 

# Initialize camera (Try 0, then 1 if 0 fails on your Mac Pro)
cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    # Run inference on the M4 Pro GPU
    results = model(frame, conf=0.4, device='mps')

    for r in results:
        for box in r.boxes:
            # 1. Get the confidence score (0.0 to 1.0)
            confidence = float(box.conf[0])
            
            # 2. Get the class name (active or sleepy)
            class_id = int(box.cls[0])
            label = model.names[class_id]

            # 3. Create the display string (e.g., "sleepy 94%")
            display_text = f"{label} {confidence:.2%}"
            
            # Coordinate logic for drawing
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            color = (0, 0, 255) if label == 'sleepy' else (0, 255, 0)

            # Draw the box and the label with confidence
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, display_text, (x1, y1 - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    cv2.imshow("Drowsiness Monitor - Confident Mode", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()