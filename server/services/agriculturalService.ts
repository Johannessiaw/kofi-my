/**
 * Agricultural Data Service
 * Connects verified smallholders, crop listings, and daily commercial market price feeds
 */

import { dbStore, MarketPriceEntry, HarvestRecord, FarmerRecord } from '../db/store';

export class AgriculturalService {
  /**
   * Look up current wholesale/retail market prices
   */
  public static getMarketPrices(crop?: string, region?: string): MarketPriceEntry[] {
    return dbStore.getMarketPrices({ crop, region });
  }

  /**
   * Search available harvests from verified smallholders
   */
  public static searchHarvests(crop?: string, town?: string, maxPrice?: number): HarvestRecord[] {
    return dbStore.getHarvests({ crop, town, maxPrice });
  }

  /**
   * Find verified farmers by crop
   */
  public static getFarmers(crop?: string): FarmerRecord[] {
    return dbStore.getFarmers(crop);
  }

  /**
   * Add a new harvest listing for a verified smallholder
   */
  public static addHarvestListing(data: Omit<HarvestRecord, 'id'>): HarvestRecord {
    return dbStore.addHarvest(data);
  }

  /**
   * Get agricultural weather advisory
   */
  public static getWeather(town?: string) {
    return dbStore.getWeather(town);
  }
}
