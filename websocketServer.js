const WebSocket = require('ws');
const fs = require('fs');

const wss = new WebSocket.Server({ port: 3000 });

console.log('🚀 WebSocket server started on port 3000');

let imageCount = 0;

wss.on('connection', (ws) => {
  console.log('New connection established (Phone or Dashboard)');

  ws.on('message', (message) => {
    // 1. Convert message to string/buffer safely
    const messageString = message.toString();

    try {
      const data = JSON.parse(messageString);

      // 2. If it's a camera frame, broadcast it to the Dashboard
      if (data.type === 'camera') {
        
        // --- BROADCAST LOGIC ---
        // This sends the frame to every connected client EXCEPT the sender (the phone)
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(messageString); 
          }
        });

        // --- OPTIONAL: SAVE EVERY 10th IMAGE ---
        imageCount++;
        if (imageCount % 10 === 0) {
          let base64Data = data.data;
          // Clean the base64 string if it has the data:image prefix
          if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
          }
          const imageBuffer = Buffer.from(base64Data, 'base64');
          fs.writeFile(`latest_frame.png`, imageBuffer, (err) => {
            if (!err) console.log(`📸 Saved frame ${imageCount} for debugging`);
          });
        }
      }
      
      // 3. Handle Sensor Data (Relay this too so dashboard can see Risk Score)
      if (data.type === 'gyro' || data.type === 'accelerometer' || data.type === 'status') {
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(messageString);
          }
        });
      }

    } catch (error) {
      // If the message is too large or malformed, don't crash the server
      console.error('Failed to process message');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});