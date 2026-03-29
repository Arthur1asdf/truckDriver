# VigilEyes 🚛👁️

**VigilEyes** is an AI-powered "Digital Co-Pilot" designed to monitor and protect long-haul truckers from the dangers of fatigue and isolation. By turning a smartphone into an intelligent safety hub, the app actively watches over the driver to ensure they stay alert and safe during grueling shifts.

---

## 🚀 The Elevator Pitch

Truckers drive 11+ hours daily in isolation. **VigilEyes** uses custom YOLOv8 models and sensor fusion to detect fatigue and swerving, providing a real-time risk score to keep the backbone of our society safe.

---

## 🧠 The "Why" behind VigilEyes

Long-haul truckers are the invisible backbone of our global economy, yet they are among the most isolated workers in the world. Spending **11+ hours a day** behind the wheel and over **300 days a year** on the road, these individuals operate in a "functional vacuum" where the pressure to deliver often outweighs the opportunity for self-care.

We realized that while modern logistics is obsessed with tracking the _package_, it rarely tracks the _person_. Fatigue isn't a loud event—it’s a series of "micro-sleeps" and slow reaction times. VigilEyes acts as an empathetic co-pilot to ensure the people responsible for delivering our world can safely return to theirs.

---

## ✨ Key Features

### 📊 Dynamic Risk Score (0–100)

The core of VigilEyes evaluates driver behavior in real-time:

- **0–59 (Safe/Alert)**: Focused driving with normal physiological signs.
- **60+ (At Risk)**: Early signs of fatigue detected. Triggers active engagement alerts.
- **80–100 (Critical)**: Immediate intervention required to prevent a potential accident.

### 😴 Fatigue Detection

Monitors the driver’s face via real-time computer vision to detect:

- **Micro-sleeps**: Eyes closed for an extended duration.
- **Yawning**: Frequent yawning patterns associated with exhaustion.

### 🏎️ Driving Pattern Analysis

Tracks vehicle movement through high-precision telemetry:

- **Erratic Swerving**: Identifying lane drifting.
- **Jerky Braking**: Detecting sudden, reactive stops common in tired drivers.

### 🔗 Intelligent Sensor Fusion

Combines visual cues (60% weight) with vehicle motion data (40% weight) to create a high-fidelity safety profile, distinguishing between a bump in the road and a dangerous loss of focus.

---

## 🛠️ Technical Architecture

We engineered a distributed system designed to handle high-frequency data streams with minimal latency across four main layers:

1.  **Mobile Sensor Hub (React Native)**: Captures high-precision telemetry (Accelerometer/Gyroscope) and polls video frames every 50ms.
2.  **Secure Real-Time Tunnel (Tailscale + WebSockets)**: A low-latency bridge streaming sensor data and image frames directly to the processing engine.
3.  **Intelligence Engine (Flask Backend)**:
    - **Vision Models**: Two custom-trained YOLOv8 models (Eye closure and Yawning).
    - **Kinetic Models**: Scikit-learn models processing Gyroscope and Accelerometer data.
4.  **Monitoring Dashboard (React)**: A "dispatch view" for real-time metric visualization.

---

## 💻 Technologies Used

### Frontend & Mobile

- **React Native**: Cross-platform mobile application.
- **React (Vite)**: High-performance web dashboard.
- **Vanilla CSS**: Custom styling for a polished, modern UI.

### Backend & Networking

- **Python (Flask)**: Primary intelligence backend.
- **WebSockets**: Real-time, bi-directional data streaming.
- **Tailscale**: Secure, low-latency networking tunnel.
- **Node.js**: WebSocket relay/server management.

### Machine Learning

- **YOLOv8 (Ultralytics)**: Custom-trained computer vision models.
- **Scikit-learn**: Kinetic models for driving pattern analysis (Random Forest/SVM).
- **Jupyter Notebooks**: ML pipelines and data preprocessing.

---

## 📈 Roadmap

- **Real-Time Fleet Connectivity**: GPS integration to see other VigilEyes users on the route.
- **Digital CB Radio**: Proximity-based voice chat to combat driver isolation.
- **Smart Rest-Stop Integration**: Automatically suggesting truck-friendly rest areas when the Risk Score rises.
- **Predictive Analytics**: Optimal break-time suggestions based on historical fatigue data.
- **Wearable Integration**: Incorporating heart rate variability (HRV) from smartwatches.

---

## 🏗️ Project Structure

```text
├── frontend/             # React-based Monitoring Dashboard
├── backend/              # Flask Server & custom YOLOv8 weights
├── sensorML/             # ML Pipelines for Accelerometer/Gyroscope
├── datasets/             # Training data and model iterations
├── assets/               # Audio alerts and app icons
└── websocketServer.js    # Real-time data relay
```

---

_Developed with ❤️ for the backbone of our society._
