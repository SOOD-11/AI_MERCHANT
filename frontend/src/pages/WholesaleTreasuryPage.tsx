import React, { useState } from 'react';
import { Landmark, ShieldCheck, Zap } from 'lucide-react';
import { useCommerce } from '../context/CommerceContext';

export const WholesaleTreasuryPage: React.FC = () => {
  const { metrics, executeWholesaleRestock, isProcessing, latestRestock } = useCommerce();
  const [restockQty, setRestockQty] = useState(10);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#191513] border border-[#332B25] rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#332B25] pb-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#EDE5DE] flex items-center gap-2">
              <Landmark className="w-5 h-5 text-emerald-400" />
              RazorpayX Wholesale Treasury Console
            </h2>
            <p className="text-xs text-[#8C7A6B] mt-1 font-mono">
              Automated B2B payout settlements for supply chain surges
            </p>
          </div>
          <div className="text-right font-mono">
            <span className="text-xs text-[#8C7A6B] block">On-Hand Warehouse Stock</span>
            <span className="text-xl font-bold text-amber-400">{metrics.stockAvailable} Units</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-[#0D0B0A] border border-[#332B25]">
            <span className="text-xs text-[#8C7A6B] font-mono">Virtual Source Account</span>
            <p className="text-sm font-mono text-[#D9C3B0] font-bold mt-1">2323230041518725</p>
          </div>
          <div className="p-4 rounded-lg bg-[#0D0B0A] border border-[#332B25]">
            <span className="text-xs text-[#8C7A6B] font-mono">Settlement Rail</span>
            <p className="text-sm font-mono text-[#EDE5DE] font-bold mt-1">IMPS / NEFT Dynamic</p>
          </div>
          <div className="p-4 rounded-lg bg-[#0D0B0A] border border-[#332B25]">
            <span className="text-xs text-[#8C7A6B] font-mono">Target Beneficiary</span>
            <p className="text-sm font-mono text-emerald-400 font-bold mt-1">Apex Global Micro</p>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[#241E1B] border border-[#594436] flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#D9C3B0] block">Trigger Autonomous Wholesale Sourcing</span>
            <span className="text-[11px] text-[#8C7A6B]">
              Simulates low-stock inventory deficit to trigger bilateral supplier negotiation and payout
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={restockQty}
              onChange={(e) => setRestockQty(Number(e.target.value))}
              min={1}
              className="w-16 bg-[#0D0B0A] border border-[#332B25] rounded p-2 text-xs font-mono text-center text-[#EDE5DE]"
            />
            <button
              onClick={() => executeWholesaleRestock('LAPTOP-PRO-15', restockQty)}
              disabled={isProcessing}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs font-mono rounded flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" /> Disburse Restock
            </button>
          </div>
        </div>
      </div>

      {latestRestock && (
        <div className="bg-[#191513] border border-emerald-900/40 rounded-xl p-6 shadow-xl">
          <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Latest Outbound Settlement Audit
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            <div>
              <span className="text-[#8C7A6B] block">Beneficiary</span>
              <span className="text-[#EDE5DE] font-bold">{latestRestock.supplier}</span>
            </div>
            <div>
              <span className="text-[#8C7A6B] block">Settled Amount</span>
              <span className="text-emerald-400 font-bold">₹{latestRestock.totalPayout.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-[#8C7A6B] block">Allocated Batch</span>
              <span className="text-[#D9C3B0] font-bold">+{latestRestock.quantity} Units</span>
            </div>
            <div>
              <span className="text-[#8C7A6B] block">Bank Reference UTR</span>
              <span className="text-emerald-300 font-bold">{latestRestock.utr}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};