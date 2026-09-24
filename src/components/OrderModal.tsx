import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, Phone, MapPin, Truck, AlertCircle, Loader2 } from 'lucide-react';
import { Order } from '../types';

interface OrderModalProps {
  orderData: any;
  onClose: () => void;
  onFinalizeOrder: (order: Order) => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  orderData,
  onClose,
  onFinalizeOrder,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'MTN Mobile Money' | 'Telecel Cash' | 'AT Money'>('MTN Mobile Money');
  const [buyerName, setBuyerName] = useState<string>('Kofi Mensah Catering');
  const [buyerPhone, setBuyerPhone] = useState<string>('024 123 4567');
  const [deliveryDate, setDeliveryDate] = useState<string>('2026-09-25');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const handleConfirmAndPay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const orderId = `GH-${Math.floor(1000 + Math.random() * 9000)}`;
      const newOrder: Order = {
        id: orderId,
        crop: orderData.product || 'Tomatoes',
        quantity: orderData.quantity || 50,
        unit: orderData.unit || 'Crates',
        totalCropPriceGHS: orderData.cropPriceGHS || 4500,
        transportPriceGHS: orderData.transportGHS || 600,
        serviceFeeGHS: orderData.serviceFeeGHS || 120,
        totalAmountGHS: orderData.totalAmountGHS || 5220,
        buyerName,
        buyerPhone,
        farmerName: orderData.farmerName || 'Kwabena Mensah',
        farmerPhone: orderData.farmerPhone || '024 456 7891',
        pickupTown: orderData.pickup || 'Techiman',
        deliveryTown: orderData.destination || 'Kumasi',
        deliveryDate,
        status: 'escrow_funded',
        paymentMethod,
        escrowStatus: 'held',
        createdAt: new Date().toLocaleString(),
        trackingUpdates: [
          {
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            note: `Escrow funded GH₵ ${(orderData.totalAmountGHS || 5220).toLocaleString()} via ${paymentMethod}. Locked securely until delivery inspection.`,
            location: 'GHarvest Escrow Vault',
          },
        ],
      };

      setIsProcessing(false);
      setIsCompleted(true);
      setTimeout(() => {
        onFinalizeOrder(newOrder);
      }, 1400);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f1f16] border border-emerald-800/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {isCompleted ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="font-display font-bold text-xl text-white">Escrow Payment Confirmed!</h3>
            <p className="text-xs text-gray-300 max-w-sm mx-auto">
              Your Mobile Money escrow is funded. Farmer {orderData.farmerName} has been alerted for packhouse dispatch to {orderData.destination}.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              CONFIRM ORDER & ESCROW DEPOSIT
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Funds are held securely in GHarvest escrow and only released to the smallholder farmer after you verify crop quality.
            </p>

            {/* Order specs */}
            <div className="bg-[#0b1710] p-4 rounded-xl border border-emerald-950 text-xs space-y-2 mb-4">
              <div className="flex justify-between font-semibold text-white">
                <span>Commodity:</span>
                <span>{orderData.quantity} {orderData.unit} {orderData.product}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Verified Farmer:</span>
                <span>{orderData.farmerName} ({orderData.pickup})</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Delivery Destination:</span>
                <span>{orderData.destination}</span>
              </div>
              <div className="pt-2 border-t border-emerald-950 flex justify-between text-emerald-300 font-bold text-sm">
                <span>Total Escrow:</span>
                <span>GH₵ {orderData.totalAmountGHS?.toLocaleString()}</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 text-xs mb-5">
              <div>
                <label className="block text-gray-300 mb-1">Buyer / Business Name</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full bg-[#162a1e] text-white border border-emerald-800/60 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 mb-1">Phone (MoMo Wallet)</label>
                  <input
                    type="text"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    className="w-full bg-[#162a1e] text-white border border-emerald-800/60 rounded-lg p-2 font-mono focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-1">Delivery Target Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-[#162a1e] text-white border border-emerald-800/60 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 mb-1">Mobile Money Payment Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MTN Mobile Money', 'Telecel Cash', 'AT Money'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`p-2 rounded-lg text-[11px] font-semibold transition border ${
                        paymentMethod === method
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-[#14261b] text-gray-300 border-emerald-900/60 hover:bg-emerald-950'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              disabled={isProcessing}
              onClick={handleConfirmAndPay}
              className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-60 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Locking Escrow with {paymentMethod}...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-amber-300" />
                  Deposit GH₵ {orderData.totalAmountGHS?.toLocaleString()} & Confirm Order
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
