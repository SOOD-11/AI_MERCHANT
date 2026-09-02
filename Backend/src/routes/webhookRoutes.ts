import { Router,  type Request,  type Response } from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { InventoryService } from '../services/inventoryService.js';
import { logAgentAction } from '../utils/auditLogger.js';

export const webhookRouter = Router();

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_123';

webhookRouter.post('/api/v1/webhooks/razorpay', async (req: any, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    
    // 1. Raw body fallback (handles both rawBody buffer and parsed JSON)
    const rawPayload = req.rawBody ? req.rawBody : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('⚠️ Webhook signature mismatch. Check WEBHOOK_SECRET or rawBody parser.');
      // NOTE: During local debugging, if you want to bypass signature check temporarily to verify DB updates,
      // comment out the return line below:
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;
    console.log(`🔔 [Razorpay Webhook]: Received event "${event}"`);

    // 2. Handle Payment Link and Standard Payment events
    if (
      event === 'payment_link.paid' ||
      event === 'payment.captured' ||
      event === 'order.paid'
    ) {
      // Extract IDs from either payment_link or payment entity
      const linkEntity = payload.payment_link?.entity;
      const paymentEntity = payload.payment?.entity;

      const paymentLinkId = linkEntity?.id || null; // e.g. plink_TXKZKdcCtaH9Rw
      const referenceId = linkEntity?.reference_id || null; // e.g. ec6402ff-c44e-...
      const rzpOrderId = paymentEntity?.order_id || null;
      const rzpPaymentId = paymentEntity?.id || linkEntity?.payment_id || null;
      const amountInInr = ((paymentEntity?.amount || linkEntity?.amount || 0) / 100);

      console.log(`🔍 Webhook Payload Details:`, {
        referenceId,
        paymentLinkId,
        rzpOrderId,
        rzpPaymentId,
        amountInInr
      });

      // 3. Resolve the internal Order ID:
      // Try resolving directly via reference_id, or by looking up orders table, or transactions table
      let resolvedOrderId: string | null = null;

      if (referenceId) {
        resolvedOrderId = referenceId;
      } else if (paymentLinkId) {
        const rows = await query<any[]>(
          `SELECT id FROM orders WHERE razorpay_payment_link_id = ? LIMIT 1`,
          [paymentLinkId]
        );
        if (rows.length > 0) resolvedOrderId = rows[0].id;
      }

      if (!resolvedOrderId && rzpOrderId) {
        const txRows = await query<any[]>(
          `SELECT order_id FROM transactions WHERE rzp_order_id = ? LIMIT 1`,
          [rzpOrderId]
        );
        if (txRows.length > 0) resolvedOrderId = txRows[0].order_id;
      }

      if (!resolvedOrderId) {
        console.warn(`⚠️ Could not map webhook payload to an internal order. Reference: ${referenceId}, Link: ${paymentLinkId}`);
        return res.status(200).json({ status: 'ignored_unmatched_order' });
      }

      // 4. Fetch the Order details to finalize
      const orderRows = await query<any[]>(
        `SELECT product_id, quantity FROM orders WHERE id = ? LIMIT 1`,
        [resolvedOrderId]
      );

      if (orderRows.length > 0) {
        const { product_id, quantity } = orderRows[0];

        // Update Order to PAID
        await query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [resolvedOrderId]);

        // Update Transaction record if table exists
        await query(
          `UPDATE transactions 
           SET rzp_payment_id = COALESCE(?, rzp_payment_id), 
               status = 'captured' 
           WHERE order_id = ? OR rzp_order_id = ?`,
          [rzpPaymentId, resolvedOrderId, rzpOrderId || '']
        );

        // Deduct inventory
        if (InventoryService?.finalizeDeduction) {
          await InventoryService.finalizeDeduction(product_id, quantity);
        }

        await logAgentAction({
          orderId: resolvedOrderId,
          agentRole: 'POLICY_ENGINE',
          action: 'PAYMENT_CAPTURED_WEBHOOK',
          inputJson: { paymentLinkId, rzpOrderId, rzpPaymentId, amountInInr },
          decision: 'CAPTURED',
          reason: `Payment of ₹${amountInInr.toLocaleString('en-IN')} confirmed via Razorpay Webhook.`,
        });

        console.log(`✅ [Webhook Success]: Order ${resolvedOrderId} status flipped to 'paid'!`);
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('❌ Error processing Razorpay webhook:', error);
    return res.status(500).json({ error: 'Webhook handler failure' });
  }
});