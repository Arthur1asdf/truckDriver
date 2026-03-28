import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gyroscope, Accelerometer } from 'expo-sensors';
import { useState, useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SPIKE_THRESHOLD = 0.5; // Threshold for detecting a spike

export default function App() {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [safeScore, setSafeScore] = useState(100);
  const cameraRef = useRef(null);
  const lastGyro = useRef(null);
  const lastAccel = useRef(null);

  useEffect(() => {
    const gyroSubscription = Gyroscope.addListener(gyroData => {
      setGyroscopeData(gyroData);
      if (lastGyro.current) {
        const mag1 = Math.sqrt(lastGyro.current.x ** 2 + lastGyro.current.y ** 2 + lastGyro.current.z ** 2);
        const mag2 = Math.sqrt(gyroData.x ** 2 + gyroData.y ** 2 + gyroData.z ** 2);
        if (Math.abs(mag2 - mag1) > SPIKE_THRESHOLD) {
          setSafeScore(s => Math.max(0, s - 5));
        }
      }
      lastGyro.current = gyroData;
    });
    Gyroscope.setUpdateInterval(100);

    const accelSubscription = Accelerometer.addListener(accelData => {
      setAccelerometerData(accelData);
      if (lastAccel.current) {
        const mag1 = Math.sqrt(lastAccel.current.x ** 2 + lastAccel.current.y ** 2 + lastAccel.current.z ** 2);
        const mag2 = Math.sqrt(accelData.x ** 2 + accelData.y ** 2 + accelData.z ** 2);
        if (Math.abs(mag2 - mag1) > SPIKE_THRESHOLD) {
          setSafeScore(s => Math.max(0, s - 5));
        }
      }
      lastAccel.current = accelData;
    });
    Accelerometer.setUpdateInterval(100);

    const scoreInterval = setInterval(() => {
        setSafeScore(s => Math.min(100, s + 1));
    }, 50);

    return () => {
      gyroSubscription.remove();
      accelSubscription.remove();
      clearInterval(scoreInterval);
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
          <Text style={styles.safeScore}>Safe Score: {safeScore.toFixed(0)}</Text>
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
  safeScore: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
