/**
 * DB Module — exports the primary controller and auth adapter
 */

export { DatabaseController, getDbController, createPoolProxy } from './controller.js';
export { createRaidAdapter } from './raid-adapter.js';
