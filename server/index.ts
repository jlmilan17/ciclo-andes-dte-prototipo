import { createApp } from './app.js';
import { config } from './config.js';
import { startContingencyWorker } from './worker/contingency.js';

const app = createApp();
app.listen(config.API_PORT, () => {
  console.log(`API de negocio en http://localhost:${config.API_PORT}`);
  startContingencyWorker();
});
