import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';

const PLUGIN_NAME = 'homebridge-tesla-wallconnector';
const PLATFORM_NAME = 'TeslaWallConnector';

class TeslaWallConnectorPlatform implements DynamicPlatformPlugin {
  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const wallConnectorConfig = {
      name: 'Tesla Wall Connector',
      ip: this.config.ip ?? '192.168.122.146',  // Default IP, should be configurable
      pollInterval: this.config.pollInterval ?? 300000, // Default 5 minutes in milliseconds
    };

    const uuid = this.api.hap.uuid.generate('tesla-wallconnector-' + wallConnectorConfig.ip);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
      new TeslaWallConnectorAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new accessory:', wallConnectorConfig.name);
      const accessory = new this.api.platformAccessory(wallConnectorConfig.name, uuid);
      new TeslaWallConnectorAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}

class TeslaWallConnectorAccessory {
  private energyService: Service;
  private statusService: Service;
  private lastUpdate: number = 0;
  private pollingInterval: NodeJS.Timeout;

  constructor(
    private readonly platform: TeslaWallConnectorPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Energy Service (using custom service type)
    this.energyService = this.accessory.getService('Energy') || 
      this.accessory.addService(this.platform.api.hap.Service.Custom, 'Energy', 'energy');

    // Status Service (using sensor service)
    this.statusService = this.accessory.getService(this.platform.api.hap.Service.ContactSensor) ||
      this.accessory.addService(this.platform.api.hap.Service.ContactSensor);

    // Set up characteristics
    this.setupCharacteristics();

    // Start polling
    this.startPolling();
  }

  private setupCharacteristics() {
    // Energy characteristics
    this.energyService.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      'Wall Connector Energy'
    );

    // Status characteristics
    this.statusService.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      'Wall Connector Status'
    );
  }

  private async fetchVitals() {
    try {
      const response = await axios.get(`http://${this.platform.config.ip}/api/1/vitals`);
      return response.data;
    } catch (error) {
      this.platform.log.error('Error fetching vitals:', error);
      return null;
    }
  }

  private async fetchLifetime() {
    try {
      const response = await axios.get(`http://${this.platform.config.ip}/api/1/lifetime`);
      return response.data;
    } catch (error) {
      this.platform.log.error('Error fetching lifetime stats:', error);
      return null;
    }
  }

  private async updateValues() {
    const vitals = await this.fetchVitals();
    const lifetime = await this.fetchLifetime();

    if (vitals && lifetime) {
      // Update energy service
      // TODO: Implement energy characteristics updates

      // Update status service
      this.statusService.updateCharacteristic(
        this.platform.api.hap.Characteristic.ContactSensorState,
        vitals.contactor_closed
      );

      this.lastUpdate = Date.now();
    }
  }

  private startPolling() {
    const pollInterval = this.platform.config.pollInterval ?? 300000; // 5 minutes default
    this.pollingInterval = setInterval(() => {
      this.updateValues();
    }, pollInterval);
  }
}

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, TeslaWallConnectorPlatform);
};