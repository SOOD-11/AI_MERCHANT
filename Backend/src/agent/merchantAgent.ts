import { randomUUID } from 'crypto';
import { groq, GROQ_MODEL } from '../services/groqClient.js';
import { merchantTools, executeToolCall } from './tools.js';
import { InventoryService } from '../services/inventoryService.js';
import { RazorpayService } from '../services/razorpayService.js';
import { query } from '../db/connection.js';
import { logAgentAction } from '../utils/auditLogger.js';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';

export interface BuyerNegotiationRequest {
  sku: string;
  quantity: number;
  offeredUnitPrice: number;
  buyerAgentId?: string;
  buyerMessage?: string;
}

export interface AgentNegotiationResponse {
  status: 'ACCEPTED' | 'COUNTER_OFFER' | 'REJECTED' | 'AWAITING_HUMAN_APPROVAL';
  orderId?: string | null;
  agreedUnitPrice?: number;
  totalAmount?: number;
  counterUnitPrice?: number;
  marginPercent?: number;
  razorpayPaymentLink?: string;
  paymentLinkId?: string;
  reason: string;
  agentMessage?: string;
  approvalId?: string;
}

export const processBuyerNegotiation = async (
  req: BuyerNegotiationRequest
): Promise<AgentNegotiationResponse> => {
  const { sku, quantity, offeredUnitPrice, buyerMessage } = req;
  const buyerId = req.buyerAgentId || 'buyer_agent_default';
  const orderId = randomUUID();

  let latestPolicyResult: any = null;
  let productDetails: any = null;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are the Autonomous Merchant AI representing "Apex Electronics".
Your Objectives:
1. Maximize revenue and profit margin while keeping deals alive.
2. Protect company guardrails: check inventory and evaluate financial policy rules before agreeing to any price.
3. If a buyer's offer is too low or rejected by policy, DO NOT accept it and DO NOT counter lower than their bid.
4. Instead, negotiate intelligently: propose a counter-offer between their bid and the MSRP that complies with our margin requirements.
5. In your final response, if you counter-offer, output your commercial reasoning and state the exact counter unit price clearly.
6. IF PAYMENT OFFERED SATIFIES THE POLICHY CHECKLS BUT ITs less than msrp  dont accept in 1 go let buyer  in crese the price 
you are smart merchant who knows how to negotiate even when uyou can get more profit
`
    },
    {
      role: 'user',
      content: `Buyer (${buyerId}) wants to purchase ${quantity} units of SKU "${sku}" at ₹${offeredUnitPrice}/unit.
Buyer Message: "${buyerMessage || 'Interested in negotiating a deal'}".`,
    },
  ];

  for (let round = 0; round < 4; round++) {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      tools: merchantTools,
      tool_choice: 'auto',
      temperature: 0.1,
    });

    const assistantMsg = completion.choices[0].message;
    messages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of assistantMsg.tool_calls) {
      const funcName = toolCall.function.name;
      const funcArgs = JSON.parse(toolCall.function.arguments);

      console.log(`🤖 [Groq Tool Invoked]: ${funcName}`, funcArgs);

      const toolResult = await executeToolCall(funcName, funcArgs);

      if (funcName === 'check_inventory') productDetails = toolResult;
      if (funcName === 'evaluate_policy_rules') latestPolicyResult = toolResult;

      await logAgentAction({
       
        agentRole: 'MERCHANT_AGENT',
        action: `TOOL_${funcName.toUpperCase()}`,
        inputJson: funcArgs,
        decision: 'TOOL_COMPLETED',
        reason: JSON.stringify(toolResult),
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: funcName,
        content: JSON.stringify(toolResult),
      });
    }
  }

  if (!productDetails || productDetails.error) {
    return {
      status: 'REJECTED',
      reason: `Product with SKU ${sku} does not exist in catalog.`,
      agentMessage: 'We do not carry this item in our catalog.',
    };
  }

  // Escalated Overspend
  if (latestPolicyResult && latestPolicyResult.verdict === 'ESCALATED_OVERSPEND') {
    const approvalId = randomUUID();

    await query(
      `INSERT INTO orders (id, buyer_id, product_id, quantity, unit_price, total_price, status)
       VALUES (?, ?, (SELECT id FROM products WHERE sku = ?), ?, ?, ?, 'blocked')`,
      [orderId, buyerId, sku, quantity, offeredUnitPrice, latestPolicyResult.totalTransactionValue]
    );

    await query(
      `INSERT INTO approvals (id, order_id, action_requested, financial_impact_inr, reason, status)
       VALUES (?, ?, 'AUTHORIZE_BULK_PURCHASE', ?, ?, 'PENDING')`,
      [approvalId, orderId, latestPolicyResult.totalCostValue, latestPolicyResult.reason]
    );

    return {
      status: 'AWAITING_HUMAN_APPROVAL',
      orderId,
      approvalId,
      totalAmount: latestPolicyResult.totalTransactionValue,
      marginPercent: latestPolicyResult.grossMarginPercent,
      reason: latestPolicyResult.reason,
      agentMessage: messages[messages.length - 1].content as string,
    };
  }

  // Counter Offer
  // Replace the hardcoded block with this agentic re-prompting flow:

if (latestPolicyResult && !latestPolicyResult.allowed) {
  // 1. Tell the agent that the policy rejected the price and ask it to propose a counter
  messages.push({
    role: 'user',
    content: `[POLICY FEEDBACK]: The buyer's offer was REJECTED by internal policy.
Reason: ${latestPolicyResult.reason}
MSRP: ₹${productDetails.msrp}
Base Cost: ₹${productDetails.baseCost}
Minimum required margin: 15% (Absolute floor price: ₹${Math.ceil(productDetails.baseCost / (1 - 0.15))})

As the Merchant Sales Agent, decide your counter-offer price. Do not surrender all margin—aim higher toward MSRP while giving a reasonable concession. Call 'submit_merchant_verdict' with your decision.`,
  });

  // 2. Let Groq formulate the counter-offer
  const followUpResponse = await groq.chat.completions.create({
    model:GROQ_MODEL,
    messages,
    tools: merchantTools,
    tool_choice: { type: 'function', function: { name: 'submit_merchant_verdict' } },
  });

  const toolCall = followUpResponse.choices[0]?.message?.tool_calls?.[0];
  if (toolCall && toolCall.function.name === 'submit_merchant_verdict') {
    const args = JSON.parse(toolCall.function.arguments);
    const counterPrice = Number(args.counterUnitPrice) || Math.round((productDetails.msrp + offeredUnitPrice) / 2);

    return {
      status: args.verdict === 'REJECTED' ? 'REJECTED' : 'COUNTER_OFFER',
      counterUnitPrice: counterPrice,
      marginPercent: Number((((counterPrice - productDetails.baseCost) / counterPrice) * 100).toFixed(2)),
      reason: args.reasoning || latestPolicyResult.reason,
      agentMessage: followUpResponse.choices[0]?.message?.content || args.reasoning,
    };
  }
}

  // Accepted -> Create Order & Generate Razorpay Payment Link
  const totalValue = offeredUnitPrice * quantity;
  await query(
    `INSERT INTO orders (id, buyer_id, product_id, quantity, unit_price, total_price, status)
     VALUES (?, ?, (SELECT id FROM products WHERE sku = ?), ?, ?, ?, 'pending_payment')`,
    [orderId, buyerId, sku, quantity, offeredUnitPrice, totalValue]
  );

  await InventoryService.reserveStock(productDetails.sku, quantity);

  const paymentLink = await RazorpayService.createPaymentLink(
    orderId,
    totalValue,
    'buyer.corporate@agent.test'
  );

  await logAgentAction({
    orderId,
    agentRole: 'MERCHANT_AGENT',
    action: 'PAYMENT_LINK_ISSUED',
    inputJson: { orderId, linkId: paymentLink.paymentLinkId },
    decision: 'ACCEPTED',
    reason: `Deal confirmed. Created Razorpay Payment Link: ${paymentLink.paymentLinkUrl}`,
  });

  return {
    status: 'ACCEPTED',
    orderId,
    agreedUnitPrice: offeredUnitPrice,
    totalAmount: totalValue,
    marginPercent: latestPolicyResult?.grossMarginPercent || 15.0,
    razorpayPaymentLink: paymentLink.paymentLinkUrl,
    paymentLinkId: paymentLink.paymentLinkId,
    reason: 'Deal satisfies all safety checks.',
    agentMessage: messages[messages.length - 1].content as string,
  };
};