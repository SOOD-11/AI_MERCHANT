import { Router, type Request, type Response } from 'express';
import { query } from '../db/connection.js';
import { processBuyerNegotiation } from '../agent/merchantAgent.js';
import type { BuyerNegotiationRequest } from '../agent/merchantAgent.js';
import { executeAutonomousRazorpayPayment } from '../agent/headlesspayer.js';
import { groq, GROQ_MODEL } from '../services/groqClient.js';
import { executeSupplierProcurement } from '../services/procurmentManagement.js';

export const agentRouter = Router();

// 1. Machine-Readable Agent Discovery Catalog
agentRouter.get('/.well-known/agent-commerce.json', async (_req: Request, res: Response) => {
  try {
    const merchantRows = await query<any[]>(`SELECT id, name, email FROM merchants LIMIT 1`);
    const merchant = merchantRows[0] || { id: 'merchant_apex_01', name: 'Apex Electronics', email: 'store@apex.test' };

    const productRows = await query<any[]>(
      `SELECT p.sku, p.name, p.msrp, i.quantity_available as stock 
       FROM products p 
       JOIN inventory i ON p.id = i.product_id`
    );

    res.json({
      protocolVersion: '1.0.0',
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
      },
      paymentRails: ['RAZORPAY_TEST_STANDARD', 'RAZORPAY_AGENTIC_DIRECT'],
      currency: 'INR',
      endpoints: {
        negotiate: '/api/v1/agent/negotiate',
      },
      catalog: productRows.map((item) => ({
        sku: item.sku,
        name: item.name,
        msrp: Number(item.msrp),
        inStock: item.stock > 0,
        availableUnits: item.stock,
      })),
    });
  } catch (error: any) {
    console.error('Error serving catalog:', error);
    res.status(500).json({ error: 'Internal Server Error fetching merchant catalog' });
  }
});

// 2. Transactional Negotiation Endpoint (Bilateral API-level call)
agentRouter.post('/api/v1/agent/negotiate', async (req: Request, res: Response) => {
  try {
    const { sku, quantity, offeredUnitPrice, buyerAgentId, previousCounterOffer } = req.body;

    if (!sku || !quantity || !offeredUnitPrice) {
      return res.status(400).json({
        error: 'Missing required fields: sku, quantity, and offeredUnitPrice are mandatory.',
      });
    }

    if (quantity <= 0 || offeredUnitPrice <= 0) {
      return res.status(400).json({
        error: 'Quantity and offeredUnitPrice must be positive numbers.',
      });
    }

    const payload: BuyerNegotiationRequest = {
      sku: String(sku).trim(),
      quantity: Number(quantity),
      offeredUnitPrice: Number(offeredUnitPrice),
      buyerAgentId: buyerAgentId ? String(buyerAgentId) : undefined,
      previousCounterOffer:
        previousCounterOffer !== undefined && previousCounterOffer !== null
          ? Number(previousCounterOffer)
          : undefined,
    };

    const decision = await processBuyerNegotiation(payload);
    return res.json(decision);
  } catch (error: any) {
    console.error('Error processing negotiation:', error);
    return res.status(500).json({
      status: 'REJECTED',
      reason: error.message || 'Internal server error processing agent request.',
    });
  }
});

// 3. Autonomous End-to-End Buyer Procurement Endpoint
agentRouter.post('/api/v1/agent/procure', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  const traces: any[] = [];
  const logTrace = (stage: string, message: string, data?: any) => {
    traces.push({ stage, message, data, timestamp: new Date().toISOString() });
    console.log(`[Buyer Agent - ${stage}]: ${message}`);
  };

  try {
    logTrace('INTENT_PARSING', `Parsing prompt: "${prompt}"`);

    // Step A: Natural language extraction via Groq
    const parseCompletion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an AI Procurement Specialist.
Analyze the user's purchase command and extract:
- skuQuery: Product search phrase (e.g. "laptop 15 inch")
- quantity: Integer count of items wanted
- maxBudgetPerUnit: Maximum INR the user is willing to pay per unit
- targetInitialBid: Reasonable starting counter-bid in INR (e.g. 10-15% below maxBudget)
- if the user does give nay inital or any range for price offer price with merchant msrp  for particluar sku that targeted
Respond ONLY with valid JSON:
{
  "skuQuery": string,
  "quantity": number,
  "maxBudgetPerUnit": number,
  "targetInitialBid": number
}`,
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const parsedIntent = JSON.parse(parseCompletion.choices[0]?.message?.content || '{}');
    logTrace('INTENT_EXTRACTED', `Extracted purchase parameters`, parsedIntent);

    // Step B: Match against merchant catalog
    const catalogRows = await query<any[]>(
      `SELECT p.sku, p.name, p.msrp, i.quantity_available as stock 
       FROM products p 
       JOIN inventory i ON p.id = i.product_id`
    );

    const matchCompletion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: `Select the best matching product SKU from the catalog for query: "${parsedIntent.skuQuery}".
Available catalog: ${JSON.stringify(catalogRows)}
Respond ONLY with JSON: { "selectedSku": string, "productName": string }`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const matchedProduct = JSON.parse(matchCompletion.choices[0]?.message?.content || '{}');
    const targetSku = matchedProduct.selectedSku;
    logTrace('CATALOG_MATCHED', `Matched SKU: ${targetSku} (${matchedProduct.productName})`);
const selectedProduct = catalogRows.find(
  product => product.sku === targetSku
);

if (!selectedProduct) {
  throw new Error(`Product ${targetSku} not found in merchant catalog`);
}

const msrp = Number(selectedProduct.msrp);

    let currentBid: number;
    let maxBudgetPerUnit: number;
const parsedBudget = Number(parsedIntent.maxBudgetPerUnit);
const parsedInitial = Number(parsedIntent.targetInitialBid);
const hasBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
const hasInitial = Number.isFinite(parsedInitial) && parsedInitial > 0;

if (hasBudget) {
  maxBudgetPerUnit = parsedBudget;
  currentBid = hasInitial ? parsedInitial : parsedBudget;
} else {
  maxBudgetPerUnit = msrp;
  currentBid = Math.round(msrp);
}
    let previousCounter: number | undefined = undefined;
    let round = 1;
    const maxRounds = 4;
    let finalNegotiationResult: any = null;

    while (round <= maxRounds) {
      logTrace('NEGOTIATION_BID', `Turn ${round}: Submitting bid of ₹${currentBid} for ${parsedIntent.quantity} units`);

      const negotiationResponse = await processBuyerNegotiation({
        sku: targetSku,
        quantity: parsedIntent.quantity,
        offeredUnitPrice: currentBid ,
        buyerAgentId: 'autonomous_corporate_buyer',
        previousCounterOffer: previousCounter, // Track state across turns
        buyerMessage: `Procurement requirement for ${parsedIntent.quantity} units.`,
      });

      logTrace('MERCHANT_DECISION', `Merchant returned: ${negotiationResponse.status}`, negotiationResponse);

      if (negotiationResponse.status === 'ACCEPTED') {
        finalNegotiationResult = negotiationResponse;
        break;
      }

      if (negotiationResponse.status === 'AWAITING_HUMAN_APPROVAL') {
        finalNegotiationResult = negotiationResponse;
        return res.json({
          status: 'ESCALATED',
          message: 'Order exceeded autonomous spend limit. Escalated for Merchant Human Approval.',
          approvalId: negotiationResponse.approvalId,
          traces,
        });
      }

      if (negotiationResponse.status === 'COUNTER_OFFER') {
        const counter = negotiationResponse.counterUnitPrice!;
        previousCounter = counter; // Save counter for turn context
        logTrace('EVALUATING_COUNTER', `Merchant countered with ₹${counter}`);

        if (counter <= parsedIntent.maxBudgetPerUnit) {
          logTrace('COUNTER_ACCEPTED', `Counter price ₹${counter} is within budget cap ₹${parsedIntent.maxBudgetPerUnit}. Matching counter.`);
          currentBid = counter;
        } else {
          // If counter is higher than max budget, meet in the middle up to maxBudget
          const concession = Math.min(
            parsedIntent.maxBudgetPerUnit,
            Math.round((currentBid + parsedIntent.maxBudgetPerUnit) / 2)
          );

          if (concession > currentBid) {
            logTrace('CONCESSION_OFFERED', `Countering higher: ₹${concession} (Capped at budget limit)`);
            currentBid = concession;
          } else {
            logTrace('WALK_AWAY', `Counter price ₹${counter} exceeds max budget cap of ₹${parsedIntent.maxBudgetPerUnit}.`);
            return res.json({
              status: 'FAILED',
              message: `Merchant refused to sell under your budget limit of ₹${parsedIntent.maxBudgetPerUnit}. Counter was ₹${counter}.`,
              traces,
            });
          }
        }
      }

      round++;
    }

    if (!finalNegotiationResult || finalNegotiationResult.status !== 'ACCEPTED') {
      return res.json({
        status: 'FAILED',
        message: 'Could not reach agreement within allowed negotiation turns.',
        traces,
      });
    }

    // Step D: Headless / API Settlement
    logTrace('PAYMENT_INITIATION', `Deal accepted. Triggering autonomous payment on Razorpay...`, {
      paymentLink: finalNegotiationResult.razorpayPaymentLink,
    });

    const paymentOutcome = await executeAutonomousRazorpayPayment(
      finalNegotiationResult.razorpayPaymentLink!
    );

    if (paymentOutcome.success) {
      logTrace('PAYMENT_COMPLETE', `Razorpay transaction successfully authorized and captured.`);

      // Sync Order status in MySQL
      if (finalNegotiationResult.orderId) {
        await query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [finalNegotiationResult.orderId]);
      }
    } else {
      logTrace('PAYMENT_WARNING', `Payment link created, but headless checkout encountered: ${paymentOutcome.error}`);
    }

    // Step E: Autonomous Leg 2 Check (Auto-Restock Trigger)
    let restockTriggered = false;
    let restockDetails: any = null;

    try {
      const stockCheck = await query<any[]>(
        `SELECT i.quantity_available as stock 
         FROM inventory i 
         JOIN products p ON i.product_id = p.id 
         WHERE p.sku = ? LIMIT 1`,
        [targetSku]
      );

      const remainingStock = stockCheck[0]?.stock ?? 0;
      logTrace('STOCK_AUDIT', `Remaining stock for ${targetSku}: ${remainingStock} units.`);

      // Trigger Leg 2 wholesale restock if remaining units <= 5
      if (remainingStock <= 5) {
        logTrace('RESTOCK_TRIGGERED', `Stock below threshold (${remainingStock} units remaining). Spawning Leg 2 Supplier Procurement.`);
        restockDetails = await executeSupplierProcurement({
          sku: targetSku,
          quantityNeeded: 10,
          triggerReason: 'STOCK_BELOW_THRESHOLD',
          marketCondition: 'NORMAL',
        });
        restockTriggered = true;
      }
    } catch (restockErr: any) {
      console.warn(`[Restock Handler Warning]:`, restockErr.message);
    }

    // Step F: Full audit trail response
    return res.json({
      status: 'SUCCESS',
      message: `Successfully procured ${parsedIntent.quantity}x ${targetSku} at ₹${finalNegotiationResult.agreedUnitPrice} each!`,
      orderId: finalNegotiationResult.orderId,
      agreedUnitPrice: finalNegotiationResult.agreedUnitPrice,
      totalAmount: finalNegotiationResult.totalAmount,
      razorpayPaymentLink: finalNegotiationResult.razorpayPaymentLink,
      paymentExecuted: paymentOutcome.success,
      restockTriggered,
      restockDetails: restockTriggered ? restockDetails : undefined,
      traces,
    });
  } catch (error: any) {
    console.error('Procurement error:', error);
    return res.status(500).json({
      status: 'ERROR',
      error: error.message || 'Failed to complete autonomous procurement cycle.',
      traces,
    });
  }
});

// 4. Standalone Wholesale Restock Endpoint
agentRouter.post('/api/v1/agent/restock', async (req: Request, res: Response) => {
  const { sku, quantity, marketCondition } = req.body;

  if (!sku) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  try {
    const result = await executeSupplierProcurement({
      sku: String(sku),
      quantityNeeded: quantity ? Number(quantity) : 10,
      triggerReason: 'STOCK_BELOW_THRESHOLD',
      marketCondition: marketCondition || 'SURGE_SHORTAGE',
    });

    return res.json({
      status: 'SUCCESS',
      message: `Autonomous wholesale negotiation resolved. Restocked ${result.quantity} units of ${sku}.`,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({ status: 'ERROR', error: error.message });
  }
});