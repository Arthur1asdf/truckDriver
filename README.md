# VisualEyes

Built for the miles that matter

## Motivation

Long-haul truckers are the invisible backbone of our global economy, yet they are among the most isolated workers in the world. Spending **11+ hours a day** behind the wheel and over **300 days a year** on the road, these individuals operate in a "functional vacuum" where the pressure to deliver outweighs the opportunity for self-care.

We realized that while modern logistics is obsessed with tracking the package, it rarely tracks the person.

## Tech Stack

| Layer            | Technology                     |
| ---------------- | ------------------------------ |
| Mobile           | React Native (Expo)            |
| Networking       | Tailscale                      |
| Dashboard        | React + Vite                   |
| Backend          | Python / Flask-Sock            |
| Machine Learning | YOLO, Random Forest Classifier |
| Analysis         | NumPy, Pandas                  |

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

To process this window
