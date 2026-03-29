import { CameraView, useCameraPermissions } from "expo-camera";
import { Gyroscope, Accelerometer } from "expo-sensors";
import { useState, useEffect, useRef } from "react";
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
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { Audio, useAudioPlayer } from "expo-audio";

const DEVMODE = true;
const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;
const CAMERA_FRAME_INTERVAL_MS = 100; 

const { width } = Dimensions.get("window");
const AnimatedPath = Animated.createAnimatedComponent(Path);

const alertSource = DEVMODE
  ? require("./assets/fah.mp3")
  : require("./assets/iphoneAlert.mp3");

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

  const size = width * 0.85;
  const strokeWidth = 35;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = Math.PI * radius;

  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  const [modelPrediction, setModelPrediction] = useState("N/A");
  const [drowsinessRisk, setDrowsinessRisk] = useState(0);
  const [isFocused, setIsFocused] = useState(true); 
  const [accelSafety, setAccelSafety] = useState("Normal");
  const [gyroSafety, setGyroSafety] = useState("Normal");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [displayValue, setDisplayValue] = useState(0);

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
  const currentDrowsinessRisk = useRef(0); 
  const consecutiveSleepCount = useRef(0); 
  const cameraFrameIntervalRef = useRef(null);
  const lastAlertTime = useRef(0);

  // Keep track of latest statuses for the dashboard telemetry payload
  const currentPredictionRef = useRef("N/A");
  const currentAccelSafetyRef = useRef("Normal");
  const currentGyroSafetyRef = useRef("Normal");

  const streamFrames = async () => {
    if (!cameraRef.current || ws.current?.readyState !== WebSocket.OPEN) {
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
      setTimeout(streamFrames, 100); 
    } catch (e) {
      setTimeout(streamFrames, 1000);
    } finally {
      isCapturing.current = false;
    }
  };

  const animatedValue = useRef(new Animated.Value(0)).current;
  const alertPlayer = useAudioPlayer(alertSource);

  useEffect(() => {
    const now = Date.now();

    Animated.timing(animatedValue, {
      toValue: riskScore,
      duration: 600, 
      useNativeDriver: true,
    }).start();

    if (riskScore > 80) {
      if (now - lastAlertTime.current > 3000) {
        speakAlert("HIGH RISK DETECTED! WAKE UP!");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        lastAlertTime.current = now; 
      }
    } else if (riskScore > 70) {
      if (now - lastAlertTime.current > 5000) {
        alertPlayer.play();
        lastAlertTime.current = now;
      }
    }
  }, [riskScore]);

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.floor(value));
    });

    const setupAudio = async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1, 
        allowsRecordingIOS: true, 
        staysActiveInBackground: true,
      });
    };

    setupAudio();
    return () => animatedValue.removeListener(listenerId);
  }, []);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  const speakAlert = (message) => {
    Speech.isSpeakingAsync().then((speaking) => {
      if (!speaking) {
        Speech.speak(message, {
          language: "en-US",
          pitch: 1.0,
          rate: 1.1, 
          volume: 1.0,
        });
      }
    });
  };

  const theme = {
    background: isDarkMode ? "rgba(18,18,18,0.85)" : "rgba(245,245,245,0.85)", 
    text: isDarkMode ? "#FFFFFF" : "#000000",
    dialBg: isDarkMode ? "#333333" : "#E0E0E0",
    accent: "#00BFFF", // Switched to skyblue accent
  };

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      setIsFocused(nextAppState === 'active');
    });

    isComponentMounted.current = true;
    ws.current = new WebSocket('ws://100.108.70.119:3000');

    ws.current.onopen = () => {
      streamFrames();
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'inference') {
          let currentLabel = 'none';
          if (data.predictions?.length > 0) {
            const { label, confidence } = data.predictions[0];
            const predText = `${label} (${(confidence * 100).toFixed(1)}%)`;
            setModelPrediction(predText);
            currentPredictionRef.current = predText;
            currentLabel = String(label).toLowerCase().trim(); 
          } else {
            setModelPrediction('No detection');
            currentPredictionRef.current = 'No detection';
          }

          const isDrowsyFrame = currentLabel.includes('sleep') || currentLabel.includes('yawn') || currentLabel === 'none' || currentLabel === '1' || currentLabel === '2';
          if (isDrowsyFrame) {
            consecutiveSleepCount.current += 1;
          } else {
            consecutiveSleepCount.current = 0; 
          }

          predictionHistory.current.push(currentLabel);
          if (predictionHistory.current.length > 75) { 
            predictionHistory.current.shift();
          }

          let sleepyWeight = 0;
          let totalWeight = 0;
          predictionHistory.current.forEach((l, index) => {
            const weight = Math.pow(index + 1, 2); 
            if (l.includes('sleep') || l.includes('yawn') || l === 'none' || l === '1' || l === '2') {
              sleepyWeight += weight;
              totalWeight += weight;
            } else if (l.includes('active') || l === '0') {
              totalWeight += weight;
            }
          });
          
          const ratio = totalWeight > 0 ? sleepyWeight / totalWeight : 0;
          const ratioRisk = Math.round(Math.pow(ratio, 0.7) * 100);

          let consecutiveRisk = 0;
          if (consecutiveSleepCount.current >= 2) {
            consecutiveRisk = Math.min(100, Math.round(12 * Math.pow(consecutiveSleepCount.current, 1.6)));
          }

          const finalRisk = Math.max(ratioRisk, consecutiveRisk);
          setDrowsinessRisk(finalRisk);
          currentDrowsinessRisk.current = finalRisk;

        } else if (data.type === "accel_inference") {
          setAccelSafety(data.label);
          currentAccelSafetyRef.current = data.label;
        } else if (data.type === "gyro_inference") {
          setGyroSafety(data.label);
          currentGyroSafetyRef.current = data.label;
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
      if (isCapturing.current) return; 

      if (cameraRef.current && isCameraReady.current && ws.current?.readyState === WebSocket.OPEN) {
        isCapturing.current = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.3, shutterSound: false, skipProcessing: true});
          const response = await fetch(photo.uri);
          const buffer = await response.arrayBuffer();
          ws.current.send(buffer); 
        } catch (error) {
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

      if (sensorWindow.current.length > WINDOW_SIZE) {
        sensorWindow.current.shift();
      }

      if (sensorWindow.current.length === WINDOW_SIZE) {
        const newRiskScore = calculateRiskScore(sensorWindow.current, lastRiskScore.current, currentDrowsinessRisk.current, SENSOR_UPDATE_INTERVAL_MS / 1000);
        setRiskScore(newRiskScore);
        lastRiskScore.current = newRiskScore;

        // **NEW: Broadcast Telemetry to the Backend/Dashboard**
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: "telemetry",
            data: {
              riskScore: newRiskScore,
              drowsinessRisk: currentDrowsinessRisk.current,
              prediction: currentPredictionRef.current,
              accelSafety: currentAccelSafetyRef.current,
              gyroSafety: currentGyroSafetyRef.current
            }
          }));
        }
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
      isComponentMounted.current = false;
      if (ws.current) ws.current.close();
      gyroSubscription.remove();
      accelSubscription.remove();
      appStateSubscription.remove();
      clearInterval(processingInterval);
      if (cameraFrameIntervalRef.current) clearInterval(cameraFrameIntervalRef.current);
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
          facing="front"
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
          <View style={{ width: size, height: center, overflow: "hidden" }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
  sensorContainer: { position: "absolute", top: 60, left: 20, backgroundColor: "rgba(0, 0, 0, 0.7)", borderRadius: 10, padding: 12, zIndex: 50 },
  sensorText: { color: "white", fontSize: 12, opacity: 0.8 },
  riskScoreText: { color: "white", fontSize: 18, fontWeight: "bold" },
  mainContent: { flex: 1 },
  themeToggle: { alignSelf: "flex-end", padding: 20 },
  dialContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: { position: "absolute", width: "100%", alignItems: "center" },
  valueText: { fontSize: 100, fontWeight: "900", fontVariant: ["tabular-nums"] },
  label: { fontSize: 18, fontWeight: "bold", opacity: 0.5, marginTop: -10 },
});