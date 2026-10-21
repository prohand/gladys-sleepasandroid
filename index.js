// -----------------------------------------------------------------------------
// Entry point of the Sleep as Android integration for Gladys Assistant.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
//
// All the wiring lives in src/app.js; this file only loads the saved states,
// connects, and shuts down cleanly.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';
import { StateStore } from './src/store.js';

const gladys = new GladysIntegration();

// The states saved before a restart (a session started before an update must
// still have its start when the tracking stops in the morning).
const store = await new StateStore().load();
const service = registerHandlers(gladys, { store });

// Stop MQTT, finish the event in progress and save the states before exiting.
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await service.stop();
});

// A bug in one event must never take the night down with it.
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', err));

logger.info('Starting the Sleep as Android integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
