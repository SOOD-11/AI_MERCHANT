import { Router, type Request, type Response } from 'express';
import { query } from '../db/connection.js';
import { processBuyerNegotiation } from '../agent/merchantAgent.js';

import type { BuyerNegotiationRequest } from '../agent/merchantAgent.js';
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
agentRouter.post('/api/v1/agent/negotiate', async (req: Request, res: Response) => {
  try {
    const { sku, quantity, offeredUnitPrice, buyerAgentId } = req.body;

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