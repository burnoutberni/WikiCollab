import { setupWebSocket, setupWSConnection } from './connection.js';
import { initContentInitializor, initPersistence } from './persistence.js';

initContentInitializor();
initPersistence();

export { setupWebSocket, setupWSConnection };
export { broadcastCustom, WSSharedDoc } from './connection.js';
export { messageAwareness, messageCustom, messageSync } from './constants.js';
