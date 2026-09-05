import React from 'react';
import { Bot, Store, Factory } from 'lucide-react';
import type { ChatMessage } from '../../types/commerce';

export const NegotiationFeed: React.FC<{ logs: ChatMessage[] }> = ({ logs }) => {
  return (
    <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
      {logs.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8C7A6B]">
          <Bot className="w-8 h-8 mb-2 opacity-30 text-[#D9C3B0]" />
          <p>Multi-Agent War Room Idle.</p>
          <p className="text-[11px] mt-1">Submit a purchase command to view dynamic contract negotiation.</p>
        </div>
      ) : (
        logs.map((log) => {
          const isBuyer = log.sender === 'BUYER';
          const isMerchant = log.sender === 'MERCHANT';
          const isSupplier = log.sender === 'SUPPLIER';

          return (
            <div key={log.id} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 border ${
                  isBuyer
                    ? 'bg-[#14100E] border-[#332B25] text-[#EDE5DE]'
                    : isMerchant
                    ? 'bg-[#241E1B] border-[#594436] text-[#D9C3B0]'
                    : 'bg-[#181611] border-amber-900/40 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 pb-1 border-b border-[#332B25]/50">
                  <span className="font-mono text-[10px] font-bold flex items-center gap-1.5">
                    {isBuyer && <Bot className="w-3 h-3 text-[#3395FF]" />}
                    {isMerchant && <Store className="w-3 h-3 text-[#D9C3B0]" />}
                    {isSupplier && <Factory className="w-3 h-3 text-amber-400" />}
                    {log.sender}
                  </span>
                  <span className="text-[9px] text-[#8C7A6B] font-mono">{log.timestamp}</span>
                </div>
                <p className="leading-relaxed text-[12px] mt-1">{log.message}</p>
                {log.price && (
                  <div className="mt-2 text-[11px] font-mono inline-block px-2 py-0.5 rounded bg-[#0D0B0A] border border-[#332B25]">
                    Counter Offer: <span className="font-bold text-emerald-400">₹{log.price.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};