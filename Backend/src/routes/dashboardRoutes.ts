import { Router, type Request,  type Response } from 'express';
import { query } from '../db/connection.js';
import { logAgentAction } from '../utils/auditLogger.js';

export const dashboardRouter = Router();

// Metrics Summary
dashboardRouter.get('/api/v1/dashboard/metrics', async (_req: Request, res: Response) => {
  try {
    const stockRows = await query<any[]>(
      `SELECT SUM(quantity_available) as totalAvailable, SUM(quantity_reserved) as totalReserved 
       FROM inventory`
    );

    const orderRows = await query<any[]>(
      `SELECT 
         COUNT(*) as totalOrders,
         COALESCE(SUM(CASE WHEN status = 'paid' OR status = 'pending_payment' THEN total_price ELSE 0 END), 0) as totalRevenue,
         COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0) as pendingEscalations
       FROM orders`
    );

    res.json({
      stockAvailable: Number(stockRows[0]?.totalAvailable || 0),
      stockReserved: Number(stockRows[0]?.totalReserved || 0),
      totalOrders: Number(orderRows[0]?.totalOrders || 0),
      totalRevenueInr: Number(orderRows[0]?.totalRevenue || 0),
      pendingEscalations: Number(orderRows[0]?.pendingEscalations || 0),
    });
  } catch (error: any) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch metrics' });
  }
});

// Live Audit Log Stream
dashboardRouter.get('/api/v1/dashboard/audit-logs', async (_req: Request, res: Response) => {
  try {
    const logs = await query<any[]>(
      `SELECT id, order_id as orderId, agent_role as agentRole, action, 
              input_json as inputJson, decision, reason, created_at as createdAt 
       FROM agent_actions 
       ORDER BY created_at DESC 
       LIMIT 30`
    );
    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch logs' });
  }
});

// Human Approval Queue
dashboardRouter.get('/api/v1/dashboard/approvals', async (_req: Request, res: Response) => {
  try {
    const approvals = await query<any[]>(
      `SELECT a.id, a.order_id as orderId, a.action_requested as actionRequested, 
              a.financial_impact_inr as financialImpactInr, a.reason, a.status, a.created_at as createdAt,
              o.quantity, o.unit_price as unitPrice, o.total_price as totalPrice,
              p.name as productName, p.sku
       FROM approvals a
       JOIN orders o ON a.order_id = o.id
       JOIN products p ON o.product_id = p.id
       WHERE a.status = 'PENDING'
       ORDER BY a.created_at DESC`
    );
    res.json(approvals);
  } catch (error: any) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch approvals' });
  }
});
// GET /api/v1/agent/order/:orderId/status
dashboardRouter.get('api/v1/agent/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const rows = await query<any[]>(
      `SELECT id, status, total_price, unit_price, quantity, created_at 
       FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderId: rows[0].id,
      status: rows[0].status, // 'pending_payment' or 'paid'
      totalPrice: rows[0].total_price,
      quantity: rows[0].quantity,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// Human Approval Action Decision
dashboardRouter.post('/api/v1/dashboard/approvals/:id/decide', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either APPROVED or REJECTED' });
    }

    const approvalRows = await query<any[]>(`SELECT order_id FROM approvals WHERE id = ? LIMIT 1`, [id]);
    if (!approvalRows.length) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const orderId = approvalRows[0].order_id;
    const newOrderStatus = decision === 'APPROVED' ? 'pending_payment' : 'cancelled';

    await query(`UPDATE approvals SET status = ? WHERE id = ?`, [decision, id]);
    await query(`UPDATE orders SET status = ? WHERE id = ?`, [newOrderStatus, orderId]);

    await logAgentAction({
      orderId,
      agentRole: 'POLICY_ENGINE',
      action: `HUMAN_${decision}`,
      decision,
      reason: `Operator manually marked approval as ${decision}.`,
    });

    res.json({ status: 'SUCCESS', approvalId: id, orderId, decision });
  } catch (error: any) {
    console.error('Error handling approval decision:', error);
    res.status(500).json({ error: error.message || 'Failed to submit decision' });
  }
});