import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope, Accelerometer } from "expo-sensors";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  AppState,
  Button,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  View,
} from "react-native";
import { calculateRiskScore } from "./riskScorer.js";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, G } from "react-native-svg";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const DEVMODE = true;
const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;
const CAMERA_FRAME_INTERVAL_MS = 200; // 5 FPS prevents overwhelming the phone's storage I/O

const { width } = Dimensions.get("window");
const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function App() {
  return (
    <SafeAreaProvider>
      <DrivingUI />
    </SafeAreaProvider>
  );
}

const DrivingUI = () => {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // --- UI & GEOMETRY SETUP ---
  const size = width * 0.85;
  const strokeWidth = 35;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = Math.PI * radius;

  // --- STATE ---
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  const [modelPrediction, setModelPrediction] = useState("N/A");
  const [drowsinessRisk, setDrowsinessRisk] = useState(0);
  const [isFocused, setIsFocused] = useState(true); // Track if app is in foreground
  const [accelSafety, setAccelSafety] = useState("Normal");
  const [gyroSafety, setGyroSafety] = useState("Normal");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [displayValue, setDisplayValue] = useState(0);

  // --- REFS ---
  const isCameraReady = useRef(false);
  const isCapturing = useRef(false); 
  const cameraRef = useRef(null);
  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const predictionHistory = useRef([]);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const isComponentMounted = useRef(true); 
  const currentDrowsinessRisk = useRef(0); // Ref to access latest drowsiness inside intervals
  const consecutiveSleepCount = useRef(0); // Track consecutive drowsy frames
  
  // ADDED: Missing reference to fix the Property 'cameraFrameIntervalRef' doesn't exist error
  const cameraFrameIntervalRef = useRef(null);

  // --- Recursive Camera Loop ---
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

  // --- ANIMATION ---
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: riskScore,
      duration: 600, 
      useNativeDriver: true,
    }).start();
  }, [riskScore]);

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.floor(value));
    });
    return () => animatedValue.removeListener(listenerId);
  }, []);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  const theme = {
    background: isDarkMode ? "rgba(18,18,18,0.85)" : "rgba(245,245,245,0.85)", // Semi-transparent overlay to let camera peek through
    text: isDarkMode ? "#FFFFFF" : "#000000",
    dialBg: isDarkMode ? "#333333" : "#E0E0E0",
    accent: "#FF3B30",
  };

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      setIsFocused(nextAppState === 'active');
    });

    isComponentMounted.current = true;
    console.log('useEffect running, setting up WebSocket.');
    // Replace 'YOUR_TAILSCALE_IP' with the actual Tailscale IP of your backend laptop.
    ws.current = new WebSocket('ws://100.108.70.119:3000');
    console.log('WebSocket created for:', ws.current.url);

    ws.current.onopen = () => {
      console.log("WebSocket connection opened");
      streamFrames();
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'inference') {
          let currentLabel = 'none';
          if (data.predictions?.length > 0) {
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
        } else if (data.type === "accel_inference") {
          setAccelSafety(data.label);
        } else if (data.type === "gyro_inference") {
          setGyroSafety(data.label);
        }
      } catch (e) {
        console.error(e);
      }
    };

    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener((data) => {
      latestGyro.current = data;
      setGyroscopeData(data);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "gyro", data }));
      }
    });

    const accelSubscription = Accelerometer.addListener((data) => {
      latestAccel.current = data;
      setAccelerometerData(data);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "accelerometer", data }));
      }
    });

    cameraFrameIntervalRef.current = setInterval(async () => {
      if (isCapturing.current) return; // Prevent overwhelming the camera if it's still capturing the last frame

      if (cameraRef.current && isCameraReady.current && ws.current?.readyState === WebSocket.OPEN) {
        isCapturing.current = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.6, shutterSound: false, skipProcessing: true}); // Bump quality so YOLO can clearly see the mouth
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
      isComponentMounted.current = false;
      if (ws.current) ws.current.close();
      gyroSubscription.remove();
      accelSubscription.remove();
      appStateSubscription.remove();
      clearInterval(processingInterval);
      if (cameraFrameIntervalRef.current)
        clearInterval(cameraFrameIntervalRef.current);
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
    <View style={styles.screen}>
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="front" // Always use the front camera
          ref={cameraRef}
          onCameraReady={() => { isCameraReady.current = true; }}
        />
      )}

      <View
        style={[
          styles.mainContent,
          { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {DEVMODE && (
          <View style={styles.sensorContainer}>
            <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
            <Text style={styles.riskScoreText}>Drowsiness Risk: {drowsinessRisk}</Text>
            <Text style={styles.sensorText}>Status: {modelPrediction}</Text>
            <Text style={styles.sensorText}>
              Accel: {accelSafety} | Gyro: {gyroSafety}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => setIsDarkMode(!isDarkMode)}
          style={styles.themeToggle}
        >
          <Ionicons
            name={isDarkMode ? "moon" : "sunny"}
            size={36}
            color={theme.text}
          />
        </TouchableOpacity>

        <View style={styles.dialContainer}>
          {/* Fixed height to crop bottom half of SVG */}
          <View style={{ width: size, height: center, overflow: "hidden" }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {/* Added rotation and origin to flip from smile to arch */}
              <G>
                <Path
                  d={`M ${strokeWidth / 2},${center} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${center}`}
                  stroke={theme.dialBg}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                />
                <AnimatedPath
                  d={`M ${strokeWidth / 2},${center} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${center}`}
                  stroke={theme.accent}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${circumference}, ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </G>
            </Svg>

            <View style={[styles.overlay, { bottom: 0 }]}>
              <Text style={[styles.valueText, { color: theme.text }]}>
                {displayValue}
              </Text>
              <Text style={[styles.label, { color: theme.text }]}>RISK %</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  message: { textAlign: "center", paddingBottom: 10 },
  sensorContainer: {
    position: "absolute",
    top: 60,
    left: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 10,
    padding: 12,
    zIndex: 50,
  },
  sensorText: { color: "white", fontSize: 12, opacity: 0.8 },
  riskScoreText: { color: "white", fontSize: 18, fontWeight: "bold" },
  mainContent: { flex: 1 },
  themeToggle: { alignSelf: "flex-end", padding: 20 },
  dialContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: { position: "absolute", width: "100%", alignItems: "center" },
  valueText: {
    fontSize: 100,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  label: { fontSize: 18, fontWeight: "bold", opacity: 0.5, marginTop: -10 },
});