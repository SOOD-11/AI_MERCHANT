import React from 'react';
import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import type { ProcurementOrderResult } from '../../types/commerce';

export const PaymentLinkCard: React.FC<{ order: ProcurementOrderResult | null }> = ({ order }) => {
  return (
    <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#3395FF] font-bold flex items-center gap-1.5">
          <CreditCard className="w-4 h-4" /> LEG 1: RETAIL SETTLEMENT
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3395FF]/10 text-[#3395FF] font-mono border border-[#3395FF]/20">
          Razorpay PG
        </span>
      </div>

      {order?.razorpayPaymentLink ? (
        <div className="space-y-3">
          <div className="p-3.5 rounded-lg bg-[#0D0B0A] border border-[#332B25]">
            <p className="text-[11px] text-[#8C7A6B] font-mono">Total Settlement Amount</p>
            <p className="text-2xl font-bold font-mono text-[#EDE5DE] mt-0.5">
              ₹{order.agreedUnitPrice.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#332B25]/50 text-[10px] font-mono text-[#8C7A6B]">
              <span>ID: {order.orderId.substring(0, 18)}...</span>
              <span className="text-emerald-400 flex items-center gap-1 ml-auto">
                <ShieldCheck className="w-3 h-3" /> Link Verified
              </span>
            </div>
          </div>

          <a
            href={order.razorpayPaymentLink}
            target="_blank"
            rel="noreferrer"
            className="w-full bg-[#3395FF] hover:bg-[#2582eb] text-white font-medium text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            Open Sandbox Checkout <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <p className="text-[10px] text-[#8C7A6B] text-center font-mono">
            Autonomous Webhook Listener reconciles MySQL stock on capture
          </p>
        </div>
      ) : (
        <div className="py-10 text-center text-[#8C7A6B] text-xs">
          <p>No active settlement order.</p>
          <p className="text-[11px] mt-1 text-[#8C7A6B]/80 font-mono">Dispatched bids generate instant payment links here.</p>
        </div>
      )}
    </div>
  );
};