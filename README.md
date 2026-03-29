# VisualEyes

Built for the miles that matter

## Motivation

Long-haul truckers are the invisible backbone of our global economy, yet they are among the most isolated workers in the world. Spending **11+ hours a day** behind the wheel and over **300 days a year** on the road, these individuals operate in a "functional vacuum" where the pressure to deliver outweighs the opportunity for self-care.

We realized that while modern logistics is obsessed with tracking the package, it rarely tracks the person.

## Key Features

### Dynamic Risk Score (0–100)

The core of VigilEyes evaluates driver behavior in real-time:

- **0–59 (Safe/Alert)**: Focused driving with normal physiological signs.
- **60+ (At Risk)**: Early signs of fatigue detected. Triggers active engagement alerts.
- **80–100 (Critical)**: Immediate intervention required to prevent a potential accident.

### Fatigue Detection

Monitors the driver’s face via real-time computer vision to detect:

- **Micro-sleeps**: Eyes closed for an extended duration.
- **Yawning**: Frequent yawning patterns associated with exhaustion.

### Driving Pattern Analysis

Tracks vehicle movement through high-precision telemetry:

- **Erratic Swerving**: Identifying lane drifting.
- **Jerky Braking**: Detecting sudden, reactive stops common in tired drivers.

### Intelligent Sensor Fusion

Combines visual cues (60% weight) with vehicle motion data (40% weight) to create a high-fidelity safety profile, distinguishing between a bump in the road and a dangerous loss of focus.

## Tech Stack

| Layer            | Technology                       |
| ---------------- | -------------------------------- |
| Mobile           | React Native (Expo)              |
| Networking       | Tailscale                        |
| Dashboard        | React + Vite                     |
| Backend          | Python / Flask-Sock              |
| Machine Learning | YOLOv8, Random Forest Classifier |
| Analysis         | NumPy, Pandas                    |

## System Architecture

1. **Edge Collection**: The React Native app samples high-frequency accelerometer and gyroscope data. The app also takes base64 encoded captures of the inward facing camera.
2. **Secure Tunnel**: Data is streamed through a Tailscale private network to ensure that driver data does not pass through public internet and to bypass complex firewall issues associated with developing on mobile devices
3. **Inference Engine**
   1. A Flask backend buffers the accelerometer and gyroscope data into 2 50-sample buffers. Once the buffer is filled, the data is passed to its respective Random Forest Classifier model to identify sudden movements.
   2. This backend also recieves the base64 encoded images which are processed through our trained YOLOv8 model to classify the drivers face as sleepy, yawning, or normal
   3. Once this information is captured, it is returned across the websocket to the master dashboard and the user's mobile device
4. **Master Dashboard**: This dashboard contains a stream of the user and keeps track of incoming acceleometer and gyroscope data. The predictions created by our ML models are also displayed here.
5. **Active Intervention**: Based on the classifications returned by the backend, a Risk Score is calculated on both the dashboard using the same equation. Depending on the value of this Risk Score (0 - 100), an alarm or vocal alert will sound to warn the driver.

## Machine Learning Implementation

### Random Forest Classifier

We utilized a **Random Forest Classifer** that we optomized for temporal data. Instead of analyzing individual raw, noisy points, our system processes a sliding window of samples to fully capture driving behavior.

To process this window, we converted raw data into magnitude, jerk, and spectral dispertion to eliminate noise.

Classification Logic:

- Class 0 (Normal): Smooth, predicatble movement
- Class 1 (Dangerous): High-G maneuvers

### YOLOv8 Face Classifier

We trained a YOLOv8 model on a combined dataset of binary normal and sleepy pictures and binary yawning and normal pictures. This combined dataset produced a multi-class model that could identify a sleeping driver and signs of drowsiness.

Classification Logic:

- Class 0 (Normal): Alert
- Class 1 (Drowsiness): Individual is yawning
- Class 2 (Asleep): Individual's eyes are closed

## Project Structure

```text
├── frontend/             # React-based Monitoring Dashboard
├── backend/              # Flask Server & custom YOLOv8 weights
├── datasets/             # Training data and model iterations for YOLOv8
├── sensorML/             # ML Pipelines for Accelerometer/Gyroscope
|──├── datasets/             # Training data and model iterations
├── assets/               # Audio alerts and app icons
└── websocketServer.js    # Real-time data relay
```

## How To Run

To run this application, you must create a tailScale account and connect the computer and phone to the same network over the same IP.

1. **Backend**

```bash
# Install dependencies
pip install -r requirements.txt
cd backend
# Run backend
python app.py
```

2. **Mobile**

```bash
# Install dependencies
npm install
# Run mobile app
npx expo start
```

To create the Random Forest Classifier models used for this project, you can follow the jupyter notebooks within the [sensorML directory](https://github.com/Arthur1asdf/truckDriver/tree/main/sensorML).

To create the YOLOv8 model, utilize the scripts within the [dataset directory](https://github.com/Arthur1asdf/truckDriver/tree/main/datasets).

## Datasets

To train and test the RFC models, we sourced accelerometer and gyroscope data from this [Dataset](https://data.mendeley.com/datasets/9vr83n7z5j/2).

## Roadmap

- **Real-Time Fleet Connectivity**: GPS integration to see other VigilEyes users on the route.
- **Digital CB Radio**: Proximity-based voice chat to combat driver isolation.
- **Smart Rest-Stop Integration**: Automatically suggesting truck-friendly rest areas when the Risk Score rises.
- **Predictive Analytics**: Optimal break-time suggestions based on historical fatigue data.
- **Wearable Integration**: Incorporating heart rate variability (HRV) from smartwatches.

## Team

- **Natalia Cano**
- **Bowen Groff**
- **Arthur Teng**
- **Tai Williams**
