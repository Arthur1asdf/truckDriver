const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

console.log('WebSocket server started on port 3000');

wss.on('connection', ws => {
  console.log('Client connected');
  ws.on('message', message => {
    console.log('received: %s', message);
  });
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
