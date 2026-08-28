import { LicenseInfo } from '../core/models';

export interface LicenseProvider {
  isPro(): Promise<boolean>;
  getLicenseInfo(): Promise<LicenseInfo>;
}

export class FreeLicenseProvider implements LicenseProvider {
  async isPro(): Promise<boolean> {
    return false;
  }
  async getLicenseInfo(): Promise<LicenseInfo> {
    return { tier: 'free', source: 'none' };
  }
}

export class DevelopmentLicenseProvider implements LicenseProvider {
  constructor(private readonly pro = false) {}
  async isPro(): Promise<boolean> {
    return this.pro;
  }
  async getLicenseInfo(): Promise<LicenseInfo> {
    return { tier: this.pro ? 'pro' : 'free', source: 'development' };
  }
}
