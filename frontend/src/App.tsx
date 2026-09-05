import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Store, 
  Send, 
  CheckCircle2, 
  ExternalLink, 
  CreditCard, 
  Landmark, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  Loader2, 
  Boxes, 
  ShieldCheck, 
  PackageCheck,
  Activity,
  ShoppingBag,
  TrendingUp,
  Clock,
  DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ChatMessage {
  id: string;
  sender: 'BUYER' | 'MERCHANT' | 'SUPPLIER';
  message: string;
  price?: number;
  timestamp: string;
}

interface MerchantActivityLog {
  id: string;
  title: string;
  detail: string;
  type: 'ORDER' | 'STOCK' | 'MARGIN' | 'PAYOUT' | 'APPROVAL';
  timestamp: string;
}

export default function App() {
  const [activeView, setActiveView] = useState<'BUYER' | 'MERCHANT'>('BUYER');

  // Buyer State
  const [prompt, setPrompt] = useState('I want to buy 1 laptop 15 inch under 78k. Try to get cheapest.');
  const [loading, setLoading] = useState(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [isOrderPaid, setIsOrderPaid] = useState<boolean>(false);

  // Merchant State
  const [merchantActivities, setMerchantActivities] = useState<MerchantActivityLog[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [approvalsList, setApprovalsList] = useState<any[]>([]);
  const [restockNotice, setRestockNotice] = useState<any | null>(null);
  const [escalation, setEscalation] = useState<any | null>(null);

  // Telemetry Metrics
  const [metrics, setMetrics] = useState({
    stockAvailable: 10,
    stockReserved: 0,
    totalOrders: 0,
    totalRevenueInr: 0,
    pendingEscalations: 0,
  });

  const activeOrderIdRef = useRef<string | null>(null);

  // Helper to log merchant actions
  const logMerchantAction = (title: string, detail: string, type: MerchantActivityLog['type']) => {
    setMerchantActivities((prev) => [
      {
        id: crypto.randomUUID(),
        title,
        detail,
        type,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 29), // keep last 30
    ]);
  };

  // Sync System Telemetry & Orders
  const fetchDashboardData = async () => {
    try {
      const metricRes = await fetch('http://localhost:3000/api/v1/dashboard/metrics');
      if (metricRes.ok) {
        const data = await metricRes.json();
        setMetrics(data);
      }

      const approvalRes = await fetch('http://localhost:3000/api/v1/dashboard/approvals');
      if (approvalRes.ok) {
        const apps = await approvalRes.json();
        setApprovalsList(apps);
      }

      const auditRes = await fetch('http://localhost:3000/api/v1/dashboard/audit-logs');
      if (auditRes.ok) {
        const logs = await auditRes.json();
        setRecentOrders(logs.slice(0, 8));
      }
    } catch {
      // Backend polling fallback
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll Order Payment Status (for Buyer Cockpit)
  useEffect(() => {
    if (!activeOrder?.orderId || isOrderPaid) return;

    activeOrderIdRef.current = activeOrder.orderId;
    const pollPaymentStatus = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/v1/agent/orders/${activeOrder.orderId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'paid') {
            setIsOrderPaid(true);
            logMerchantAction(
              'Webhook Captured Payment', 
              `Order ${activeOrder.orderId.slice(0, 8)}... marked PAID. Deducting MySQL warehouse stock.`, 
              'ORDER'
            );
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#22C55E', '#D9C3B0', '#3395FF']
            });
            fetchDashboardData();
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    const statusTimer = setInterval(pollPaymentStatus, 2000);
    return () => clearInterval(statusTimer);
  }, [activeOrder?.orderId, isOrderPaid]);

  // Execute Buyer Procurement
  const handleProcure = async (overridePrompt?: string) => {
    const text = overridePrompt || prompt;
    if (!text || loading) return;

    setLoading(true);
    setActiveOrder(null);
    setIsOrderPaid(false);
    setRestockNotice(null);
    setEscalation(null);

    logMerchantAction('Inbound RFQ Received', `Buyer Agent dispatched request: "${text}"`, 'ORDER');

    setChatLog([
      {
        id: crypto.randomUUID(),
        sender: 'BUYER',
        message: `Dispatched requirement: "${text}"`,
        timestamp: new Date().toLocaleTimeString(),
      }
    ]);

    try {
      const res = await fetch('http://localhost:3000/api/v1/agent/procure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      const data = await res.json();

      if (data.traces) {
        const incomingMsgs: ChatMessage[] = [];
        data.traces.forEach((t: any) => {
          if (t.stage === 'INTENT_EXTRACTED') {
            logMerchantAction('Intent Parsed', `Target budget: ₹${t.data?.maxBudgetPerUnit || 'N/A'}, Qty: ${t.data?.quantity || 1}`, 'ORDER');
          }
          if (t.stage === 'CATALOG_MATCHED') {
            logMerchantAction('Catalog Matched & Stock Audit', `Audited inventory for SKU: ${t.message}`, 'STOCK');
          }
          if (t.stage === 'NEGOTIATION_BID') {
            incomingMsgs.push({
              id: crypto.randomUUID(),
              sender: 'BUYER',
              message: t.message,
              timestamp: new Date(t.timestamp).toLocaleTimeString(),
            });
          } else if (t.stage === 'MERCHANT_DECISION' || t.stage === 'EVALUATING_COUNTER') {
            logMerchantAction('Commercial Decision Formulated', `${t.message}`, 'MARGIN');
            incomingMsgs.push({
              id: crypto.randomUUID(),
              sender: 'MERCHANT',
              message: t.message,
              price: t.data?.counterUnitPrice,
              timestamp: new Date(t.timestamp).toLocaleTimeString(),
            });
          }
        });

        if (data.restockTriggered) {
          logMerchantAction(
            'Shortage Buffer Reached', 
            `Stock ≤ 5 units. Auto-disbursed wholesale procurement via RazorpayX.`, 
            'PAYOUT'
          );
          incomingMsgs.push({
            id: crypto.randomUUID(),
            sender: 'MERCHANT',
            message: '🚨 Low inventory buffer detected! Spawning Leg 2 Wholesale RFQ to Tier-1 Supplier...',
            timestamp: new Date().toLocaleTimeString(),
          });
          incomingMsgs.push({
            id: crypto.randomUUID(),
            sender: 'SUPPLIER',
            message: `Apex Global Micro-Distribution confirmed batch allocation. Outbound payout dispatched via RazorpayX. UTR: ${data.restockDetails?.utr || 'UTR99281204812'}`,
            price: data.restockDetails?.agreedUnitCost,
            timestamp: new Date().toLocaleTimeString(),
          });
        }

        if (incomingMsgs.length > 0) setChatLog(incomingMsgs);
      }

      if (data.status === 'ESCALATED') {
        logMerchantAction('Policy Escalation Triggered', `Order exceeded spend limits. Awaiting human operator approval.`, 'APPROVAL');
        setEscalation(data);
        setActiveView('MERCHANT');
      } else if (data.status === 'SUCCESS') {
        logMerchantAction('Payment Link Dispatched', `Deal locked at ₹${data.agreedUnitPrice}/unit. Razorpay link issued.`, 'MARGIN');
        setActiveOrder({
          orderId: data.orderId,
          agreedUnitPrice: data.agreedUnitPrice,
          totalAmount: data.totalAmount,
          razorpayPaymentLink: data.razorpayPaymentLink,
        });

        if (data.restockTriggered && data.restockDetails) {
          setRestockNotice(data.restockDetails);
        }
      }

      await fetchDashboardData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`http://localhost:3000/api/v1/dashboard/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        logMerchantAction('Approval Decision Recorded', `Operator marked escalation as ${decision}.`, 'APPROVAL');
        setEscalation(null);
        await fetchDashboardData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0B0A] text-[#EDE5DE] font-sans antialiased flex flex-col">
      {/* Top Telemetry Header */}
      <header className="border-b border-[#332B25] bg-[#14100E] px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#332B25] flex items-center justify-center border border-[#594436]">
              <Boxes className="w-5 h-5 text-[#D9C3B0]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-[#EDE5DE] flex items-center gap-2">
                APEX AUTONOMOUS COMMERCE
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#332B25] text-[#D9C3B0] font-mono">
                  DUAL-LEG RAILS
                </span>
              </h1>
              <p className="text-[11px] text-[#8C7A6B]">Autonomous Retail Negotiation × Razorpay Settlement</p>
            </div>
          </div>

          {/* Perspective Switcher */}
          <div className="flex items-center bg-[#0D0B0A] p-1 rounded-lg border border-[#332B25]">
            <button
              onClick={() => setActiveView('BUYER')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
                activeView === 'BUYER' 
                  ? 'bg-[#241E1B] text-[#D9C3B0] font-bold border border-[#594436]' 
                  : 'text-[#8C7A6B] hover:text-[#EDE5DE]'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-[#3395FF]" /> Buyer Agent Cockpit
            </button>
            <button
              onClick={() => setActiveView('MERCHANT')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-mono transition-all relative ${
                activeView === 'MERCHANT' 
                  ? 'bg-[#241E1B] text-[#D9C3B0] font-bold border border-[#594436]' 
                  : 'text-[#8C7A6B] hover:text-[#EDE5DE]'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-amber-400" /> Merchant Command Desk
              {approvalsList.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute -top-1 -right-1" />
              )}
            </button>
          </div>

          {/* Real-time DB Counters */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-md bg-[#191513] border border-[#332B25]">
              <span className="text-[#8C7A6B]">WH Stock: </span>
              <span className={`font-bold ${metrics.stockAvailable <= 5 ? 'text-amber-400' : 'text-[#D9C3B0]'}`}>
                {metrics.stockAvailable} Units
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-[#191513] border border-[#332B25]">
              <span className="text-[#8C7A6B]">Settled Rev: </span>
              <span className="text-emerald-400 font-bold">₹{metrics.totalRevenueInr.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 flex-1 w-full">
        {/* ========================================================
            VIEW 1: BUYER AGENT COCKPIT
           ======================================================== */}
        {activeView === 'BUYER' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Prompt Column */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
                <label className="text-xs font-mono uppercase tracking-wider text-[#8C7A6B] block mb-2 flex items-center justify-between">
                  <span>Enter Procurement Request</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#D9C3B0]" />
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Buy 1 laptop under 75k..."
                  className="w-full bg-[#0D0B0A] border border-[#332B25] rounded-lg p-3 text-sm text-[#EDE5DE] placeholder-[#8C7A6B] focus:outline-none focus:border-[#D9C3B0] transition-colors resize-none"
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => {
                      const p = 'Buy 1 laptop 15 inch under 78000 INR. Target 70000 INR.';
                      setPrompt(p);
                      handleProcure(p);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded bg-[#241E1B] hover:bg-[#332B25] text-[#D9C3B0] border border-[#332B25] transition-all"
                  >
                    ⚡ Normal Deal (₹70k-78k)
                  </button>
                  <button
                    onClick={() => {
                      const p = 'Procure 10 units of Laptop Pro 15 inch for team deployment.';
                      setPrompt(p);
                      handleProcure(p);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded bg-[#241E1B] hover:bg-[#332B25] text-amber-300 border border-[#332B25] transition-all"
                  >
                    📦 Force Shortage (Auto-Restock)
                  </button>
                </div>

                <button
                  onClick={() => handleProcure()}
                  disabled={loading}
                  className="w-full mt-4 bg-[#D9C3B0] hover:bg-[#EDE5DE] text-[#0D0B0A] font-semibold text-xs tracking-wider uppercase py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Negotiating with Merchant...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Authorize Buyer Agent
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#191513] border border-[#332B25] text-xs text-[#8C7A6B] font-mono space-y-2">
                <span className="text-[#D9C3B0] font-bold block">Autonomous Procurement Pipeline</span>
                <p>• Step 1: Real-time price negotiation protects both merchant margin and buyer budget.</p>
                <p>• Step 2: Instant Razorpay link issued without exposing corporate credentials.</p>
                <p>• Step 3: Webhook listener flips status to PAID and decrements inventory automatically.</p>
              </div>
            </div>

            {/* Center: Live Agent-to-Agent War Room */}
            <div className="lg:col-span-5 flex flex-col bg-[#191513] border border-[#332B25] rounded-xl shadow-xl overflow-hidden h-[600px]">
              <div className="px-4 py-3 border-b border-[#332B25] bg-[#14100E] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-medium text-[#EDE5DE]">LIVE AGENT-TO-AGENT WAR ROOM</span>
                </div>
                <span className="text-[10px] font-mono text-[#8C7A6B]">Groq Llama 3 70B</span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
                {chatLog.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8C7A6B]">
                    <Bot className="w-8 h-8 mb-2 opacity-30 text-[#D9C3B0]" />
                    <p>Agent Idle. Dispatch a command to start live negotiation.</p>
                  </div>
                ) : (
                  chatLog.map((chat) => {
                    const isBuyer = chat.sender === 'BUYER';
                    const isMerchant = chat.sender === 'MERCHANT';
                    const isSupplier = chat.sender === 'SUPPLIER';

                    return (
                      <div key={chat.id} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-lg p-3 border ${
                          isBuyer 
                            ? 'bg-[#14100E] border-[#332B25] text-[#EDE5DE]' 
                            : isMerchant 
                            ? 'bg-[#241E1B] border-[#594436] text-[#D9C3B0]' 
                            : 'bg-[#1C1A14] border-amber-900/40 text-amber-200'
                        }`}>
                          <div className="flex items-center justify-between gap-4 mb-1 pb-1 border-b border-[#332B25]/50">
                            <span className="font-mono text-[10px] font-bold flex items-center gap-1.5">
                              {isBuyer && <Bot className="w-3 h-3 text-[#3395FF]" />}
                              {isMerchant && <Store className="w-3 h-3 text-[#D9C3B0]" />}
                              {isSupplier && <Boxes className="w-3 h-3 text-amber-400" />}
                              {chat.sender}
                            </span>
                            <span className="text-[9px] text-[#8C7A6B] font-mono">{chat.timestamp}</span>
                          </div>
                          <p className="leading-relaxed text-[12px] mt-1">{chat.message}</p>
                          {chat.price && (
                            <div className="mt-2 text-[11px] font-mono inline-block px-2 py-0.5 rounded bg-[#0D0B0A] border border-[#332B25]">
                              Agreed Target: <span className="font-bold text-emerald-400">₹{chat.price.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Payment Settlement Card (With Live Paid State) */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#3395FF] font-bold flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> CHECKOUT SETTLEMENT
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3395FF]/10 text-[#3395FF] font-mono">
                    Razorpay Rail
                  </span>
                </div>

                {activeOrder ? (
                  <div className="space-y-4">
                    {/* Live State Flash Banner */}
                    {isOrderPaid ? (
                      <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500 text-emerald-300 text-xs flex items-center gap-2 animate-pulse">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-emerald-400">Payment Confirmed & Settled!</p>
                          <p className="text-[11px] text-emerald-300/90 mt-0.5">
                            Webhook verified. Database inventory updated in MySQL.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800 text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <div>
                          <p className="font-bold">Deal Accepted by Merchant!</p>
                          <p className="text-[11px] text-emerald-300/80">Authorized link issued. Complete checkout below:</p>
                        </div>
                      </div>
                    )}

                    <div className="p-3.5 rounded-lg bg-[#0D0B0A] border border-[#332B25]">
                      <span className="text-[11px] text-[#8C7A6B] font-mono block">Final Negotiated Price</span>
                      <p className="text-2xl font-bold font-mono text-[#EDE5DE] mt-1">
                        ₹{activeOrder.agreedUnitPrice.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-[#8C7A6B] font-mono truncate mt-1">
                        Ref: {activeOrder.orderId}
                      </p>
                    </div>

                    {!isOrderPaid ? (
                      <a
                        href={activeOrder.razorpayPaymentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-[#3395FF] hover:bg-[#2582eb] text-white font-semibold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
                      >
                        Authorize Payment on Razorpay <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <div className="p-2.5 rounded bg-[#241E1B] border border-emerald-800/40 text-center font-mono text-xs text-emerald-400">
                        ✓ Order Fully Paid & Fulfilled
                      </div>
                    )}

                    <p className="text-[10px] text-[#8C7A6B] text-center font-mono">
                      {isOrderPaid ? 'Receipt synced with internal ledger' : 'Awaiting payment confirmation via Razorpay Webhook...'}
                    </p>
                  </div>
                ) : (
                  <div className="py-12 text-center text-[#8C7A6B] text-xs">
                    <p>No active checkout link.</p>
                    <p className="text-[10px] mt-1 font-mono">When negotiation concludes, link appears here immediately.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 2: MERCHANT COMMAND DESK (LIVE OPERATIONAL HUB)
           ======================================================== */}
        {activeView === 'MERCHANT' && (
          <div className="space-y-6">
            {/* Top Alert Banner for Human Action Required */}
            {approvalsList.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-5 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-900/50 text-amber-300">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-300">Action Required: Policy Exception Escalated</h3>
                    <p className="text-xs text-[#EDE5DE]/80 mt-0.5">
                      Order exceeded automatic spend limit or margin bounds. Operator decision requested.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleApproval(approvalsList[0].id, 'APPROVED')}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs font-mono rounded transition-all"
                  >
                    Approve Deal
                  </button>
                  <button
                    onClick={() => handleApproval(approvalsList[0].id, 'REJECTED')}
                    className="px-4 py-2 bg-[#241E1B] hover:bg-red-950 text-red-400 border border-red-900 font-semibold text-xs font-mono rounded transition-all"
                  >
                    Reject Order
                  </button>
                </div>
              </div>
            )}

            {/* Merchant Metrics Overview Strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#191513] border border-[#332B25]">
                <div className="flex items-center justify-between text-[#8C7A6B] text-xs font-mono">
                  <span>Warehouse Available</span>
                  <Boxes className="w-4 h-4 text-[#D9C3B0]" />
                </div>
                <p className="text-xl font-bold font-mono text-[#EDE5DE] mt-1">{metrics.stockAvailable} Units</p>
                <span className="text-[10px] text-emerald-400 font-mono">Live in MySQL inventory</span>
              </div>

              <div className="p-4 rounded-xl bg-[#191513] border border-[#332B25]">
                <div className="flex items-center justify-between text-[#8C7A6B] text-xs font-mono">
                  <span>Reserved Inventory</span>
                  <PackageCheck className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-xl font-bold font-mono text-amber-400 mt-1">{metrics.stockReserved} Units</p>
                <span className="text-[10px] text-[#8C7A6B] font-mono">Held during checkout</span>
              </div>

              <div className="p-4 rounded-xl bg-[#191513] border border-[#332B25]">
                <div className="flex items-center justify-between text-[#8C7A6B] text-xs font-mono">
                  <span>Gross Settled Volume</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">₹{metrics.totalRevenueInr.toLocaleString('en-IN')}</p>
                <span className="text-[10px] text-emerald-400 font-mono">Captured via Razorpay Webhook</span>
              </div>

              <div className="p-4 rounded-xl bg-[#191513] border border-[#332B25]">
                <div className="flex items-center justify-between text-[#8C7A6B] text-xs font-mono">
                  <span>Policy Status</span>
                  <ShieldCheck className="w-4 h-4 text-[#D9C3B0]" />
                </div>
                <p className="text-xl font-bold font-mono text-[#D9C3B0] mt-1">
                  {metrics.pendingEscalations > 0 ? `${metrics.pendingEscalations} Queued` : '100% Compliant'}
                </p>
                <span className="text-[10px] text-[#8C7A6B] font-mono">15% Min Gross Margin Floor</span>
              </div>
            </div>

            {/* Operational Feeds: Live Activity Feed + Restock Notice */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Merchant Live Activity Stream */}
              <div className="lg:col-span-7 bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl flex flex-col h-[440px]">
                <div className="flex items-center justify-between pb-3 border-b border-[#332B25] mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-mono font-semibold text-[#EDE5DE] uppercase tracking-wider">
                      Merchant Operational Moments & Audit Trail
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#8C7A6B]">Streaming Real-Time</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 font-mono text-xs pr-1">
                  {merchantActivities.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8C7A6B]">
                      <Clock className="w-7 h-7 mb-2 opacity-30 text-[#D9C3B0]" />
                      <p>Operational stream idle.</p>
                      <p className="text-[10px] mt-1">Inbound RFQs, margin audits, stock deductions, and settlements will appear here.</p>
                    </div>
                  ) : (
                    merchantActivities.map((act) => (
                      <div key={act.id} className="p-3 rounded-lg bg-[#0D0B0A] border border-[#332B25] flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              act.type === 'ORDER' ? 'bg-[#3395FF]' :
                              act.type === 'STOCK' ? 'bg-amber-400' :
                              act.type === 'PAYOUT' ? 'bg-emerald-400' :
                              act.type === 'MARGIN' ? 'bg-[#D9C3B0]' : 'bg-red-400'
                            }`} />
                            <span className="font-bold text-[#EDE5DE] text-[11px]">{act.title}</span>
                          </div>
                          <p className="text-[#8C7A6B] text-[11px] pl-4">{act.detail}</p>
                        </div>
                        <span className="text-[10px] text-[#8C7A6B] shrink-0">{act.timestamp}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right: Leg 2 Autonomous Restock & Outbound Payout Card */}
              <div className="lg:col-span-5 bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-[#332B25] pb-3 mb-4">
                    <h3 className="text-xs font-mono font-semibold text-[#EDE5DE] flex items-center gap-2 uppercase tracking-wider">
                      <Landmark className="w-4 h-4 text-emerald-400" />
                      Leg 2: Wholesale Payout (RazorpayX)
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono border border-emerald-900">
                      Autonomous
                    </span>
                  </div>

                  {restockNotice ? (
                    <div className="space-y-3 font-mono text-xs">
                      <div className="p-4 rounded-lg bg-[#0D0B0A] border border-emerald-900/40 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-[#8C7A6B]">Shortage Trigger:</span>
                          <span className="text-amber-400 font-bold">Stock reached threshold</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8C7A6B]">Wholesale Supplier:</span>
                          <span className="text-[#EDE5DE]">{restockNotice.supplier}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8C7A6B]">Disbursed Amount:</span>
                          <span className="text-emerald-400 font-bold">₹{restockNotice.totalPayout?.toLocaleString('en-IN') || '5,85,000'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#8C7A6B]">Transfer Rail:</span>
                          <span className="text-[#D9C3B0]">NEFT Automated (RazorpayX)</span>
                        </div>
                        <div className="pt-2 border-t border-[#332B25] flex justify-between text-[11px]">
                          <span className="text-[#8C7A6B]">Bank UTR:</span>
                          <span className="text-emerald-300 font-bold">{restockNotice.utr}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/20 p-2.5 rounded border border-emerald-900/30">
                        <PackageCheck className="w-4 h-4 shrink-0" />
                        <span>10 units replenished to MySQL inventory automatically.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-[#8C7A6B] text-xs">
                      <p>Wholesale Restock Rail Idle.</p>
                      <p className="text-[11px] mt-1 font-mono">
                        Whenever warehouse stock drops to ≤ 5 units, the Merchant Agent automatically negotiates wholesale replenishment and disburses via RazorpayX.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#332B25] flex items-center justify-between text-[10px] text-[#8C7A6B] font-mono">
                  <span>Vault: 2323230041518725</span>
                  <span>IMPS / NEFT Auto-Switch</span>
                </div>
              </div>
            </div>

            {/* Bottom: Recent MySQL Orders Table */}
            <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#8C7A6B] mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#D9C3B0]" />
                Recent Orders & Settlement Log (From Table: `orders`)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-[#332B25] text-[#8C7A6B]">
                      <th className="pb-2.5">ORDER ID</th>
                      <th className="pb-2.5">ROLE</th>
                      <th className="pb-2.5">ACTION</th>
                      <th className="pb-2.5">DECISION</th>
                      <th className="pb-2.5 text-right">TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#332B25]/50 text-[#EDE5DE]">
                    {recentOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-[#8C7A6B]">
                          No orders recorded in database yet.
                        </td>
                      </tr>
                    ) : (
                      recentOrders.map((ord: any) => (
                        <tr key={ord.id} className="hover:bg-[#241E1B]/50 transition-colors">
                          <td className="py-2.5 text-[#D9C3B0] font-bold">{ord.orderId ? ord.orderId.slice(0, 16) : 'ORD-N/A'}...</td>
                          <td className="py-2.5 text-[#8C7A6B]">{ord.agentRole}</td>
                          <td className="py-2.5">{ord.action}</td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              ord.decision === 'ACCEPTED' || ord.decision === 'CAPTURED'
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                                : 'bg-[#0D0B0A] text-amber-300 border border-[#332B25]'
                            }`}>
                              {ord.decision}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-[#8C7A6B]">
                            {new Date(ord.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}