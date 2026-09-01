import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { agentRouter } from './routes/agentRoutes.js';
import { dashboardRouter } from './routes/dashboardRoutes.js';
import { webhookRouter } from './routes/webhookRoutes.js';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Register API Routers
app.use(agentRouter);
app.use(dashboardRouter);
app.use(webhookRouter);

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    service: 'Autonomous Merchant Agent Engine',
    timestamp: new Date().toISOString(),
  });
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`\n Autonomous Merchant Agent Server running on http://localhost:${PORT}`);
  console.log(` Discovery Catalog: http://localhost:${PORT}/.well-known/agent-commerce.json`);
  console.log(` Agent Negotiation: http://localhost:${PORT}/api/v1/agent/negotiate`);
  console.log(` Dashboard Metrics: http://localhost:${PORT}/api/v1/dashboard/metrics`);
  console.log(` Razorpay Webhook:  http://localhost:${PORT}/api/v1/webhooks/razorpay\n`);
});

server.on('error', (err: any) => {
  console.error(' Server startup error:', err);
});