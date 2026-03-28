import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gyroscope } from 'expo-sensors';
import { useState, useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function App() {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0 });
  const cameraRef = useRef(null);

  useEffect(() => {
    const subscription = Gyroscope.addListener(gyroscopeData => {
      setGyroscopeData(gyroscopeData);
    });
    Gyroscope.setUpdateInterval(20);

    return () => {
      subscription.remove();
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
        <View style={styles.gyroContainer}>
          <Text style={styles.gyroText}>
            x: {gyroscopeData.x.toFixed(2)}
          </Text>
          <Text style={styles.gyroText}>
            y: {gyroscopeData.y.toFixed(2)}
          </Text>
          <Text style={styles.gyroText}>
            z: {gyroscopeData.z.toFixed(2)}
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
  gyroContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 5,
    padding: 5,
  },
  gyroText: {
    color: 'white',
    fontSize: 16,
  },
});
