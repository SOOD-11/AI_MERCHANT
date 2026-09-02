import type { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import { InventoryService } from '../services/inventoryService.js';
import { requestSupplierQuote } from './supplierSimulator.js';
import { checkPolicy } from '../policy/policyEngine.js';

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
      description: 'Verify financial guardrails: minimum gross margin (>=15%) and autonomous spend limit (<=50000 INR).',
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
          enum: ['ACCEPTED', 'COUNTER_OFFER', 'REJECTED'],
          description: 'Your commercial decision on the deal.',
        },
        counterUnitPrice: {
          type: 'number',
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
}
];

export const executeToolCall = async (name: string, args: any): Promise<any> => {
  switch (name) {
    case 'check_inventory': {
      const product = await InventoryService.getProductBySku(args.sku);
      if (!product) return { error: `Product SKU ${args.sku} not found.` };
      return {
        sku: product.sku,
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
      return checkPolicy({  minGrossMarginPercent: 15.0,
        maxAutonomousSpendInr: 200000.0,
        maxDiscountPercent: 20.0},{
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
    default:
      throw new Error(`Tool ${name} is not recognized.`);
  }
};