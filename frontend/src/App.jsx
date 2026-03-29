// App.jsx inside your Vite project
import React, { useEffect, useState } from 'react';

const SERVER_URL = "ws://100.108.70.119:3000";

function App() {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);

    ws.onopen = () => setConnected(true);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Check if the message type is 'camera'
        if (data.type === 'camera') {
          // Your Node server sends data.data as the base64 string
          setFrame(`data:image/jpeg;base64,${data.data}`);
        }
      } catch (err) {
        console.log("Error parsing message from Node server");
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ textAlign: 'center', background: '#222', color: 'white', height: '100vh' }}>
      <h1>Trucker Live Feed</h1>
      <p>Status: {connected ? "🟢 Online" : "🔴 Offline"}</p>
      
      <div style={{ marginTop: '20px' }}>
        {frame ? (
          <img 
            src={frame} 
            style={{ width: '80%', borderRadius: '12px', border: '4px solid #444' }} 
            alt="Live Feed" 
          />
        ) : (
          <div style={{ padding: '100px', border: '2px dashed #666' }}>
            Awaiting Phone Stream...
          </div>
        )}
      </div>
    </div>
  );
}

export default App;