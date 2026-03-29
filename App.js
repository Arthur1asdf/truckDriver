import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope, Accelerometer } from "expo-sensors";
import { useState, useEffect, useRef } from "react";
import {
  Button,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
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
const CAMERA_FRAME_INTERVAL_MS = 1000; // Send frame every 500ms

export default function App() {
  return (
    <SafeAreaProvider>
      <DrivingUI />
    </SafeAreaProvider>
  );
}

const DrivingUI = () => {
  const insets = useSafeAreaInsets();
  const facing = "front"; // Always use the front camera
  const [permission, requestPermission] = useCameraPermissions();
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
  const isCameraReady = useRef(false);
  const cameraRef = useRef(null);

  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });
  const ws = useRef(null);
  const cameraFrameIntervalRef = useRef(null);

  // UI Features
  const [isDarkMode, setIsDarkMode] = useState(true);
  const { width } = Dimensions.get("window");

  const theme = {
    background: isDarkMode ? "#121212" : "#F5F5F5",
    text: isDarkMode ? "#FFFFFF" : "#000000",
    dialBg: isDarkMode ? "#333333" : "#E0E0E0",
    accent: "#FF3B30", // High-visibility Red
  };

  const size = width * 0.85;
  const strokeWidth = 35;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = Math.PI * radius;
  const progressOffset = circumference - (riskScore / 100) * circumference;

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  useEffect(() => {
    console.log("useEffect running, setting up WebSocket.");
    // --- WebSocket Connection ---
    // Replace 'YOUR_TAILSCALE_IP' with the actual Tailscale IP of your backend laptop.
    // THIS MUST BE CHANGED FOR EACH IP ADDRESS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    ws.current = new WebSocket("ws://100.118.89.67:3000");
    console.log("WebSocket created for:", ws.current.url);

    ws.current.onopen = () => {
      console.log("WebSocket connection opened");
    };

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
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket connection closed");
    };

    ws.current.onerror = (e) => {
      console.error("WebSocket error:", e);
    };

    // --- Sensor Subscriptions ---
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener((gyroData) => {
      latestGyro.current = gyroData;
      setGyroscopeData(gyroData);
      // Send gyroscope data over WebSocket
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "gyro", data: gyroData }));
      }
    });

    const accelSubscription = Accelerometer.addListener((accelData) => {
      latestAccel.current = accelData;
      setAccelerometerData(accelData);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({ type: "accelerometer", data: accelData }),
        );
      }
    });

    // --- Camera Frame Capture ---
    cameraFrameIntervalRef.current = setInterval(async () => {
      if (
        cameraRef.current &&
        isCameraReady.current &&
        ws.current?.readyState === WebSocket.OPEN
      ) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            base64: false,
            quality: 0.3,
          }); // Compress to avoid choking the WebSocket
          const response = await fetch(photo.uri);
          const buffer = await response.arrayBuffer();
          ws.current.send(buffer); // Send pure ArrayBuffer to avoid JSON stringification of RN Blobs
        } catch (error) {
          console.error("Error capturing camera frame:", error);
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
        sensorWindow.current = []; // Reset for the next window
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
      console.log("Cleaning up: closing WebSocket and removing listeners.");
      if (ws.current) {
        ws.current.close();
      }
      gyroSubscription.remove();
      accelSubscription.remove();
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
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* <CameraView
        style={styles.camera}
        facing={facing} // Always use the front camera
        ref={cameraRef}
        onCameraReady={() => {
          isCameraReady.current = true;
        }}
      /> */}
      {DEVMODE && (
        <View style={styles.sensorContainer}>
          <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
          <Text style={styles.riskScoreText}>Status: {modelPrediction}</Text>
          <Text style={styles.riskScoreText}>Acceleration: {accelSafety}</Text>
          <Text style={styles.riskScoreText}>Turning: {gyroSafety}</Text>
          <Text style={styles.sensorText}>Gyroscope:</Text>
          <Text style={styles.sensorText}>x: {gyroscopeData.x.toFixed(2)}</Text>
          <Text style={styles.sensorText}>y: {gyroscopeData.y.toFixed(2)}</Text>
          <Text style={styles.sensorText}>z: {gyroscopeData.z.toFixed(2)}</Text>
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
      )}

      <View
        style={[
          styles.screen,
          {
            backgroundColor: theme.background,
            // Using insets directly to prevent overlap with Notch/Dynamic Island
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
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
          <View style={{ width: size, height: center + strokeWidth }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <G>
                <Path
                  d={`M ${strokeWidth / 2},${center} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${center}`}
                  stroke={theme.dialBg}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                />
                <Path
                  d={`M ${strokeWidth / 2},${center} A ${radius},${radius} 0 0,1 ${size - strokeWidth / 2},${center}`}
                  stroke={theme.accent}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${circumference}, ${circumference}`}
                  strokeDashoffset={progressOffset}
                  strokeLinecap="round"
                />
              </G>
            </Svg>

            <View style={[styles.overlay, { top: center * 0.4 }]}>
              <Text style={[styles.valueText, { color: theme.text }]}>
                {riskScore}
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
  message: {
    textAlign: "center",
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  sensorContainer: {
    position: "absolute",
    top: 50,
    left: 10,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 5,
    padding: 5,
    zIndex: 50,
  },
  sensorText: {
    color: "white",
    fontSize: 12,
  },
  riskScoreText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  container: {
    flex: 1,
    transition: "background-color 0.3s ease",
  },
  iconButton: {
    alignSelf: "flex-end",
    padding: 20,
    marginTop: 10,
  },
  mainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  textOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  labelSuffix: {
    fontSize: 18,
    fontWeight: "600",
    opacity: 0.7,
    marginTop: -10,
  },
  screen: {
    flex: 1,
  },
  themeToggle: {
    alignSelf: "flex-end",
    padding: 20,
  },
  dialContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    position: "absolute",
    width: "100%",
    alignItems: "center",
  },
  valueText: {
    fontSize: 110,
    fontWeight: "900",
    fontVariant: ["tabular-nums"], // Prevents jittering if the number changes
  },
  label: {
    fontSize: 20,
    fontWeight: "bold",
    opacity: 0.5,
    marginTop: -10,
  },
});
