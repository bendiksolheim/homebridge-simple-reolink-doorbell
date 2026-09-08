import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { ReolinkDoorbellPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, ReolinkDoorbellPlatform);
};
