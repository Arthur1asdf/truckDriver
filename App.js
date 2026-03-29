import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope, Accelerometer } from "expo-sensors";
import { useState, useEffect, useRef } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { calculateRiskScore } from "./riskScorer.js";

const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;

export default function App() {
  const facing = "front"; 
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  const [modelPrediction, setModelPrediction] = useState("N/A");
  const [accelSafety, setAccelSafety] = useState("Normal");
  const [gyroSafety, setGyroSafety] = useState("Normal");

  const isCameraReady = useRef(false);
  const isCapturing = useRef(false); 
  const cameraRef = useRef(null);
  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const isComponentMounted = useRef(true); 

  // --- Recursive Camera Loop (The "Well Implemented" Way) ---
  const streamFrames = async () => {
    if (!cameraRef.current || !isCameraReady.current || isCapturing.current || ws.current?.readyState !== WebSocket.OPEN) {
      setTimeout(streamFrames, 500);
      return;
    }

    isCapturing.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.1,
        skipProcessing: true,
        shutterSound: false,
      });
    
      // Convert Base64 to Binary ArrayBuffer
      const binaryString = atob(photo.base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }

      ws.current.send(bytes.buffer);
      setTimeout(streamFrames, 200); 
    } catch (e) {
      setTimeout(streamFrames, 1000);
    } finally {
      isCapturing.current = false;
    }
  };

  useEffect(() => {
    isComponentMounted.current = true;
    
    // --- WebSocket Connection ---
    ws.current = new WebSocket("ws://100.108.70.119:3000");

    ws.current.onopen = () => {
      console.log("WebSocket connection opened");
      streamFrames();
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "inference" && data.predictions?.length > 0) {
          const { label, confidence } = data.predictions[0];
          setModelPrediction(`${label} (${(confidence * 100).toFixed(1)}%)`);
        } else if (data.type === "accel_inference") {
          setAccelSafety(data.label);
        } else if (data.type === "gyro_inference") {
          setGyroSafety(data.label);
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.current.onclose = () => console.log('WebSocket connection closed');
    ws.current.onerror = (e) => console.error("WebSocket error:", e);

    // --- Sensor Subscriptions ---
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener((gyroData) => {
      latestGyro.current = gyroData;
      setGyroscopeData(gyroData);
      if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: "gyro", data: gyroData }));
      }
    });

    const accelSubscription = Accelerometer.addListener((accelData) => {
      latestAccel.current = accelData;
      setAccelerometerData(accelData);
      if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: "accelerometer", data: accelData }));
      }
    });

    // --- Risk Scoring Logic ---
    const processingInterval = setInterval(() => {
        sensorWindow.current.push({ gyro: latestGyro.current, accel: latestAccel.current });

      if (sensorWindow.current.length >= WINDOW_SIZE) {
        const newRiskScore = calculateRiskScore(
          sensorWindow.current,
          lastRiskScore.current,
          SENSOR_UPDATE_INTERVAL_MS / 1000,
        );
        setRiskScore(newRiskScore);
        lastRiskScore.current = newRiskScore;
        sensorWindow.current = [];
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
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
                streamFrames(); 
            }}
        >
            <View style={styles.sensorContainer}>
                <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
                <Text style={styles.riskScoreText}>Status: {modelPrediction}</Text>
                <Text style={styles.riskScoreText}>Acceleration: {accelSafety}</Text>
                <Text style={styles.riskScoreText}>Turning: {gyroSafety}</Text>
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
    position: "absolute",
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