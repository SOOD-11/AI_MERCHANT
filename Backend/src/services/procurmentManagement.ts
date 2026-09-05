import { query } from '../db/connection.js';
import { randomUUID } from 'crypto';
import { RazorpayXService } from './razorpayXservice.js';
import { logAgentAction } from '../utils/auditLogger.js';
import { runSupplierTurn } from '../agent/supplierAgent.js';
import { runMerchantBuyerTurn } from '../agent/merchantBuyerAgent.js';

export interface ProcurementOptions {
  sku: string;
  quantityNeeded: number;
  triggerReason: 'STOCK_BELOW_THRESHOLD' | 'ORDER_SHORTAGE_IMMEDIATE';
  marketCondition?: 'NORMAL' | 'SURGE_SHORTAGE' | 'OVERSUPPLY';
}

export const executeSupplierProcurement = async (options: ProcurementOptions) => {
  const { sku, quantityNeeded, triggerReason, marketCondition = 'SURGE_SHORTAGE' } = options;
  const procurementId = `po_${randomUUID().slice(0, 8)}`;

  console.log(`\n======================================================`);
  console.log(`🤝 [LEG 2]: AI-TO-AI WHOLESALE PROCUREMENT INITIATED`);
  console.log(`📦 SKU: ${sku} | Qty: ${quantityNeeded} | Market State: ${marketCondition}`);
  console.log(`======================================================`);

  // 1. Fetch Supplier details from DB
  const supplierRows = await query<any[]>(
    `SELECT * FROM suppliers WHERE sku = ? LIMIT 1`,
    [sku]
  );
  if (!supplierRows || supplierRows.length === 0) {
    throw new Error(`No supplier found for SKU: ${sku}`);
  }
  const supplier = supplierRows[0];

  const baseWholesaleCost = Number(supplier.wholesale_cost); // e.g., 52,000
  const maxAffordableWholesaleCost = Math.round(baseWholesaleCost * 1.18); // Merchant can pay up to 18% more in a crunch

  // Dialogue histories
  const supplierHistory: any[] = [];
  const merchantHistory: any[] = [];
  const negotiationLog: any[] = [];

  // Opening bid from Merchant: Aggressive opening bid (5% below catalog)
  let currentMerchantBid = Math.round(baseWholesaleCost * 0.95);
  let agreedFinalCost: number | null = null;
  const maxTurns = 4;

  for (let turn = 1; turn <= maxTurns; turn++) {
    console.log(`\n--- [Turn ${turn}/${maxTurns}]: Negotiating Wholesale Price ---`);
    console.log(`💼 Merchant bids: ₹${currentMerchantBid.toLocaleString('en-IN')} / unit`);

    // --- Step A: Supplier AI evaluates the bid ---
    const supplierTurnResult = await runSupplierTurn({
      sku,
      quantity: quantityNeeded,
      offeredUnitCost: currentMerchantBid,
      baseWholesaleCost,
      marketCondition,
      turnNumber: turn,
      conversationHistory: supplierHistory,
    });

    supplierHistory.push(
      { role: 'user', content: `Merchant offered ₹${currentMerchantBid}` },
      { role: 'assistant', content: JSON.stringify(supplierTurnResult) }
    );

    console.log(`🏭 Supplier (${supplier.name}): ${supplierTurnResult.supplierMessage}`);

    negotiationLog.push({
      turn,
      merchantBid: currentMerchantBid,
      supplierDecision: supplierTurnResult.decision,
      supplierCounter: supplierTurnResult.counterUnitCost,
      supplierMessage: supplierTurnResult.supplierMessage,
      marketNote: supplierTurnResult.marketNote,
    });

    // Check if supplier accepted
    if (supplierTurnResult.decision === 'ACCEPTED') {
      agreedFinalCost = supplierTurnResult.agreedUnitCost || currentMerchantBid;
      console.log(`🎉 Deal Accepted by Supplier at ₹${agreedFinalCost.toLocaleString('en-IN')} / unit!`);
      break;
    }

    if (supplierTurnResult.decision === 'REJECTED') {
      console.log(`❌ Supplier terminated talks: ${supplierTurnResult.supplierMessage}`);
      break;
    }

    const supplierCounter = supplierTurnResult.counterUnitCost || Math.round(baseWholesaleCost * 1.08);
    console.log(`🏷️ Supplier counters with: ₹${supplierCounter.toLocaleString('en-IN')} / unit`);

    // --- Step B: Merchant AI evaluates the counter ---
    const merchantTurnResult = await runMerchantBuyerTurn({
      sku,
      quantity: quantityNeeded,
      lastSupplierCounter: supplierCounter,
      supplierMessage: supplierTurnResult.supplierMessage,
      targetWholesaleCost: baseWholesaleCost,
      maxAffordableWholesaleCost,
      turnNumber: turn,
      conversationHistory: merchantHistory,
    });

    merchantHistory.push(
      { role: 'user', content: `Supplier countered with ₹${supplierCounter}` },
      { role: 'assistant', content: JSON.stringify(merchantTurnResult) }
    );

    console.log(`💼 Merchant Buyer: ${merchantTurnResult.merchantMessage}`);

    if (merchantTurnResult.decision === 'ACCEPT') {
      agreedFinalCost = supplierCounter;
      console.log(`🎉 Deal Accepted by Merchant at ₹${agreedFinalCost.toLocaleString('en-IN')} / unit!`);
      break;
    }

    if (merchantTurnResult.decision === 'WALK_AWAY') {
      console.log(`🚪 Merchant walked away: price exceeds maximum viable ceiling.`);
      break;
    }

    // Update merchant bid for next turn
    currentMerchantBid = merchantTurnResult.newBidUnitCost || Math.round((currentMerchantBid + supplierCounter) / 2);
  }

  // Fallback settlement if agents converged near the close of turn 4
  if (!agreedFinalCost && currentMerchantBid <= maxAffordableWholesaleCost) {
    agreedFinalCost = currentMerchantBid;
    console.log(`🤝 Final compromise reached at turn limit: ₹${agreedFinalCost.toLocaleString('en-IN')} / unit`);
  }

  if (!agreedFinalCost) {
    throw new Error(`Wholesale negotiation failed to reach consensus. Lowest supplier quote was above procurement limit.`);
  }

  // 3. Execute Autonomous Outbound Disbursement via RazorpayX
  const totalCost = agreedFinalCost * quantityNeeded;
  console.log(`\n💳 Disbursing wholesale settlement of ₹${totalCost.toLocaleString('en-IN')} via RazorpayX...`);

  const payout = await RazorpayXService.disburseWholesalePayout({
    supplierName: supplier.name,
    bankAccount: supplier.bank_account,
    bankIfsc: supplier.bank_ifsc,
    amountInInr: totalCost,
    sku,
    quantity: quantityNeeded,
    referenceId: procurementId,
  });

  // 4. Save Procurement Order in DB
  await query(
    `INSERT INTO procurement_orders (id, supplier_id, sku, quantity, unit_cost, total_cost, payout_id, utr, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      procurementId,
      supplier.id,
      sku,
      quantityNeeded,
      agreedFinalCost,
      totalCost,
      payout.payoutId,
      payout.utr,
      payout.status,
    ]
  );

  // 5. Replenish Inventory
  await query(
    `UPDATE inventory i
     JOIN products p ON i.product_id = p.id
     SET i.quantity_available = i.quantity_available + ?
     WHERE p.sku = ?`,
    [quantityNeeded, sku]
  );

  await logAgentAction({
    agentRole: 'SUPPLIER_AGENT',
    action: 'WHOLESALE_NEGOTIATION_SETTLED',
    inputJson: { sku, quantityNeeded, agreedFinalCost, totalCost, utr: payout.utr },
    decision: 'INVENTORY_REPLENISHED',
    reason: `Negotiated wholesale deal at ₹${agreedFinalCost}/unit. Disbursed via RazorpayX (UTR: ${payout.utr}).`,
  });

  return {
    procurementId,
    supplier: supplier.name,
    sku,
    quantity: quantityNeeded,
    agreedUnitCost: agreedFinalCost,
    totalCost,
    payoutId: payout.payoutId,
    utr: payout.utr,
    status: payout.status,
    negotiationLog,
  };
};