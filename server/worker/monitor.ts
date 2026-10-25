import { config } from '../config.js';
import { checkConnectivity } from '../mh/status.js';

/** RF-LOT-01: ping periódico al MH, independiente de cualquier request del POS. */
export function startMonitor(): () => void {
  void checkConnectivity();
  const t = setInterval(() => void checkConnectivity(), config.CONTINGENCY_POLL_SECONDS * 1000);
  return () => clearInterval(t);
}
