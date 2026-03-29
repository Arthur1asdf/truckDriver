import cv2
import time
from ultralytics import YOLO

# Load the combined model once training hits 50/50
model = YOLO('./best.pt') 
cap = cv2.VideoCapture(0) # iPhone index

# Yawn Variables
yawn_count = 0
is_yawning = False
last_yawn_time = 0
COOLDOWN_PERIOD = 3 

# Sleep/Eye Variables
eyes_closed_start = None
SLEEP_THRESHOLD = 1.0  # Seconds before eyes are considered "Closed/Sleeping"

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    results = model(frame, conf=0.5, device='mps')
    
    current_yawn_detected = False
    current_sleepy_detected = False

    for r in results:
        for box in r.boxes:
            label = model.names[int(box.cls[0])]
            conf = float(box.conf[0])
            
            if label == 'yawn':
                current_yawn_detected = True
            if label == 'sleepy':
                current_sleepy_detected = True
            
            # Drawing Boxes
            color = (0, 0, 255) if label in ['sleepy', 'yawn'] else (0, 255, 0)
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {conf:.2%}", (x1, y1 - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # --- Logic for Yawn Counter ---
    current_time = time.time()
    if current_yawn_detected and not is_yawning:
        if (current_time - last_yawn_time) > COOLDOWN_PERIOD:
            yawn_count += 1
            last_yawn_time = current_time
            is_yawning = True
    elif not current_yawn_detected:
        is_yawning = False

    # --- Logic for Eyes Closed ---
    if current_sleepy_detected:
        if eyes_closed_start is None:
            eyes_closed_start = current_time # Start timing the closure
        
        duration = current_time - eyes_closed_start
        if duration >= SLEEP_THRESHOLD:
            cv2.putText(frame, "EYES CLOSED!", (20, 110), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 4)
            # Optional: Add a system beep
            # print('\a') 
    else:
        eyes_closed_start = None # Reset if eyes open

    # UI Overlay
    cv2.putText(frame, f"Yawns: {yawn_count}", (20, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

    cv2.imshow("HackUSF Monitor", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()