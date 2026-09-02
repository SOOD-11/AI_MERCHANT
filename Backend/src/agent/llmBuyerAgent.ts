import { groq, GROQ_MODEL } from '../services/groqClient.js';
import { executeAutonomousRazorpayPayment } from './headlesspayer.js';

interface BuyerGoal {
  sku: string;
  quantity: number;
  targetBudgetPerUnit: number;
  maxWillingToPayPerUnit: number;
  notes: string;
}

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000';

export const runLLMBuyerNegotiation = async (goal: BuyerGoal): Promise<void> => {
  console.log(`\n======================================================`);
  console.log(`🤖 AUTONOMOUS A2A BUYER AGENT ACTIVATED`);
  console.log(`🎯 Goal: Buy ${goal.quantity}x ${goal.sku}`);
  console.log(`💰 Budget Ceiling: ₹${goal.maxWillingToPayPerUnit.toLocaleString('en-IN')}`);
  console.log(`======================================================\n`);

  console.log('📡 Step 1: Discovering Merchant via A2A Catalog...');
  const catalogRes = await fetch(`${API_BASE}/.well-known/agent-commerce.json`);
  const catalog = await catalogRes.json();
  const productInfo = catalog.catalog.find((p: any) => p.sku === goal.sku);

  if (!productInfo) {
    console.error(`❌ SKU ${goal.sku} not found.`);
    return;
  }
  console.log(`✅ Merchant Verified: ${catalog.merchant.name} (MSRP: ₹${productInfo.msrp.toLocaleString('en-IN')})\n`);

  let currentOffer = goal.targetBudgetPerUnit;
  let round = 1;
  const maxRounds = 3;

  while (round <= maxRounds) {
    console.log(`--- [ Turn ${round}: Buyer Agent Bidding ] ---`);
    console.log(`🗣️ Offer: ₹${currentOffer.toLocaleString('en-IN')}/unit for ${goal.quantity} units`);

    const response = await fetch(`${API_BASE}/api/v1/agent/negotiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: goal.sku,
        quantity: goal.quantity,
        offeredUnitPrice: currentOffer,
        buyerAgentId: 'buyer_agent_groq_01',
        buyerMessage: `Procurement order for ${goal.quantity} units.`,
      }),
    });

    const result = await response.json();
    console.log(`🏪 Merchant Response: [${result.status}]`);
    console.log(`💬 Merchant Rationale: "${result.agentMessage || result.reason}"`);

    if (result.status === 'ACCEPTED') {
      console.log(`\n======================================================`);
      console.log(`🎉 DEAL CLOSED & CONTRACT SEALED!`);
      console.log(`📦 Order ID: ${result.orderId}`);
      console.log(`🔗 Razorpay Payment Link: ${result.razorpayPaymentLink}`);
      console.log(`------------------------------------------------------`);
      console.log(`⚡ Initiating ZERO-CLICK Autonomous A2A Settlement...`);

      const payResult = await executeAutonomousRazorpayPayment(result.razorpayPaymentLink);

      if (payResult.success) {
        console.log(`\n✅ A2A Payment Processed Successfully against Razorpay Test Gateway!`);
        console.log(`📊 Check your Razorpay Dashboard -> Payments / Payment Links to inspect.`);
      } else {
        console.log(`⚠️ Automated headless note: ${payResult.error}`);
        console.log(`👉 Link remains active for manual check at: ${result.razorpayPaymentLink}`);
      }

      console.log(`======================================================\n`);
      return;
    }

    if (result.status === 'AWAITING_HUMAN_APPROVAL') {
      console.log(`\n⏳ Deal escalated for human merchant approval (ID: ${result.approvalId})`);
      return;
    }

    if (result.status === 'COUNTER_OFFER') {
      const counterPrice = result.counterUnitPrice;
      console.log(`🤔 Counter Offer Received: ₹${counterPrice?.toLocaleString('en-IN')}`);

      const prompt = `You are an Autonomous AI Buyer.
Target budget: ₹${goal.targetBudgetPerUnit}.
Strict ceiling: ₹${goal.maxWillingToPayPerUnit}.
Merchant counter: ₹${counterPrice}.
If counter <= ceiling, return ACCEPT.
Otherwise counter or WALK_AWAY.
JSON format: {"action": "ACCEPT" | "COUNTER" | "WALK_AWAY", "bid": number, "thought": "string"}`;

      const aiDecision = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const parsed = JSON.parse(aiDecision.choices[0]?.message?.content || '{}');
      console.log(`🧠 Buyer Reasoning: ${parsed.thought}`);

      if (parsed.action === 'ACCEPT') {
        currentOffer = counterPrice;
      } else if (parsed.action === 'COUNTER') {
        currentOffer = Math.min(parsed.bid, goal.maxWillingToPayPerUnit);
      } else {
        console.log(`🚶 Buyer walked away. Budget exceeded.`);
        return;
      }
    }

    round++;
  }
};

runLLMBuyerNegotiation({
  sku: 'LAPTOP-PRO-15',
  quantity: 1,
  targetBudgetPerUnit: 70000,
  maxWillingToPayPerUnit: 80000,
  notes: 'Autonomous developer workstation procurement.',
}).catch(console.error);