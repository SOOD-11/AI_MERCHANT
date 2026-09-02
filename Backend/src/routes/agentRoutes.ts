import { Router, type Request, type Response } from 'express';
import { query } from '../db/connection.js';
import { processBuyerNegotiation } from '../agent/merchantAgent.js';

import type { BuyerNegotiationRequest } from '../agent/merchantAgent.js';
import { executeAutonomousRazorpayPayment } from '../agent/headlesspayer.js';
import { groq, GROQ_MODEL } from '../services/groqClient.js';
export const agentRouter = Router();

// Machine-Readable Agent Discovery Catalog
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

// Transactional Negotiation Endpoint
// Transactional Negotiation Endpoint
agentRouter.post(
  '/api/v1/agent/negotiate',
  async (req: Request, res: Response) => {

    try {

      const {
        sku,
        quantity,
        offeredUnitPrice,
        buyerAgentId,
        previousCounterOffer
      } = req.body;

      // ============================================
      // 1. BASIC VALIDATION
      // ============================================

      if (!sku || !quantity || !offeredUnitPrice) {

        return res.status(400).json({
          error:
            'Missing required fields: sku, quantity, and offeredUnitPrice are mandatory.',
        });

      }

      if (
        quantity <= 0 ||
        offeredUnitPrice <= 0
      ) {

        return res.status(400).json({
          error:
            'Quantity and offeredUnitPrice must be positive numbers.',
        });

      }

      // ============================================
      // 2. BUILD NEGOTIATION REQUEST
      // ============================================

      const payload: BuyerNegotiationRequest = {

        sku: String(sku).trim(),

        quantity: Number(quantity),

        offeredUnitPrice:
          Number(offeredUnitPrice),

        buyerAgentId:
          buyerAgentId
            ? String(buyerAgentId)
            : undefined,

        // IMPORTANT:
        // Pass the previous merchant counter
        // into the negotiation engine.
        previousCounterOffer:
          previousCounterOffer !== undefined &&
          previousCounterOffer !== null
            ? Number(previousCounterOffer)
            : undefined,
      };

      // ============================================
      // 3. PROCESS NEGOTIATION
      // ============================================

      const decision =
        await processBuyerNegotiation(payload);

        console.log(decision);
      return res.json(decision);

    } catch (error: any) {

      console.error(
        'Error processing negotiation:',
        error
      );

      return res.status(500).json({

        status: 'REJECTED',

        reason:
          error.message ||
          'Internal server error processing agent request.',

      });

    }
  }
);


// 3. NEW: Autonomous Buyer Procurement Endpoint
// Accepts natural language prompt -> Negotiates -> Pays on Razorpay -> Returns outcome
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

    // Step A: Parse natural language into structured parameters using Groq
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

Respond ONLY with valid JSON matching:
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

    // Step B: Discover merchant catalog from database
    const catalogRows = await query<any[]>(
      `SELECT p.sku, p.name, p.msrp, i.quantity_available as stock 
       FROM products p 
       JOIN inventory i ON p.id = i.product_id`
    );

    // Groq matches the user query to the best matching product SKU
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

    // Step C: Autonomous Negotiation Loop
    let currentBid = parsedIntent.targetInitialBid;
    let round = 1;
    const maxRounds = 3;
    let finalNegotiationResult: any = null;

    while (round <= maxRounds) {
      logTrace('NEGOTIATION_BID', `Turn ${round}: Submitting bid of ₹${currentBid} for ${parsedIntent.quantity} units`);

      const negotiationResponse = await processBuyerNegotiation({
        sku: targetSku,
        quantity: parsedIntent.quantity,
        offeredUnitPrice: currentBid,
        buyerAgentId: 'autonomous_corporate_buyer',
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
        logTrace('EVALUATING_COUNTER', `Merchant countered with ₹${counter}`);

        if (counter <= parsedIntent.maxBudgetPerUnit) {
          logTrace('COUNTER_ACCEPTED', `Counter price ₹${counter} is within budget cap ₹${parsedIntent.maxBudgetPerUnit}. Matching counter.`);
          currentBid = counter;
        } else {
          logTrace('WALK_AWAY', `Counter price ₹${counter} exceeds max budget cap of ₹${parsedIntent.maxBudgetPerUnit}.`);
          return res.json({
            status: 'FAILED',
            message: `Merchant refused to sell under your budget limit of ₹${parsedIntent.maxBudgetPerUnit}. Counter was ₹${counter}.`,
            traces,
          });
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

    // Step D: Zero-Click Autonomous Payment Settlement via Headless Worker
    logTrace('PAYMENT_INITIATION', `Deal accepted. Triggering autonomous payment on Razorpay...`, {
      paymentLink: finalNegotiationResult.razorpayPaymentLink,
    });

    const paymentOutcome = await executeAutonomousRazorpayPayment(
      finalNegotiationResult.razorpayPaymentLink!
    );

    if (paymentOutcome.success) {
      logTrace('PAYMENT_COMPLETE', `Razorpay test transaction successfully authorized and captured.`);
    } else {
      logTrace('PAYMENT_WARNING', `Payment link created, but headless checkout encountered: ${paymentOutcome.error}`);
    }

    // Step E: Return full audit trail
    return res.json({
      status: 'SUCCESS',
      message: `Successfully procured ${parsedIntent.quantity}x ${targetSku} at ₹${finalNegotiationResult.agreedUnitPrice} each!`,
      orderId: finalNegotiationResult.orderId,
      agreedUnitPrice: finalNegotiationResult.agreedUnitPrice,
      totalAmount: finalNegotiationResult.totalAmount,
      razorpayPaymentLink: finalNegotiationResult.razorpayPaymentLink,
      paymentExecuted: paymentOutcome.success,
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