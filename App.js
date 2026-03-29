import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import { useState, useEffect, useRef } from 'react';
import { AppState, Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { calculateRiskScore } from './riskScorer.js';

const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;
const CAMERA_FRAME_INTERVAL_MS = 200; // 5 FPS prevents overwhelming the phone's storage I/O

export default function App() {
  const facing = 'front'; // Always use the front camera
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  const [modelPrediction, setModelPrediction] = useState('N/A');
  const [drowsinessRisk, setDrowsinessRisk] = useState(0);
  const [isFocused, setIsFocused] = useState(true); // Track if app is in foreground
  const isCameraReady = useRef(false);
  const cameraRef = useRef(null);
  const isCapturing = useRef(false); // Lock to prevent concurrent captures
  const currentDrowsinessRisk = useRef(0); // Ref to access latest drowsiness inside intervals
  const consecutiveSleepCount = useRef(0); // Track consecutive drowsy frames

  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const predictionHistory = useRef([]);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const cameraFrameIntervalRef = useRef(null);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      setIsFocused(nextAppState === 'active');
    });

    console.log('useEffect running, setting up WebSocket.');
    // --- WebSocket Connection ---
    // Replace 'YOUR_TAILSCALE_IP' with the actual Tailscale IP of your backend laptop.
    // THIS MUST BE CHANGED FOR EACH IP ADDRESS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    ws.current = new WebSocket('ws://100.69.148.51:3000');
    console.log('WebSocket created for:', ws.current.url);

    ws.current.onopen = () => {
      console.log('WebSocket connection opened');
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'inference') {
          let currentLabel = 'none';
          if (data.predictions.length > 0) {
            const { label, confidence } = data.predictions[0];
            setModelPrediction(`${label} (${(confidence * 100).toFixed(1)}%)`);
            currentLabel = String(label).toLowerCase().trim(); // Force lowercase for reliable matching
          } else {
            setModelPrediction('No detection');
          }

          // --- Consecutive Drowsiness Logic ---
          const isDrowsyFrame = currentLabel.includes('sleep') || currentLabel.includes('yawn') || currentLabel === 'none' || currentLabel === '1' || currentLabel === '2';
          if (isDrowsyFrame) {
            consecutiveSleepCount.current += 1;
          } else {
            consecutiveSleepCount.current = 0; // Reset if eyes are open or not detected
          }

          // --- Ratio-based Drowsiness Logic (Micro-sleeps) ---
          predictionHistory.current.push(currentLabel);
          if (predictionHistory.current.length > 75) { // Store last 15 seconds of frames at 5fps
            predictionHistory.current.shift();
          }

          // Quadratically weight recent frames so risk drops off much faster when awake
          let sleepyWeight = 0;
          let totalWeight = 0;
          predictionHistory.current.forEach((l, index) => {
            const weight = Math.pow(index + 1, 2); // Oldest frame = 1, Newest = 5625
            if (l.includes('sleep') || l.includes('yawn') || l === 'none' || l === '1' || l === '2') {
              sleepyWeight += weight;
              totalWeight += weight;
            } else if (l.includes('active') || l === '0') {
              totalWeight += weight;
            }
          });
          
          const ratio = totalWeight > 0 ? sleepyWeight / totalWeight : 0;
          
          // Slightly smoother curve (power of 0.7) so it doesn't spike too aggressively on low ratios
          const ratioRisk = Math.round(Math.pow(ratio, 0.7) * 100);

          // --- Consecutive Risk Penalty ---
          // Trigger earlier (2 frames / 400ms) to aggressively catch micro-sleeps.
          let consecutiveRisk = 0;
          if (consecutiveSleepCount.current >= 2) {
            // Rises slightly less exponentially: 2 frames = 36, 3 frames = 69, 4+ frames = 100
            consecutiveRisk = Math.min(100, Math.round(12 * Math.pow(consecutiveSleepCount.current, 1.6)));
          }

          // The final risk is the HIGHER of the two methods.
          const finalRisk = Math.max(ratioRisk, consecutiveRisk);
          
          setDrowsinessRisk(finalRisk);
          currentDrowsinessRisk.current = finalRisk;
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket connection closed');
    };

    ws.current.onerror = (e) => {
      console.error('WebSocket error:', e);
    };

    // --- Sensor Subscriptions ---
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener(gyroData => {
      latestGyro.current = gyroData;
      setGyroscopeData(gyroData);
      // Send gyroscope data over WebSocket
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'gyro', data: gyroData }));
      }
    });

    const accelSubscription = Accelerometer.addListener(accelData => {
      latestAccel.current = accelData;
      setAccelerometerData(accelData);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'accelerometer', data: accelData }));
      }
    });

    // --- Camera Frame Capture ---
    cameraFrameIntervalRef.current = setInterval(async () => {
      if (isCapturing.current) return; // Prevent overwhelming the camera if it's still capturing the last frame

      if (cameraRef.current && isCameraReady.current && ws.current?.readyState === WebSocket.OPEN) {
        isCapturing.current = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.6 }); // Bump quality so YOLO can clearly see the mouth
          const response = await fetch(photo.uri);
          const buffer = await response.arrayBuffer();
          ws.current.send(buffer); // Send pure ArrayBuffer to avoid JSON stringification of RN Blobs
        } catch (error) {
          // Suppress the initial "camera not ready" error that happens on app startup
        } finally {
          isCapturing.current = false;
        }
      }
    }, CAMERA_FRAME_INTERVAL_MS);

    const processingInterval = setInterval(() => {
      sensorWindow.current.push({
        gyro: latestGyro.current,
        accel: latestAccel.current,
      });

      // Keep the window at the correct size (sliding window)
      if (sensorWindow.current.length > WINDOW_SIZE) {
        sensorWindow.current.shift();
      }

      if (sensorWindow.current.length === WINDOW_SIZE) {
        const newRiskScore = calculateRiskScore(sensorWindow.current, lastRiskScore.current, currentDrowsinessRisk.current, SENSOR_UPDATE_INTERVAL_MS / 1000);
        setRiskScore(newRiskScore);
        lastRiskScore.current = newRiskScore;
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
      console.log('Cleaning up: closing WebSocket and removing listeners.');
      if (ws.current) {
        ws.current.close();
      }
      gyroSubscription.remove();
      accelSubscription.remove();
      appStateSubscription.remove();
      clearInterval(processingInterval);
    };
  }, []);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          style={styles.camera}
          facing={facing} // Always use the front camera
          ref={cameraRef}
          onCameraReady={() => { isCameraReady.current = true; }}
        >
          <View style={styles.sensorContainer}>
            <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
            <Text style={styles.riskScoreText}>Drowsiness Risk: {drowsinessRisk}</Text>
            <Text style={styles.riskScoreText}>Status: {modelPrediction}</Text>
            <Text style={styles.sensorText}>Gyroscope:</Text>
            <Text style={styles.sensorText}>
              x: {gyroscopeData.x.toFixed(2)}
            </Text>
            <Text style={styles.sensorText}>
              y: {gyroscopeData.y.toFixed(2)}
            </Text>
            <Text style={styles.sensorText}>
              z: {gyroscopeData.z.toFixed(2)}
            </Text>
            <Text style={styles.sensorText}>Accelerometer:</Text>
            <Text style={styles.sensorText}>
              x: {accelerometerData.x.toFixed(2)}
            </Text>
            <Text style={styles.sensorText}>
              y: {accelerometerData.y.toFixed(2)}
            </Text>
            <Text style={styles.sensorText}>
              z: {accelerometerData.z.toFixed(2)}
            </Text>
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  sensorContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 5,
    padding: 5,
  },
  sensorText: {
    color: 'white',
    fontSize: 12,
  },
  riskScoreText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
