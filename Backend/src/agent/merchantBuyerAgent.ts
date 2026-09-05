import Groq from 'groq-sdk';
import { GROQ_MODEL } from '../services/groqClient.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface MerchantTurnInput {
  sku: string;
  quantity: number;
  lastSupplierCounter: number;
  supplierMessage: string;
  targetWholesaleCost: number;
  maxAffordableWholesaleCost: number; // Cap before retail margin drops below 15%
  turnNumber: number;
  conversationHistory: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

export interface MerchantTurnResult {
  decision: 'ACCEPT' | 'COUNTER' | 'WALK_AWAY';
  newBidUnitCost?: number;
  merchantMessage: string;
}

export const runMerchantBuyerTurn = async (
  input: MerchantTurnInput
): Promise<MerchantTurnResult> => {
  const {
    sku,
    quantity,
    lastSupplierCounter,
    supplierMessage,
    targetWholesaleCost,
    maxAffordableWholesaleCost,
    turnNumber,
    conversationHistory,
  } = input;

  const merchantBuyerPrompt = `
You are the VP of Procurement for an e-commerce retail platform.
You are negotiating a restock of ${quantity} units of SKU: ${sku} from a wholesale distributor.

FINANCIAL PARAMETERS:
- Ideal Target Cost: ₹${targetWholesaleCost.toLocaleString('en-IN')}
- Absolute Walk-Away Ceiling: ₹${maxAffordableWholesaleCost.toLocaleString('en-IN')} (If you pay more, our downstream margin vanishes).
- Supplier's latest counter: ₹${lastSupplierCounter.toLocaleString('en-IN')}
- Supplier's rationale: "${supplierMessage}"

STRATEGY:
1. Squeeze the supplier for volume discounts, but recognize real market crunches.
2. If the supplier's price is $\le$ ₹${targetWholesaleCost}, ACCEPT immediately.
3. If their counter is between target and your ceiling, counter strategically: meet them partway, cite our purchase volume, and push for a deal.
4. If their counter exceeds ₹${maxAffordableWholesaleCost} on Turn 3, state you must escalate or walk away unless they concede.
5. Respond strictly in JSON:
{
  "decision": "ACCEPT" | "COUNTER" | "WALK_AWAY",
  "newBidUnitCost": number (if COUNTER),
  "merchantMessage": "Your direct B2B negotiation message back to the supplier"
}
`;

  const messages: any[] = [
    { role: 'system', content: merchantBuyerPrompt },
    ...conversationHistory,
    {
      role: 'user',
      content: `[Turn ${turnNumber}] The supplier countered at ₹${lastSupplierCounter}. Formulate your response.`,
    },
  ];

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const parsed: MerchantTurnResult = JSON.parse(
    completion.choices[0]?.message?.content || '{}'
  );

  return parsed;
};