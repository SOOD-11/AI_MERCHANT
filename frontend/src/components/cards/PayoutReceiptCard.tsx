import React from 'react';
import { Landmark, CheckCircle2 } from 'lucide-react';
import type { RestockExecution } from '../../types/commerce';

export const PayoutReceiptCard: React.FC<{ restock: RestockExecution | null }> = ({ restock }) => {
  return (
    <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
          <Landmark className="w-4 h-4" /> LEG 2: WHOLESALE DISBURSEMENT
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
          RazorpayX Banking
        </span>
      </div>

      {restock ? (
        <div className="space-y-3 font-mono text-xs">
          <div className="p-3.5 rounded-lg bg-[#0D0B0A] border border-emerald-900/30 space-y-2">
            <div className="flex justify-between">
              <span className="text-[#8C7A6B]">Beneficiary:</span>
              <span className="text-[#EDE5DE] font-medium">{restock.supplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8C7A6B]">Disbursed Sum:</span>
              <span className="text-emerald-400 font-bold">₹{restock.totalPayout.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8C7A6B]">Units Secured:</span>
              <span className="text-[#D9C3B0] font-bold">+{restock.quantity} Units</span>
            </div>
            <div className="pt-2 border-t border-[#332B25] flex justify-between text-[10px]">
              <span className="text-[#8C7A6B]">Banking UTR:</span>
              <span className="text-emerald-300 font-bold truncate max-w-[140px]">{restock.utr}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/20 p-2.5 rounded border border-emerald-900/30">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Automated bank transfer complete. Warehouse quota credited.</span>
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-[#8C7A6B] text-xs">
          <p>Wholesale Treasury Rail Idle.</p>
          <p className="text-[11px] mt-1 text-[#8C7A6B]/80 font-mono">
            Automatically executes when warehouse stock drops below threshold (≤5).
          </p>
        </div>
      )}
    </div>
  );
};