import { Router,  type Request,  type Response } from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { InventoryService } from '../services/inventoryService.js';
import { logAgentAction } from '../utils/auditLogger.js';

export const webhookRouter = Router();

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_123';

webhookRouter.post('/api/v1/webhooks/razorpay', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const bodyStr = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(bodyStr)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment.entity;
      const rzpOrderId = paymentEntity.order_id;
      const rzpPaymentId = paymentEntity.id;
      const amountInInr = paymentEntity.amount / 100;

      const txRows = await query<any[]>(
        `SELECT order_id FROM transactions WHERE rzp_order_id = ? LIMIT 1`,
        [rzpOrderId]
      );

      if (txRows.length > 0) {
        const orderId = txRows[0].order_id;

        const orderRows = await query<any[]>(
          `SELECT product_id, quantity FROM orders WHERE id = ? LIMIT 1`,
          [orderId]
        );

        if (orderRows.length > 0) {
          const { product_id, quantity } = orderRows[0];

          await query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [orderId]);
          await query(
            `UPDATE transactions 
             SET rzp_payment_id = ?, status = 'captured' 
             WHERE rzp_order_id = ?`,
            [rzpPaymentId, rzpOrderId]
          );

          await InventoryService.finalizeDeduction(product_id, quantity);

          await logAgentAction({
            orderId,
            agentRole: 'POLICY_ENGINE',
            action: 'PAYMENT_CAPTURED_WEBHOOK',
            inputJson: { rzpOrderId, rzpPaymentId, amountInInr },
            decision: 'CAPTURED',
            reason: `Payment of ₹${amountInInr.toLocaleString('en-IN')} confirmed via Razorpay Webhook.`,
          });
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('Error processing Razorpay webhook:', error);
    return res.status(500).json({ error: 'Webhook handler failure' });
  }
});