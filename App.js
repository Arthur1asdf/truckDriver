import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope, Accelerometer } from "expo-sensors";
import { useState, useEffect, useRef, useMemo } from "react";
import {
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
const WINDOW_SIZE =
  (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;
const CAMERA_FRAME_INTERVAL_MS = 1000;

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

  // --- UI & GEOMETRY SETUP (Moved up to prevent 'undefined' crashes) ---
  const size = width * 0.85;
  const strokeWidth = 35;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = Math.PI * radius;

  // --- STATE ---
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({
    x: 0,
    y: 0,
    z: 0,
  });
  const [riskScore, setRiskScore] = useState(0);
  const [modelPrediction, setModelPrediction] = useState("N/A");
  const [accelSafety, setAccelSafety] = useState("Normal");
  const [gyroSafety, setGyroSafety] = useState("Normal");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [displayValue, setDisplayValue] = useState(0);

  // --- REFS ---
  const isCameraReady = useRef(false);
  const cameraRef = useRef(null);
  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const cameraFrameIntervalRef = useRef(null);

  // --- ANIMATION ---
  const animatedValue = useRef(new Animated.Value(0)).current;

  // Update animation when riskScore changes
  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: riskScore,
      duration: 600, // Slightly longer for smoother transitions in driving
      useNativeDriver: true,
    }).start();
  }, [riskScore]);

  // Listener for text display (Runs once)
  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.floor(value));
    });
    return () => animatedValue.removeListener(listenerId);
  }, []);

  // Map animated value to SVG stroke
  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  const theme = {
    background: isDarkMode ? "#121212" : "#F5F5F5",
    text: isDarkMode ? "#FFFFFF" : "#000000",
    dialBg: isDarkMode ? "#333333" : "#E0E0E0",
    accent: "#FF3B30",
  };

  // --- BACKEND LOGIC (Left untouched as requested) ---
  useEffect(() => {
    ws.current = new WebSocket("ws://100.118.89.67:3000");

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "inference" && data.predictions.length > 0) {
          const { label, confidence } = data.predictions[0];
          setModelPrediction(`${label} (${(confidence * 100).toFixed(1)}%)`);
        } else if (data.type === "inference") {
          setModelPrediction("No detection");
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
      if (
        cameraRef.current &&
        isCameraReady.current &&
        ws.current?.readyState === WebSocket.OPEN
      ) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.3,
          });
          const response = await fetch(photo.uri);
          const buffer = await response.arrayBuffer();
          ws.current.send(buffer);
        } catch (e) {
          console.error(e);
        }
      }
    }, CAMERA_FRAME_INTERVAL_MS);

    const processingInterval = setInterval(() => {
      sensorWindow.current.push({
        gyro: latestGyro.current,
        accel: latestAccel.current,
      });
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
      if (ws.current) ws.current.close();
      gyroSubscription.remove();
      accelSubscription.remove();
      clearInterval(processingInterval);
      if (cameraFrameIntervalRef.current)
        clearInterval(cameraFrameIntervalRef.current);
    };
  }, []);

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {DEVMODE && (
        <View style={styles.sensorContainer}>
          <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
          <Text style={styles.sensorText}>Status: {modelPrediction}</Text>
          <Text style={styles.sensorText}>
            Accel: {accelSafety} | Gyro: {gyroSafety}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.mainContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
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
