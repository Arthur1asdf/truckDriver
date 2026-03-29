import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SERVER_URL = "ws://100.69.148.51:3000/frontend"; 
const MAX_DATA_POINTS = 30;
const MAX_LOGS = 5;

function App() {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState(0);
  
  const [accelData, setAccelData] = useState([]);
  const [gyroData, setGyroData] = useState([]);
  const [riskHistory, setRiskHistory] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);

  // Telemetry State
  const [telemetry, setTelemetry] = useState({
    riskScore: 0,
    drowsinessRisk: 0,
    prediction: 'Awaiting...',
    accelSafety: 'Normal',
    gyroSafety: 'Normal'
  });

  const lastPredictionRef = useRef('Awaiting...');

  // Uptime Counter
  useEffect(() => {
    let interval;
    if (connected) {
      interval = setInterval(() => setUptime(prev => prev + 1), 1000);
    } else {
      setUptime(0);
    }
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);
    ws.binaryType = "blob";

    ws.onopen = () => {
      setConnected(true);
      addLog("System Online. Listening for telemetry...", "info");
    };
    
    ws.onmessage = (event) => {
      const now = new Date().toLocaleTimeString();

      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        setFrame(url);
        return () => URL.revokeObjectURL(url);
      } else {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'telemetry') {
            setTelemetry(data.data);
            
            // Update Risk History Chart
            setRiskHistory(prev => {
              const newData = [...prev, { 
                time: now, 
                globalRisk: data.data.riskScore, 
                drowsiness: data.data.drowsinessRisk 
              }];
              return newData.slice(-MAX_DATA_POINTS);
            });

            // Event Logger logic: Log if prediction state changes significantly
            const currentPred = String(data.data.prediction).split(' ')[0]; // Extract base label
            const lastPred = String(lastPredictionRef.current).split(' ')[0];
            
            if (currentPred !== lastPred && currentPred !== 'No' && currentPred !== 'Awaiting...') {
               const alertType = (currentPred.toLowerCase().includes('sleep') || currentPred.toLowerCase().includes('yawn')) ? 'warning' : 'success';
               addLog(`Model State Transition: ${lastPred} → ${currentPred}`, alertType);
               lastPredictionRef.current = currentPred;
            }

          } else if (data.type === 'accelerometer') {
            setAccelData(prev => {
              const newData = [...prev, { time: now, ...data.data }];
              return newData.slice(-MAX_DATA_POINTS); 
            });
          } else if (data.type === 'gyro') {
            setGyroData(prev => {
              const newData = [...prev, { time: now, ...data.data }];
              return newData.slice(-MAX_DATA_POINTS);
            });
          }
        } catch (err) {
          console.log("Error parsing message", err);
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      addLog("Connection lost. Retrying...", "error");
    };
    return () => ws.close();
  }, []);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setEventLogs(prev => {
      const newLogs = [{ time, msg, type }, ...prev];
      return newLogs.slice(0, MAX_LOGS);
    });
  };

  const formatUptime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Determine Alert States
  const isSleeping = String(telemetry.prediction).toLowerCase().includes('sleep');
  const isHighRisk = telemetry.riskScore > 70;
  const isAlarmActive = isSleeping || isHighRisk;

  const yAxisDomain = [(dataMin) => Math.min(dataMin, -2), (dataMax) => Math.max(dataMax, 2)];

  const SensorChart = ({ title, data, colorX, colorY, colorZ }) => (
    <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #30363d' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e', textAlign: 'left' }}>{title}</h3>
      <div style={{ height: '140px', width: '100%' }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="time" hide />
            <YAxis domain={yAxisDomain} stroke="#8b949e" fontSize={10} width={30} />
            <Tooltip contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }} itemStyle={{ fontSize: '12px' }} />
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
      width: '100vw',    
      height: '100vh',   
      background: '#0d1117',
      color: '#e6edf3', 
      fontFamily: 'Inter, system-ui, sans-serif',
      margin: 0,         
      padding: 0,        
      overflow: 'hidden' 
    }}>
      {/* Header */}
      <header style={{ padding: '15px 30px', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#010409' }}>
        <h1 style={{ margin: 0, color: '#00BFFF', fontSize: '22px', fontWeight: '800', letterSpacing: '1px' }}>
          VIGIL<span style={{color: '#e6edf3'}}>EYES</span> 
          <span style={{color: '#8b949e', fontSize: '13px', fontWeight: '500', marginLeft: '15px'}}>Live Telemetry</span>
        </h1>
        <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span style={{color: '#8b949e'}}>UPTIME: {formatUptime(uptime)}</span>
          <span>Status: {connected ? <span style={{color: '#00BFFF'}}>● ONLINE</span> : <span style={{color: '#ff4444'}}>● OFFLINE</span>}</span>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '20px', gap: '20px' }}>
        
        {/* Left: Video Feed & Risk Status */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Risk Metrics Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
            <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', border: `1px solid ${isAlarmActive ? '#ff4444' : '#30363d'}`, transition: 'all 0.3s' }}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '5px' }}>GLOBAL RISK SCORE</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: isAlarmActive ? '#ff4444' : '#00BFFF' }}>
                {telemetry.riskScore}%
              </div>
            </div>
            <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d'}}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '5px' }}>DROWSINESS RISK</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: telemetry.drowsinessRisk > 50 ? '#ffaa00' : '#e6edf3' }}>
                {telemetry.drowsinessRisk}%
              </div>
            </div>
            <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d'}}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '5px' }}>CURRENT STATE</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }}>
                {telemetry.prediction}
              </div>
            </div>
            <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d'}}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '5px' }}>KINEMATICS</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '5px' }}>
                Accelerometer: <span style={{ color: telemetry.accelSafety === 'Dangerous' ? '#ff4444' : '#00BFFF' }}>{telemetry.accelSafety}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                Gyroscope: <span style={{ color: telemetry.gyroSafety === 'Dangerous' ? '#ff4444' : '#00BFFF' }}>{telemetry.gyroSafety}</span>
              </div>
            </div>
          </div>

          {/* Camera Feed Container */}
          <div style={{ position: 'relative', flex: 1, background: '#000', borderRadius: '15px', overflow: 'hidden', border: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            
            {/* Alarm Overlay */}
            {isAlarmActive && (
              <div style={{ 
                position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255, 0, 0, 0.3)', border: '4px solid #ff4444', animation: 'pulse 1s infinite alternate'
              }}>
                <h1 style={{ color: '#fff', fontSize: '48px', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
                  ⚠️ CRITICAL RISK DETECTED ⚠️
                </h1>
              </div>
            )}

            {frame ? (
              <img src={frame} style={{ height: '100%', width: '100%', objectFit: 'contain' }} alt="Stream" />
            ) : (
              <p style={{ color: '#8b949e' }}>Awaiting Camera Feed...</p>
            )}
            
            <div style={{ position: 'absolute', top: '15px', left: '15px', background: 'rgba(0, 191, 255, 0.15)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', color: '#00BFFF', border: '1px solid #00BFFF', fontWeight: 'bold', backdropFilter: 'blur(4px)' }}>
              LIVE - MODEL PROCESSING ON
            </div>
          </div>
        </div>

        {/* Right: Telemetry Charts & Diagnostics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0', overflowY: 'auto', paddingRight: '10px' }}>
          
          {/* Kinematics Charts */}
          <SensorChart title="ACCELEROMETER (m/s²)" data={accelData} colorX="#ff6b6b" colorY="#4ecdc4" colorZ="#00BFFF" />
          <SensorChart title="GYROSCOPE (rad/s)" data={gyroData} colorX="#feca57" colorY="#ff9ff3" colorZ="#a29bfe" />

          {/* Risk Analysis Chart */}
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #30363d' }}>
             <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e', textAlign: 'left' }}>RISK HISTORY (%)</h3>
             <div style={{ height: '120px', width: '100%' }}>
              <ResponsiveContainer>
                <AreaChart data={riskHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} stroke="#8b949e" fontSize={10} width={30} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }} itemStyle={{ fontSize: '12px' }} />
                  <Area type="monotone" dataKey="globalRisk" stroke="#00BFFF" fill="rgba(0, 191, 255, 0.2)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="drowsiness" stroke="#ffaa00" fill="rgba(255, 170, 0, 0.2)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
             </div>
          </div>

          {/* LOWER DIAGNOSTICS GRID (2x2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
            
            {/* ROW 1: Vision Algorithm & Events */}
            <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
              
              {/* Vision Engine Diagnostics */}
              <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e', textTransform: 'uppercase' }}>Vision Model Engine</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Buffer Size</span>
                    <span style={{fontWeight: 'bold'}}>75 Frames (~15s)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Temporal Weight</span>
                    <span style={{fontWeight: 'bold', fontFamily: 'monospace', color: '#00BFFF'}}>W = index²</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Ratio Math</span>
                    <span style={{fontWeight: 'bold', fontFamily: 'monospace'}}>(W_sleep / W_tot)^0.7</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Micro-sleep Penalty</span>
                    <span style={{fontWeight: 'bold', fontFamily: 'monospace', color: '#ffaa00'}}>12×(Consec_F)^1.6</span>
                  </div>
                  
                  {/* Visual Ratio Bar */}
                  <div style={{ width: '100%', height: '8px', background: '#21262d', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }}>
                    <div style={{ width: `${telemetry.drowsinessRisk}%`, height: '100%', background: telemetry.drowsinessRisk > 50 ? '#ffaa00' : '#00BFFF', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '10px', color: '#8b949e', marginTop: '2px'}}>Sleep Ratio Dominance</div>
                </div>
              </div>

              {/* Event Log Container */}
              <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e' }}>RECENT EVENTS</h3>
                <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {eventLogs.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#444' }}>No events logged yet...</div>
                  ) : (
                    eventLogs.map((log, i) => (
                      <div key={i} style={{ fontSize: '11px', display: 'flex', gap: '8px', opacity: 1 - (i * 0.15) }}>
                        <span style={{ color: '#8b949e', minWidth: '60px' }}>[{log.time}]</span>
                        <span style={{ 
                          color: log.type === 'error' ? '#ff4444' : log.type === 'warning' ? '#ffaa00' : log.type === 'success' ? '#00BFFF' : '#e6edf3'
                        }}>{log.msg}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* ROW 2: Kinematics & Synthesis */}
            <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
              
              {/* Kinematics Pipeline */}
              <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e', textTransform: 'uppercase' }}>IMU Sensor Pipeline</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Signal Window</span>
                    <span style={{fontWeight: 'bold'}}>50 Samples</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Accel Multiplier</span>
                    <span style={{fontWeight: 'bold', color: '#00BFFF'}}>9.0x Boost</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Gyro Deadzone</span>
                    <span style={{fontWeight: 'bold'}}>±0.03 rad/s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{color: '#8b949e'}}>Extracted Feats.</span>
                    <span style={{fontWeight: 'bold', fontSize: '10px', color: '#8b949e', textAlign: 'right'}}>Mean, Std, Max,<br/>Min, Jerk, IQR</span>
                  </div>
                </div>
              </div>

              {/* Risk Synthesis Calculation */}
              <div style={{ flex: 1, background: '#161b22', padding: '15px', borderRadius: '12px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#8b949e', textTransform: 'uppercase' }}>Risk Synthesis</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '4px' }}>
                    Telemetry merging vision & motion data to compute the drowsy and global risk.
                  </div>
                  <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px', border: '1px solid #21262d', fontFamily: 'monospace', fontSize: '11px', color: '#e6edf3' }}>
                    <span style={{color: '#ffaa00'}}>Risk_Drowsy</span> = MAX(Ratio, Pen)
                  </div>
                  <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px', border: '1px solid #21262d', fontFamily: 'monospace', fontSize: '11px', color: '#e6edf3' }}>
                    <span style={{color: '#ff4444'}}>Risk_Global</span> = Drowsy + IMU_Pen
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isAlarmActive ? '#ff4444' : '#00BFFF', boxShadow: `0 0 8px ${isAlarmActive ? '#ff4444' : '#00BFFF'}` }}></div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: isAlarmActive ? '#ff4444' : '#00BFFF' }}>
                      {isAlarmActive ? 'CRITICAL LIMIT MET' : 'SYSTEM NOMINAL'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
      
      {/* Required for the pulsing animation in React without an external CSS file */}
      <style>{`
        @keyframes pulse {
          from { background-color: rgba(255, 0, 0, 0.2); }
          to { background-color: rgba(255, 0, 0, 0.5); }
        }
      `}</style>
    </div>
  );
}

export default App;