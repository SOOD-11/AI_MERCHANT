import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  TraceItem,
  ChatMessage,
  SystemMetrics,
  ProcurementOrderResult,
  RestockExecution,
  ApprovalRequest
} from '../types/commerce';

interface CommerceContextType {
  metrics: SystemMetrics;
  activeOrder: ProcurementOrderResult | null;
  latestRestock: RestockExecution | null;
  traces: TraceItem[];
  chatHistory: ChatMessage[];
  pendingApprovals: ApprovalRequest[];
  isProcessing: boolean;
  activeEscalation: any | null;
  executeRetailProcure: (prompt: string) => Promise<void>;
  executeWholesaleRestock: (sku: string, quantity: number) => Promise<void>;
  decideApproval: (id: string, decision: 'APPROVED' | 'REJECTED') => Promise<void>;
  refreshTelemetry: () => Promise<void>;
}

const CommerceContext = createContext<CommerceContextType | null>(null);

export const CommerceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    stockAvailable: 0,
    stockReserved: 0,
    totalOrders: 0,
    totalRevenueInr: 0,
    pendingEscalations: 0,
  });

  const [activeOrder, setActiveOrder] = useState<ProcurementOrderResult | null>(null);
  const [latestRestock, setLatestRestock] = useState<RestockExecution | null>(null);
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [activeEscalation, setActiveEscalation] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const refreshTelemetry = useCallback(async () => {
    try {
      // 1. Fetch live metrics from your dashboardRouter
      const metricsRes = await fetch('http://localhost:3000/api/v1/dashboard/metrics');
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }

      // 2. Fetch pending human approvals
      const approvalsRes = await fetch('http://localhost:3000/api/v1/dashboard/approvals');
      if (approvalsRes.ok) {
        const approvals = await approvalsRes.json();
        setPendingApprovals(approvals);
      }
    } catch {
      // Server warming up or offline
    }
  }, []);

  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 4000); // Poll every 4 seconds
    return () => clearInterval(interval);
  }, [refreshTelemetry]);

  const executeRetailProcure = async (prompt: string) => {
    setIsProcessing(true);
    setTraces([]);
    setActiveEscalation(null);
    setChatHistory((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'BUYER',
        message: `Procurement Directive Dispatched: "${prompt}"`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const res = await fetch('http://localhost:3000/api/v1/agent/procure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (data.traces) {
        setTraces(data.traces);

        // Map backend decision traces to visible war-room dialogue
        const mappedMessages: ChatMessage[] = [];
        data.traces.forEach((t: TraceItem) => {
          if (t.stage === 'NEGOTIATION_BID') {
            mappedMessages.push({
              id: crypto.randomUUID(),
              sender: 'BUYER',
              message: t.message,
              timestamp: new Date(t.timestamp).toLocaleTimeString(),
            });
          } else if (t.stage === 'MERCHANT_DECISION' || t.stage === 'EVALUATING_COUNTER') {
            mappedMessages.push({
              id: crypto.randomUUID(),
              sender: 'MERCHANT',
              message: t.message,
              price: t.data?.counterUnitPrice,
              timestamp: new Date(t.timestamp).toLocaleTimeString(),
            });
          }
        });

        // Add Leg 2 restock messages if shortage was triggered
        if (data.restockTriggered) {
          mappedMessages.push({
            id: crypto.randomUUID(),
            sender: 'MERCHANT',
            message: '🚨 Low inventory buffer detected. Spawning Leg 2 Wholesale RFQ...',
            timestamp: new Date().toLocaleTimeString(),
          });
          mappedMessages.push({
            id: crypto.randomUUID(),
            sender: 'SUPPLIER',
            message: `Apex Global Micro-Distribution accepted restock batch. Outbound payout dispatched via RazorpayX. UTR: ${data.restockDetails?.utr || 'UTR99201948210'}`,
            price: data.restockDetails?.agreedUnitCost,
            timestamp: new Date().toLocaleTimeString(),
          });
        }

        if (mappedMessages.length > 0) {
          setChatHistory((prev) => [...prev, ...mappedMessages]);
        }
      }

      if (data.status === 'ESCALATED') {
        setActiveEscalation(data);
      } else if (data.status === 'SUCCESS') {
        setActiveOrder({
          orderId: data.orderId,
          sku: 'LAPTOP-PRO-15',
          agreedUnitPrice: data.agreedUnitPrice,
          totalAmount: data.totalAmount,
          razorpayPaymentLink: data.razorpayPaymentLink,
          paymentExecuted: data.paymentExecuted,
          status: 'PAID',
        });

        if (data.restockTriggered && data.restockDetails) {
          setLatestRestock({
            supplier: data.restockDetails.supplier || 'Apex Global Micro-Distribution',
            sku: 'LAPTOP-PRO-15',
            quantity: data.restockDetails.quantity || 10,
            agreedUnitCost: data.restockDetails.agreedUnitCost || 58500,
            totalPayout: data.restockDetails.totalPayout || 585000,
            utr: data.restockDetails.utr || 'UTR99201948210',
            status: 'PROCESSED',
          });
        }
      }
      await refreshTelemetry();
    } catch (err: any) {
      console.error('Procure request failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeWholesaleRestock = async (sku: string, quantity: number) => {
    setIsProcessing(true);
    try {
      const res = await fetch('http://localhost:3000/api/v1/agent/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, quantity, marketCondition: 'NORMAL' }),
      });

      const json = await res.json();
      if (json.status === 'SUCCESS' && json.data) {
        const d = json.data;
        setLatestRestock({
          supplier: d.supplier || 'Apex Global Micro-Distribution',
          sku: sku,
          quantity: d.quantity || quantity,
          agreedUnitCost: d.agreedUnitCost || 58500,
          totalPayout: d.totalPayout || (d.quantity * d.agreedUnitCost),
          utr: d.utr || 'UTR78291048201',
          status: 'PROCESSED',
        });
      }
      await refreshTelemetry();
    } finally {
      setIsProcessing(false);
    }
  };

  const decideApproval = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await fetch(`http://localhost:3000/api/v1/dashboard/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setActiveEscalation(null);
      await refreshTelemetry();
    } catch (err) {
      console.error('Approval decision error:', err);
    }
  };

  return React.createElement(
    CommerceContext.Provider,
    {
      value: {
        metrics,
        activeOrder,
        latestRestock,
        traces,
        chatHistory,
        pendingApprovals,
        isProcessing,
        activeEscalation,
        executeRetailProcure,
        executeWholesaleRestock,
        decideApproval,
        refreshTelemetry,
      },
    },
    children,
  );
};

export const useCommerce = () => {
  const context = useContext(CommerceContext);
  if (!context) throw new Error('useCommerce must be used within CommerceProvider');
  return context;
};