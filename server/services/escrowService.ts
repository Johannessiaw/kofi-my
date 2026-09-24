/**
 * Mobile Money Escrow Service for GHarvest
 * Manages the escrow lifecycle protecting smallholders and agricultural buyers
 */

import { dbStore, OrderRecord } from '../db/store';
import { LogisticsService } from './logisticsService';

export interface CreateOrderParams {
  crop: string;
  quantity: number;
  unit: string;
  pickupTown: string;
  deliveryTown: string;
  buyerName?: string;
  buyerPhone?: string;
  farmerName?: string;
  farmerPhone?: string;
  paymentMethod?: OrderRecord['paymentMethod'];
}

export class EscrowService {
  /**
   * Calculate full order quotation including crop, transport, and escrow protection fee
   */
  public static calculateQuotation(crop: string, quantity: number, pickupTown: string, deliveryTown: string) {
    const prices = dbStore.getMarketPrices({ crop });
    const unitPrice = prices.length > 0 ? prices[0].wholesalePriceGHS : 100;
    const cropTotal = quantity * unitPrice;

    const freight = LogisticsService.calculateFreight(pickupTown, deliveryTown, quantity, crop);
    const serviceFeeGHS = Math.max(30, Math.round(cropTotal * 0.025)); // 2.5% escrow management fee
    const totalAmountGHS = cropTotal + freight.estimatedCostGHS + serviceFeeGHS;

    return {
      crop,
      quantity,
      unitPriceGHS: unitPrice,
      cropTotalGHS: cropTotal,
      freight,
      serviceFeeGHS,
      totalAmountGHS,
    };
  }

  /**
   * Create and fund a new order in escrow
   */
  public static createOrder(params: CreateOrderParams): OrderRecord {
    const quote = this.calculateQuotation(params.crop, params.quantity, params.pickupTown, params.deliveryTown);

    // Look for verified farmer in pickup location if not specified
    let farmerName = params.farmerName;
    let farmerPhone = params.farmerPhone;
    if (!farmerName) {
      const farmers = dbStore.getFarmers(params.crop);
      if (farmers.length > 0) {
        farmerName = farmers[0].name;
        farmerPhone = farmers[0].phone;
      } else {
        farmerName = 'MoFA Verified Farmer';
        farmerPhone = '024 456 7891';
      }
    }

    return dbStore.createOrder({
      crop: params.crop,
      quantity: params.quantity,
      unit: params.unit,
      totalCropPriceGHS: quote.cropTotalGHS,
      transportPriceGHS: quote.freight.estimatedCostGHS,
      serviceFeeGHS: quote.serviceFeeGHS,
      totalAmountGHS: quote.totalAmountGHS,
      buyerName: params.buyerName || 'GHarvest Verified Buyer',
      buyerPhone: params.buyerPhone || '024 333 4455',
      farmerName,
      farmerPhone,
      pickupTown: quote.freight.origin,
      deliveryTown: quote.freight.destination,
      vehicle: quote.freight.vehicle,
      paymentMethod: params.paymentMethod || 'MTN Mobile Money',
      status: 'escrow_funded',
      escrowStatus: 'held',
    });
  }

  /**
   * Get all active orders
   */
  public static getOrders(): OrderRecord[] {
    return dbStore.getOrders();
  }

  /**
   * Update order status across lifecycle
   */
  public static updateStatus(
    orderId: string,
    status: OrderRecord['status'],
    escrowStatus?: OrderRecord['escrowStatus'],
    note?: string
  ): OrderRecord | null {
    return dbStore.updateOrderStatus(orderId, status, escrowStatus, note);
  }
}
