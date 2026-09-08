import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, DoorbellConfig } from './settings';
import { DoorbellAccessory } from './doorbellAccessory';

export class ReolinkDoorbellPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly doorbells: DoorbellAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.api.on('didFinishLaunching', () => {
      this.discoverDoorbells();
    });

    this.api.on('shutdown', () => {
      for (const doorbell of this.doorbells) {
        doorbell.shutdown();
      }
    });
  }

  /**
   * Called by Homebridge for every cached accessory it restored from disk on startup.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private discoverDoorbells(): void {
    const configuredDoorbells: DoorbellConfig[] = this.config.doorbells ?? [];

    if (configuredDoorbells.length === 0) {
      this.log.warn('No doorbells configured. Add at least one under "doorbells" in the plugin config.');
      return;
    }

    const activeUuids = new Set<string>();

    for (const doorbellConfig of configuredDoorbells) {
      const uuid = this.api.hap.uuid.generate(`reolink-doorbell-${doorbellConfig.host}-${doorbellConfig.channel ?? 0}`);
      activeUuids.add(uuid);

      let accessory = this.accessories.find((a) => a.UUID === uuid);

      if (accessory) {
        this.log.info('Restoring existing accessory:', doorbellConfig.name);
        accessory.displayName = doorbellConfig.name;
      } else {
        this.log.info('Adding new doorbell accessory:', doorbellConfig.name);
        accessory = new this.api.platformAccessory(doorbellConfig.name, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      this.doorbells.push(new DoorbellAccessory(this, accessory, doorbellConfig));
    }

    // Clean up accessories for doorbells that have been removed from config.
    const stale = this.accessories.filter((a) => !activeUuids.has(a.UUID));
    if (stale.length > 0) {
      this.log.info('Removing stale accessories:', stale.map((a) => a.displayName).join(', '));
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }
}
