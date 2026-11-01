import {
  CameraStreamingDelegate,
  DoorbellController,
  PlatformAccessory,
  PrepareStreamCallback,
  PrepareStreamRequest,
  Service,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge';
import { ReolinkBaichuanApi } from '@apocaliss92/nodelink-js';
import { ReolinkDoorbellPlatform } from './platform';
import { DoorbellConfig } from './settings';
import { PLACEHOLDER_SNAPSHOT } from './placeholder';

/**
 * One instance of this class is created per configured doorbell.
 * It holds a persistent Baichuan connection to the camera and rings
 * the HomeKit Doorbell service whenever a `doorbell` event arrives.
 *
 * HomeKit only supports a Doorbell service that sits on the same accessory
 * as a camera, so this also exposes a placeholder camera: snapshots are
 * fetched from the doorbell (falling back to a blank image), and live
 * streaming is refused.
 */
export class DoorbellAccessory implements CameraStreamingDelegate {
  private doorbellService: Service;
  private controller: DoorbellController;
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
    const hap = this.platform.api.hap;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Reolink')
      .setCharacteristic(Characteristic.Model, 'Video Doorbell (Baichuan)')
      .setCharacteristic(Characteristic.SerialNumber, `${config.host}-ch${this.channel}`);

    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell);

    this.doorbellService.setCharacteristic(Characteristic.Name, config.name);

    // The streaming options only need to be valid enough for HomeKit to
    // accept the camera - no stream is ever actually started.
    this.controller = new hap.DoorbellController({
      cameraStreamCount: 1,
      delegate: this,
      externalDoorbellService: this.doorbellService,
      streamingOptions: {
        supportedCryptoSuites: [hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          codec: {
            profiles: [hap.H264Profile.BASELINE, hap.H264Profile.MAIN, hap.H264Profile.HIGH],
            levels: [hap.H264Level.LEVEL3_1, hap.H264Level.LEVEL3_2, hap.H264Level.LEVEL4_0],
          },
          resolutions: [
            [1280, 720, 30],
            [640, 360, 30],
            [320, 180, 30],
          ],
        },
      },
    });
    this.accessory.configureController(this.controller);

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
    this.controller.ringDoorbell();
  }

  async handleSnapshotRequest(_request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    if (!this.api.isReady) {
      callback(undefined, PLACEHOLDER_SNAPSHOT);
      return;
    }
    try {
      // HomeKit gives up on snapshots after a few seconds, so keep this short.
      const snapshot = await this.api.getSnapshot(this.channel, { timeoutMs: 4000 });
      callback(undefined, snapshot);
    } catch (err) {
      this.platform.log.debug(`[${this.config.name}] Snapshot failed, using placeholder: ${(err as Error).message}`);
      callback(undefined, PLACEHOLDER_SNAPSHOT);
    }
  }

  prepareStream(_request: PrepareStreamRequest, callback: PrepareStreamCallback): void {
    callback(new Error('Live video is not supported by this plugin'));
  }

  handleStreamRequest(_request: StreamingRequest, callback: StreamRequestCallback): void {
    callback(new Error('Live video is not supported by this plugin'));
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
