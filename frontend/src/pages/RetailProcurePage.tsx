import React, { useState } from 'react';
import { Sparkles, Send, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { useCommerce } from '../context/CommerceContext';
import { NegotiationFeed } from '../components/terminal/NegotiationFeed';
import { TraceTimeline } from '../components/terminal/TraceTimeline';
import { PaymentLinkCard } from '../components/cards/PaymentLinkCard';
import { PayoutReceiptCard } from '../components/cards/PayoutReceiptCard';

export const RetailProcurePage: React.FC = () => {
  const [prompt, setPrompt] = useState('I want to buy 1 laptop 15 inch in range of 55k to 80k. Try to get cheapest.');
  const { 
    executeRetailProcure, 
    isProcessing, 
    chatHistory, 
    traces, 
    activeOrder, 
    latestRestock,
    activeEscalation,
    decideApproval
  } = useCommerce();

  const handleRun = (custom?: string) => {
    const text = custom || prompt;
    if (text && !isProcessing) {
      executeRetailProcure(text);
    }
  };

  return (
    <div className="relative">
      {/* Human-in-the-Loop Governance Modal */}
      {activeEscalation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#191513] border border-amber-600/50 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-semibold text-base uppercase tracking-wider">Policy Engine Escalation</h3>
            </div>
            <p className="text-xs text-[#EDE5DE] leading-relaxed">
              {activeEscalation.message}
            </p>
            <div className="p-3 bg-[#0D0B0A] border border-[#332B25] rounded-lg font-mono text-xs text-[#8C7A6B]">
              <span>Approval ID: {activeEscalation.approvalId}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => decideApproval(activeEscalation.approvalId, 'APPROVED')}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs py-2.5 rounded transition-all"
              >
                Approve Exception
              </button>
              <button
                onClick={() => decideApproval(activeEscalation.approvalId, 'REJECTED')}
                className="flex-1 bg-[#241E1B] hover:bg-red-950/40 text-red-400 border border-red-900/50 font-semibold text-xs py-2.5 rounded transition-all"
              >
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Command */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider text-[#8C7A6B]">
                Autonomous Buyer Command
              </label>
              <Sparkles className="w-3.5 h-3.5 text-[#D9C3B0]" />
            </div>

            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[#0D0B0A] border border-[#332B25] rounded-lg p-3 text-sm text-[#EDE5DE] focus:outline-none focus:border-[#D9C3B0] transition-colors resize-none font-sans"
            />

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => {
                  const p = 'Buy 1 laptop 15 inch under 78000 INR. Target 70000 INR.';
                  setPrompt(p);
                  handleRun(p);
                }}
                className="text-[11px] px-2.5 py-1 rounded bg-[#241E1B] hover:bg-[#332B25] text-[#D9C3B0] border border-[#332B25] transition-all"
              >
                ⚡ Normal Order (₹70k-78k)
              </button>
              <button
                onClick={() => {
                  const p = 'Procure 10 units of Laptop Pro 15 inch for company team. Cap: 75000 INR.';
                  setPrompt(p);
                  handleRun(p);
                }}
                className="text-[11px] px-2.5 py-1 rounded bg-[#241E1B] hover:bg-[#332B25] text-amber-300 border border-[#332B25] transition-all"
              >
                📦 Force Shortage Restock (Leg 2)
              </button>
            </div>

            <button
              onClick={() => handleRun()}
              disabled={isProcessing}
              className="w-full mt-4 bg-[#D9C3B0] hover:bg-[#EDE5DE] text-[#0D0B0A] font-semibold text-xs tracking-wider uppercase py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing Dual-Leg Rails...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Dispatch Agent Directive
                </>
              )}
            </button>
          </div>

          <TraceTimeline traces={traces} />
        </div>

        {/* Center Column: War Room */}
        <div className="lg:col-span-5 flex flex-col bg-[#191513] border border-[#332B25] rounded-xl shadow-xl overflow-hidden h-[640px]">
          <div className="px-4 py-3 border-b border-[#332B25] bg-[#14100E] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-medium text-[#EDE5DE]">MULTI-AGENT NEGOTIATION STREAM</span>
            </div>
            <span className="text-[10px] font-mono text-[#8C7A6B]">Groq Llama 3 70B</span>
          </div>

          <NegotiationFeed logs={chatHistory} />

          <div className="p-3 border-t border-[#332B25] bg-[#14100E] flex items-center justify-between text-[11px] text-[#8C7A6B] font-mono">
            <span>Protocol: RFC-Agentic-Commerce-1.0</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#D9C3B0]" /> Live Sync Active
            </span>
          </div>
        </div>

        {/* Right Column: Rails */}
        <div className="lg:col-span-3 space-y-6">
          <PaymentLinkCard order={activeOrder} />
          <PayoutReceiptCard restock={latestRestock} />
        </div>
      </div>
    </div>
  );
};