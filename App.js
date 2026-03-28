import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import { useState, useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { calculateRiskScore } from './riskScorer.js';

const SENSOR_UPDATE_INTERVAL_MS = 100;
const SCORE_CALCULATION_WINDOW_S = 2;
const WINDOW_SIZE = (SCORE_CALCULATION_WINDOW_S * 1000) / SENSOR_UPDATE_INTERVAL_MS;


export default function App() {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [riskScore, setRiskScore] = useState(0);
  const cameraRef = useRef(null);

  const sensorWindow = useRef([]);
  const lastRiskScore = useRef(0);
  const latestGyro = useRef({ x: 0, y: 0, z: 0 });
  const latestAccel = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    const gyroSubscription = Gyroscope.addListener(gyroData => {
      latestGyro.current = gyroData;
      setGyroscopeData(gyroData);
    });

    const accelSubscription = Accelerometer.addListener(accelData => {
      latestAccel.current = accelData;
      setAccelerometerData(accelData);
    });

    const processingInterval = setInterval(() => {
      sensorWindow.current.push({
        gyro: latestGyro.current,
        accel: latestAccel.current,
      });

      if (sensorWindow.current.length >= WINDOW_SIZE) {
        const newRiskScore = calculateRiskScore(sensorWindow.current, lastRiskScore.current, SENSOR_UPDATE_INTERVAL_MS / 1000);
        setRiskScore(newRiskScore);
        lastRiskScore.current = newRiskScore;
        sensorWindow.current = []; // Reset for the next window
      }
    }, SENSOR_UPDATE_INTERVAL_MS);

    return () => {
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
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  async function takePicture() {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      console.log('Photo taken:', photo.uri);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={takePicture}>
            <Text style={styles.text}>Snapshot</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sensorContainer}>
          <Text style={styles.riskScoreText}>Risk Score: {riskScore}</Text>
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
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
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
