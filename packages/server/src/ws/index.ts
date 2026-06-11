import { setupWebSocket, setupWSConnection } from './connection.js';
import { initContentInitializor, initPersistence } from './persistence.js';

initContentInitializor();
initPersistence();

export { setupWebSocket, setupWSConnection };
export { WSSharedDoc, broadcastCustom } from './connection.js';
export { messageSync, messageAwareness, messageCustom } from './constants.js';
