import { loadConfig, getConfig } from './config.js';
loadConfig();
import { createServer } from 'http';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';

const app = createApp();
const server = createServer(app);
const config = getConfig();

initSocket(server);

server.listen(config.port, () => {
  console.log(`LightTickets API running on port ${config.port}`);
});
