import React, { useEffect, useState } from 'react';

// Connect to the Flask backend's dedicated frontend route
const SERVER_URL = "ws://100.108.70.119:3000/frontend"; 

function App() {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
      setConnected(true);
      console.log("Connected to Flask Backend");
    };
    
    ws.onmessage = (event) => {
      // Check if data is binary (the camera frame)
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        setFrame(url);
        
        // Clean up memory to prevent leaks from old object URLs
        return () => URL.revokeObjectURL(url);
      } else {
        // Handle future sensor data or status updates
        try {
          const data = JSON.parse(event.data);
          console.log("Received sensor/status data:", data);
        } catch (err) {
          console.log("Received unknown text message");
        }
      }
    };

    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  return (
    <div style={{ textAlign: 'center', background: '#111', color: 'white', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ color: '#00ff00' }}>Trucker Live Dashboard</h1>
      <p>Backend Status: {connected ? "🟢 Online" : "🔴 Offline"}</p>
      
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
        {frame ? (
          <img 
            src={frame} 
            style={{ width: '90%', maxWidth: '800px', borderRadius: '12px', border: '4px solid #333' }} 
            alt="Live Stream" 
          />
        ) : (
          <div style={{ width: '90%', maxWidth: '800px', height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #444', borderRadius: '12px' }}>
            <p style={{ color: '#666' }}>Awaiting stream from vehicle...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;