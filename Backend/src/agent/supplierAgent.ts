import Groq from 'groq-sdk';
import { GROQ_MODEL } from '../services/groqClient.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface SupplierNegotiationInput {
  sku: string;
  quantity: number;
  offeredUnitCost: number;
  baseWholesaleCost: number;
  marketCondition?: 'NORMAL' | 'SURGE_SHORTAGE' | 'OVERSUPPLY';
  turnNumber: number;
  conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

export interface SupplierNegotiationResult {
  decision: 'ACCEPTED' | 'COUNTER_OFFER' | 'REJECTED';
  agreedUnitCost?: number;
  counterUnitCost?: number;
  supplierMessage: string;
  marketNote: string;
}

export const runSupplierTurn = async (
  input: SupplierNegotiationInput
): Promise<SupplierNegotiationResult> => {
  const {
    sku,
    quantity,
    offeredUnitCost,
    baseWholesaleCost,
    marketCondition = 'NORMAL',
    turnNumber,
    conversationHistory,
  } = input;

  // Real-world dynamic cost adjustments based on market climate
  let effectiveFloorCost = baseWholesaleCost;
  let dynamicListCost = Math.round(baseWholesaleCost * 1.15); // Standard 15% wholesale markup

  if (marketCondition === 'SURGE_SHORTAGE') {
    effectiveFloorCost = Math.round(baseWholesaleCost * 1.10); // Components up 10%
    dynamicListCost = Math.round(baseWholesaleCost * 1.28);     // List price up 28%
  } else if (marketCondition === 'OVERSUPPLY') {
    effectiveFloorCost = Math.round(baseWholesaleCost * 0.95);
    dynamicListCost = Math.round(baseWholesaleCost * 1.05);
  }

  // Large volume softens the counter price (e.g., >= 20 units)
  const volumeDiscountPerUnit = quantity >= 20 ? Math.round(baseWholesaleCost * 0.04) : 0;
  effectiveFloorCost = Math.max(effectiveFloorCost - volumeDiscountPerUnit, baseWholesaleCost * 0.90);

  const supplierSystemPrompt = `
You are the Chief Sales Representative for Quantum Wholesale Technologies Ltd.
You supply electronics and parts (SKU: ${sku}) to merchant distributors.

COMMERCIAL REALITIES:
- Base Catalog Cost: ₹${baseWholesaleCost.toLocaleString('en-IN')}
- Current Market Climate: ${marketCondition} (Component supplies fluctuate; pricing is dynamic!)
- Current Dynamic Quote: ₹${dynamicListCost.toLocaleString('en-IN')}
- Hard Breakeven Floor: ₹${effectiveFloorCost.toLocaleString('en-IN')} (NEVER sell below this; you will be fired).
- Volume Ordered: ${quantity} units.

YOUR NEGOTIATION RULES:
1. The merchant wants aggressive discounts. You want to preserve wholesale profitability.
2. If the merchant offers at or above ₹${dynamicListCost}, ACCEPT immediately.
3. If the merchant offers between ₹${effectiveFloorCost} and ₹${dynamicListCost}:
   - In early turns (Turn 1-2), DO NOT fold easily. Counter closer to ₹${dynamicListCost} with professional commercial reasons (mention current silicon costs, logistics, or allocation scarcity).
   - In later turns (Turn 3+), concede toward the middle to close the deal as long as it's above ₹${effectiveFloorCost}.
4. If the merchant bids below ₹${effectiveFloorCost}, REJECT or counter strictly above your floor.
5. You must output your decision strictly as a JSON object matching this structure:
{
  "decision": "ACCEPTED" | "COUNTER_OFFER" | "REJECTED",
  "counterUnitCost": number (required if COUNTER_OFFER),
  "agreedUnitCost": number (required if ACCEPTED),
  "supplierMessage": "Your authentic, persuasive business message to the merchant buyer",
  "marketNote": "Brief reason explaining pricing condition (e.g., NAND flash crunch, holiday surge)"
}
`;

  const messages: any[] = [
    { role: 'system', content: supplierSystemPrompt },
    ...conversationHistory,
    {
      role: 'user',
      content: `[Turn ${turnNumber}] Merchant Procurement Officer proposes: ₹${offeredUnitCost} per unit for ${quantity} units of ${sku}. Evaluate this offer.`,
    },
  ];

  const completion = await groq.chat.completions.create({
    model:GROQ_MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const parsed: SupplierNegotiationResult = JSON.parse(
    completion.choices[0]?.message?.content || '{}'
  );

  return parsed;
};