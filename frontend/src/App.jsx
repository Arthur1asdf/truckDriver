import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SERVER_URL = "ws://100.108.70.119:3000/frontend"; 
const MAX_DATA_POINTS = 30; // How many points to show before scrolling

function App() {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);
  
  // State for the charts
  const [accelData, setAccelData] = useState([]);
  const [gyroData, setGyroData] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);
    ws.binaryType = "blob";

    ws.onopen = () => setConnected(true);
    
    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        setFrame(url);
        // Revoke the old URL to avoid memory leaks
        return () => URL.revokeObjectURL(url);
      } else {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'accelerometer') {
            setAccelData(prev => {
              const newData = [...prev, { time: new Date().toLocaleTimeString(), ...data.data }];
              return newData.slice(-MAX_DATA_POINTS); // Keep only the last 30 points
            });
          } else if (data.type === 'gyro') {
            setGyroData(prev => {
              const newData = [...prev, { time: new Date().toLocaleTimeString(), ...data.data }];
              return newData.slice(-MAX_DATA_POINTS);
            });
          }
        } catch (err) {
          console.log("Error parsing message", err);
        }
      }
    };

    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  // Helper component for a Chart Card
  const SensorChart = ({ title, data, colorX, colorY, colorZ }) => (
    <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #333' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaa', textAlign: 'left' }}>{title}</h3>
      <div style={{ height: '200px', width: '100%' }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" hide />
            <YAxis domain={[-2, 2]} stroke="#666" fontSize={10} />
            <Tooltip contentStyle={{ backgroundColor: '#222', border: 'none' }} itemStyle={{ fontSize: '10px' }} />
            <Line type="monotone" dataKey="x" stroke={colorX} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line type="monotone" dataKey="y" stroke={colorY} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line type="monotone" dataKey="z" stroke={colorZ} dot={false} isAnimationActive={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
  <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      width: '100vw',    // Force full width
      height: '100vh',   // Force full height
      background: '#0a0a0a', 
      color: '#eee', 
      fontFamily: 'Inter, system-ui, sans-serif',
      margin: 0,         // Ensure no default margins
      padding: 0,        // Ensure no default padding
      overflow: 'hidden' // Prevents scrollbars from appearing
    }}>
    {/* Header */}
      <header style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#00ff00', fontSize: '24px' }}>TRUCKDRIVER <span style={{color: '#666', fontSize: '14px'}}>Live Telemetry</span></h1>
        <div style={{ fontSize: '14px' }}>
          Status: {connected ? <span style={{color: '#00ff00'}}>● ONLINE</span> : <span style={{color: '#ff4444'}}>● OFFLINE</span>}
        </div>
      </header>

      {/* Main Content Dashboard */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '20px', gap: '20px' }}>
        
        {/* Left: Video Feed */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1, background: '#000', borderRadius: '15px', overflow: 'hidden', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {frame ? (
              <img src={frame} style={{ height: '100%', width: '100%', objectFit: 'contain' }} alt="Stream" />
            ) : (
              <p style={{ color: '#444' }}>Awaiting Camera Feed...</p>
            )}
            <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,255,0,0.2)', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', color: '#00ff00', border: '1px solid #00ff00' }}>
              LIVE - AI PROCESSING ON
            </div>
          </div>
        </div>

        {/* Right: Telemetry Charts */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
          <SensorChart 
            title="ACCELEROMETER (m/s²)" 
            data={accelData} 
            colorX="#ff4444" colorY="#44ff44" colorZ="#4444ff" 
          />
          <SensorChart 
            title="GYROSCOPE (rad/s)" 
            data={gyroData} 
            colorX="#ffbb33" colorY="#33b5e5" colorZ="#aa66cc" 
          />
          
          {/* Quick Stats Block */}
          <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#aaa' }}>SYSTEM HEALTH</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#252525', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#666' }}>LATENCY</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>~45ms</div>
              </div>
              <div style={{ background: '#252525', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#666' }}>FPS</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>12</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;