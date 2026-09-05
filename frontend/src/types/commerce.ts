export interface TraceItem {
  stage: string;
  message: string;
  data?: any;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  sender: 'BUYER' | 'MERCHANT' | 'SUPPLIER';
  message: string;
  price?: number;
  timestamp: string;
}

export interface SystemMetrics {
  stockAvailable: number;
  stockReserved: number;
  totalOrders: number;
  totalRevenueInr: number;
  pendingEscalations: number;
}

export interface CatalogItem {
  sku: string;
  name: string;
  msrp: number;
  inStock: boolean;
  availableUnits: number;
}

export interface AuditActionLog {
  id: string | number;
  orderId: string;
  agentRole: string;
  action: string;
  decision: string;
  reason: string;
  inputJson: any;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  orderId: string;
  actionRequested: string;
  financialImpactInr: number;
  reason: string;
  status: string;
  createdAt: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productName: string;
  sku: string;
}

export interface ProcurementOrderResult {
  orderId: string;
  sku: string;
  agreedUnitPrice: number;
  totalAmount: number;
  razorpayPaymentLink: string;
  paymentExecuted: boolean;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'ESCALATED';
}

export interface RestockExecution {
  supplier: string;
  sku: string;
  quantity: number;
  agreedUnitCost: number;
  totalPayout: number;
  utr: string;
  status: string;
}