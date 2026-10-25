import { createSimApp } from './app.js';

const port = Number(process.env.MH_SIM_PORT ?? 4100);
createSimApp().listen(port, () => {
  console.log(`Simulador del MH en http://localhost:${port}/mh-sim`);
});
