/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'SimpleReolinkDoorbell';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-simple-reolink-doorbell';

export interface DoorbellConfig {
  name: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  channel?: number;
  ringThrottleSeconds?: number;
}
