import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ReolinkBaichuanApi } from '@apocaliss92/nodelink-js';
import { ReolinkDoorbellPlatform } from './platform';
import { DoorbellConfig } from './settings';

/**
 * One instance of this class is created per configured doorbell.
 * It holds a persistent Baichuan connection to the camera and rings
 * the HomeKit Doorbell service whenever a `doorbell` event arrives.
 */
export class DoorbellAccessory {
  private doorbellService: Service;
  private api: ReolinkBaichuanApi;
  private channel: number;
  private throttleMs: number;
  private lastRing = 0;
  private reconnectDelayMs = 5000;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: ReolinkDoorbellPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: DoorbellConfig,
  ) {
    this.channel = config.channel ?? 0;
    this.throttleMs = (config.ringThrottleSeconds ?? 3) * 1000;

    const { Characteristic } = this.platform;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Reolink')
      .setCharacteristic(Characteristic.Model, 'Video Doorbell (Baichuan)')
      .setCharacteristic(Characteristic.SerialNumber, `${config.host}-ch${this.channel}`);

    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell);

    this.doorbellService.setCharacteristic(Characteristic.Name, config.name);

    // Required on the Doorbell service even though this accessory has no
    // physical mute control - HomeKit expects it to be present.
    this.doorbellService
      .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
      .onGet((): CharacteristicValue => Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);

    this.api = new ReolinkBaichuanApi({
      host: config.host,
      port: config.port ?? 9000,
      username: config.username,
      password: config.password,
      logger: {
        log: (...args: unknown[]) => this.platform.log.info(`[${config.name}]`, ...args),
        debug: (...args: unknown[]) => this.platform.log.debug(`[${config.name}]`, ...args),
        info: (...args: unknown[]) => this.platform.log.info(`[${config.name}]`, ...args),
        warn: (...args: unknown[]) => this.platform.log.warn(`[${config.name}]`, ...args),
        error: (...args: unknown[]) => this.platform.log.error(`[${config.name}]`, ...args),
      },
    });

    this.connect();
  }

  /**
   * The library re-establishes its own socket and re-subscribes automatically
   * on transient drops (it even watchdogs a silent subscription), so this only
   * needs to cover the initial login - e.g. the camera being briefly
   * unreachable when Homebridge starts up.
   */
  private async connect(): Promise<void> {
    try {
      await this.api.login();
      this.reconnectDelayMs = 5000;
      this.platform.log.info(`[${this.config.name}] Connected to ${this.config.host}, listening for ring events`);

      await this.api.onSimpleEvent((event) => {
        if (event.type === 'doorbell' && event.channel === this.channel) {
          this.ring();
        }
      });
    } catch (err) {
      this.platform.log.error(
        `[${this.config.name}] Failed to connect (retrying in ${Math.round(this.reconnectDelayMs / 1000)}s): ${
          (err as Error).message
        }`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      // Exponential backoff, capped at 2 minutes, so a downed camera
      // doesn't get hammered with login attempts.
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 120000);
      this.connect();
    }, this.reconnectDelayMs);
  }

  private ring(): void {
    const now = Date.now();
    if (now - this.lastRing < this.throttleMs) {
      this.platform.log.debug(`[${this.config.name}] Ring suppressed (within throttle window)`);
      return;
    }
    this.lastRing = now;

    this.platform.log.info(`[${this.config.name}] Doorbell rang`);
    this.doorbellService.updateCharacteristic(
      this.platform.Characteristic.ProgrammableSwitchEvent,
      this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    );
  }

  public isConnected(): boolean {
    return this.api.isReady;
  }

  public async shutdown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.api.close().catch(() => undefined);
  }
}
