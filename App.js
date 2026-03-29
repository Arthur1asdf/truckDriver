import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import { useState, useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { calculateRiskScore } from './riskScorer.js';

const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;

export default function App() {
  const facing = 'front'; 
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  
  // Refs for state and status
  const isCameraReady = useRef(false);
  const isCapturing = useRef(false); // Safety Lock: Prevents overlapping calls
  const cameraRef = useRef(null);
  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const isComponentMounted = useRef(true); // To stop the loop on unmount

  // --- Recursive Camera Loop (The "Well Implemented" Way) ---
  const streamFrames = async () => {
    if (
      !isComponentMounted.current || 
      !cameraRef.current || 
      !isCameraReady.current || 
      isCapturing.current || 
      ws.current?.readyState !== WebSocket.OPEN
    ) {
      // If not ready, check again in 1 second
      setTimeout(streamFrames, 1000);
      return;
    }
  
    isCapturing.current = true;
  
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.1,         // Keep this low!
        skipProcessing: true, 
        shutterSound: false,  // Disabling sound can speed up hardware reset
      });
  
      ws.current.send(JSON.stringify({
        type: 'camera',
        data: photo.base64,
        timestamp: Date.now(),
      }));
  
      // SUCCESS: Wait 100ms before starting the next one
      setTimeout(streamFrames, 100); 
  
    } catch (error) {
      console.log("Hardware busy, backing off...");
      // ERROR: Wait longer (500ms) before retrying to let the hardware reset
      setTimeout(streamFrames, 500);
    } finally {
      isCapturing.current = false;
    }
  };

  useEffect(() => {
    isComponentMounted.current = true;
    console.log('Setting up App...');

    // --- WebSocket Connection ---
    ws.current = new WebSocket('ws://100.108.70.119:3000');

    ws.current.onopen = () => {
      console.log('WebSocket connection opened');
      streamFrames(); // Start the camera loop once socket is open
    };

    ws.current.onerror = (e) => console.error('WebSocket error:', e);
    ws.current.onclose = () => console.log('WebSocket connection closed');

    // --- Sensor Subscriptions ---
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener(gyroData => {
      latestGyro.current = gyroData;
      setGyroscopeData(gyroData);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'gyro', data: gyroData }));
      }
    });

    const accelSubscription = Accelerometer.addListener(accelData => {
      latestAccel.current = accelData;
      setAccelerometerData(accelData);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'accelerometer', data: accelData }));
      }
    });

    // --- Risk Scoring Logic ---
    const processingInterval = setInterval(() => {
      sensorWindow.current.push({
        gyro: latestGyro.current,
        accel: latestAccel.current,
      });

      if (sensorWindow.current.length >= WINDOW_SIZE) {
        const newRiskScore = calculateRiskScore(sensorWindow.current, lastRiskScore.current, SENSOR_UPDATE_INTERVAL_MS / 1000);
        setRiskScore(newRiskScore);
        lastRiskScore.current = newRiskScore;
        sensorWindow.current = [];
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
      console.log('Cleaning up...');
      isComponentMounted.current = false;
      if (ws.current) ws.current.close();
      gyroSubscription.remove();
      accelSubscription.remove();
      clearInterval(processingInterval);
    };
  }, []);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need camera permission</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={facing}
        ref={cameraRef}
        onCameraReady={() => { 
          isCameraReady.current = true;
          streamFrames(); // Try starting loop if camera becomes ready after WS
        }}
      >
        <View style={styles.sensorContainer}>
          <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
          <Text style={styles.sensorText}>Gyroscope (x,y,z):</Text>
          <Text style={styles.sensorSubText}>
            {gyroscopeData.x.toFixed(2)}, {gyroscopeData.y.toFixed(2)}, {gyroscopeData.z.toFixed(2)}
          </Text>
          <Text style={styles.sensorText}>Accelerometer (x,y,z):</Text>
          <Text style={styles.sensorSubText}>
            {accelerometerData.x.toFixed(2)}, {accelerometerData.y.toFixed(2)}, {accelerometerData.z.toFixed(2)}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  message: { textAlign: 'center', color: 'white' },
  camera: { flex: 1 },
  sensorContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 10,
  },
  sensorText: { color: '#aaa', fontSize: 10, marginTop: 5 },
  sensorSubText: { color: 'white', fontSize: 12 },
  riskScoreText: { color: '#00ff00', fontSize: 22, fontWeight: 'bold' },
});