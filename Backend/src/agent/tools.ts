import type { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import { InventoryService } from '../services/inventoryService.js';
import { requestSupplierQuote } from './supplierSimulator.js';
import { checkPolicy } from '../policy/policyEngine.js';
import { runSupplierTurn } from './supplierAgent.js';
import { query } from '../db/connection.js';
 export interface PolicyRules{
maxAutonomousSpendInr: number,
maxDiscountPercent: number,
minGrossProfitMargin: number;

}
export const extractPoliciesFromDb = async (): Promise<PolicyRules> => {
  const result = await query(`
    SELECT
      min_gross_margin_percent,
      max_autonomous_spend_inr,
      max_discount_percent
    FROM policies
    LIMIT 1
  `);

  const policy = result[0];

  if (!policy) {
    throw new Error("No policy found in database");
  }

  return {
    maxAutonomousSpendInr: Number(policy.max_autonomous_spend_inr),
    maxDiscountPercent: Number(policy.max_discount_percent),
    minGrossProfitMargin: Number(policy.min_gross_margin_percent),
  };
};






export const merchantTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_inventory',
      description: 'Check available and reserved stock in warehouse for a given product SKU.',
      parameters: {
        type: 'object',
        properties: {
          sku: { type: 'string', description: 'Product SKU, e.g. LAPTOP-PRO-15' },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_supplier_quote',
      description: 'Request wholesale procurement quote from external suppliers when warehouse stock is short.',
      parameters: {
        type: 'object',
        properties: {
          sku: { type: 'string', description: 'Product SKU code' },
          quantityNeeded: { type: 'number', description: 'Units needed from supplier' },
        },
        required: ['sku', 'quantityNeeded'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_policy_rules',
      description: 'Verify financial guardrails: minimum gross margin and autonomous spend limit.',
      parameters: {
        type: 'object',
        properties: {
          unitPrice: { type: 'number', description: 'Selling price per unit offered' },
          unitCost: { type: 'number', description: 'Base or wholesale cost per unit' },
          quantity: { type: 'number', description: 'Total units requested' },
          msrp: { type: 'number', description: 'Product list MSRP' },
        },
        required: ['unitPrice', 'unitCost', 'quantity', 'msrp'],
      },
    },
  },


  {
  type: 'function',
  function: {
    name: 'submit_merchant_verdict',
    description: 'Submit your final commercial verdict after verifying stock and evaluating policy rules.',
    parameters: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['ACCEPTED', 'COUNTER_OFFER', 'REJECTED','ESCALATED_OVERSPEND'],
          description: 'Your commercial decision on the deal.',
        },
        counterUnitPrice: {
          type: ['number', 'null'],
          description: 'Your chosen counter-offer unit price in INR if verdict is COUNTER_OFFER. You decide this based on MSRP, base cost, and buyer bid.',
        },
        reasoning: {
          type: 'string',
          description: 'Strategic commercial rationale explaining your offer or rejection to the buyer.',
        },
      },
      required: ['verdict', 'reasoning'],
    },
  },
},

{
    type: 'function' as const,
    function: {
      name: 'request_supplier_rfq',
      description: 'Call this when customer requested quantity exceeds on-hand inventory. Obtains an instant provisional wholesale quote and lead time from the wholesale supplier before committing to the customer.',
      parameters: {
        type: 'object',
        properties: {
          sku: { type: 'string', description: 'The product SKU' },
          shortageQuantity: { type: 'number', description: 'Number of extra units needed from supplier' },
        },
        required: ['sku', 'shortageQuantity'],
      },
    },
  },
];

export const executeToolCall = async (name: string, args: any): Promise<any> => {
  switch (name) {
    case 'check_inventory': {
      const product = await InventoryService.getProductBySku(args.sku);
      if (!product) return { error: `Product SKU ${args.sku} not found.` };
      return {
        sku: product.sku,
        productId: product.productId,
        name: product.name,
        availableStock: product.quantityAvailable,
        reservedStock: product.quantityReserved,
        msrp: product.msrp,
        baseCost: product.baseCost,
      };
    }

    case 'request_supplier_quote': {
      const quote = await requestSupplierQuote(args.sku, args.quantityNeeded);
      return quote;
    }

    case 'evaluate_policy_rules': {
      const policies = await extractPoliciesFromDb();
      return checkPolicy({
        minGrossMarginPercent: policies.minGrossProfitMargin,
        maxAutonomousSpendInr: policies.maxAutonomousSpendInr,
        maxDiscountPercent: policies.maxDiscountPercent,
      }, {
        offeredPrice: args.unitPrice,
        unitCost: args.unitCost,
        quantity: args.quantity,
        msrp: args.msrp,
      });
    }
case 'submit_merchant_verdict': {
      return {
        acknowledged: true,
        verdict: args.verdict || args.decision,
        counterUnitPrice: Number(args.counterUnitPrice),
        reasoning: args.reasoning,
      };
    }

    case 'request_supplier_rfq': {
      const { sku, shortageQuantity } = args;

      // 1. Fetch supplier info
      const suppliers = await query<any[]>(
        `SELECT * FROM suppliers WHERE sku = ? LIMIT 1`,
        [sku]
      );

      if (!suppliers || suppliers.length === 0) {
        return {
          available: false,
          reason: `No registered wholesale supplier for SKU: ${sku}`,
        };
      }

      const supplier = suppliers[0];
      const baseCost = Number(supplier.wholesale_cost);

      // 2. Query Supplier Agent for a live quote (Turn 1 RFQ)
      const quoteResult = await runSupplierTurn({
        sku,
        quantity: shortageQuantity,
        offeredUnitCost: baseCost,
        baseWholesaleCost: baseCost,
        marketCondition: 'NORMAL', // or 'SURGE_SHORTAGE'
        turnNumber: 1,
        conversationHistory: [],
      });

      const quotedUnitCost = quoteResult.counterUnitCost || quoteResult.agreedUnitCost || baseCost;

      return {
        available: quoteResult.decision !== 'REJECTED',
        supplierName: supplier.name,
        quotedUnitCost,
        leadTimeDays: supplier.lead_time_days || 2,
        supplierMessage: quoteResult.supplierMessage,
      };
    }
    default:
      throw new Error(`Tool ${name} is not recognized.`);
  }
};