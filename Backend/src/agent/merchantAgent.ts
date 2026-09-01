import { randomUUID } from "node:crypto";
import { InventoryService } from "../services/inventoryService.js";
import { logAgentAction } from "../utils/auditLogger.js";
import { requestSupplierQuote } from "./supplierSimulator.js";
import { query } from "../db/connection.js";
import { checkPolicy } from "../policy/policyEngine.js";
import { RazorpayService } from "../services/razorpayService.js";

 export interface BuyerNegotiationRequest {
    sku: string;
    quantity: number;
    offeredUnitPrice: number;
    buyerAgentId?: string | undefined;
}

interface AgentNegotiationResponse {
    status: "accepted" | "counter_offer" | "rejected" | "awaiting_approval";
    orderId?: string;
    agreedUnitPrice?: number;
    totalAmount?: number;
    counterUnitPrice?: number;
    marginPercent?: number;
    razorpayOrder?: any;
    reason: string;
    approvalId?: string;
}

 export const processBuyerNegotiation = async (
    input: BuyerNegotiationRequest
): Promise<AgentNegotiationResponse> => {

    const { sku, quantity, offeredUnitPrice } = input;

    const buyerId = input.buyerAgentId || "buyer_agent_default";
    const orderId = randomUUID();

    // Fetch merchant policies
    const policyRows = await query(
        `
        SELECT
            min_gross_margin_percent AS minGrossMarginPercent,
            max_autonomous_spend_inr AS maxAutonomousSpendInr,
            max_discount_percent AS maxDiscountPercent
        FROM policies
        LIMIT 1
        `,
        []
    );

    if (!policyRows || (policyRows as any[]).length === 0) {
        console.log("Unable to fetch deterministic policies for the merchant");

        return {
            status: "rejected",
            reason: "Merchant policy could not be determined."
        };
    }

    const merchantPolicy = (policyRows as any[])[0];

    // Check if product exists
    const product = await InventoryService.getProductBySku(sku);

    if (!product) {
        await logAgentAction({
         
            agentRole: "MERCHANT_AGENT",
            action: "PRODUCT_LOOKUP_FAILED",
            decision: "REJECTED",
            reason: "Product is not listed by merchant",
        });

        return {
            status: "rejected",
            reason: "Product requested is not sold by the merchant."
        };
    }

    // Determine actual cost
    let baseCost = product.baseCost;
    let isBackOrder = false;

    // Check inventory
    if (product.quantityAvailable < quantity) {

        isBackOrder = true;

        const unitShort = quantity - product.quantityAvailable;

        // Get supplier quote for the missing quantity
        const quote = await requestSupplierQuote(sku, unitShort);

        baseCost = quote.unitWholeSaleCost;

       await logAgentAction({
 
            agentRole: "MERCHANT_AGENT",
            action: "SUPPLIER_QUOTE_RECEIVED",
            inputJson: {
                supplier: quote.supplierName,
                unitCost: quote.unitWholeSaleCost
            },
            decision: "RESTOCK_QUOTE_ACQUIRED",
            reason: `Supplier quoted ₹${quote.unitWholeSaleCost.toLocaleString(
                "en-IN"
            )}/unit for restock.`
        });  
    } 

    // Policy-gated verification
    const policyDecision = checkPolicy(merchantPolicy, {
        actionType: "PRICE_OVERRIDE",
        offeredPrice: offeredUnitPrice,
        quantity,
        msrp: product.msrp,

        // IMPORTANT:
        // Use supplier cost when this is a backorder.
        unitCost: baseCost
    });


    // Check autonomous spending limit
if (
    policyDecision.totalAmount >
    merchantPolicy.maxAutonomousSpendInr
) {
    const approvalId = randomUUID();

    await query(
        `
        INSERT INTO approvals
        (
            id,
            order_id,
            requested_amount,
            status,
            reason
        )
        VALUES (?, ?, ?, 'pending', ?)
        `,
        [
            approvalId,
            orderId,
            policyDecision.totalAmount,
            `Transaction exceeds merchant's autonomous spending limit of ₹${merchantPolicy.maxAutonomousSpendInr.toLocaleString(
                "en-IN"
            )}.`
        ]
    );

    await logAgentAction({
        orderId,
        agentRole: "MERCHANT_AGENT",
        action: "AUTONOMOUS_SPEND_LIMIT_EXCEEDED",
        inputJson: {
            totalAmount: policyDecision.totalAmount,
            maxAutonomousSpendInr:
                merchantPolicy.maxAutonomousSpendInr
        },
        decision: "AWAITING_APPROVAL",
        reason: `Transaction amount ₹${policyDecision.totalAmount.toLocaleString(
            "en-IN"
        )} exceeds the autonomous spending limit of ₹${merchantPolicy.maxAutonomousSpendInr.toLocaleString(
            "en-IN"
        )}.`
    });

    return {
        status: "awaiting_approval",
        totalAmount: policyDecision.totalAmount,
        marginPercent: policyDecision.marginPercent,
        approvalId,
        reason: `Transaction exceeds the merchant's autonomous spending limit of ₹${merchantPolicy.maxAutonomousSpendInr.toLocaleString(
            "en-IN"
        )}. Human approval is required.`
    };
}
    // Policy rejected the offer
    if (!policyDecision.allowed) {

        // Offer is below minimum margin
        if (
            policyDecision.marginPercent <
            merchantPolicy.minGrossMarginPercent
        ) {

            const margin =
                merchantPolicy.minGrossMarginPercent > 1
                    ? merchantPolicy.minGrossMarginPercent / 100
                    : merchantPolicy.minGrossMarginPercent;

            const counterUnitPrice = Math.ceil(
               product.baseCost +
            );

  

            return {
                status: "counter_offer",
                counterUnitPrice,
                marginPercent: policyDecision.marginPercent,
                reason:
                    "Offer price is below the minimum required margin. Here is the counter offer."
            };
        }

        // Any other policy rejection
        await logAgentAction({

            agentRole: "MERCHANT_AGENT",
            action: "POLICY_CHECK_FAILED",
            inputJson: {
                offeredUnitPrice,
                quantity,
                sku
            },
            decision: "REJECTED",
            reason: "Offer violates merchant policy."
        });

        return {
            status: "rejected",
            marginPercent: policyDecision.marginPercent,
            reason: "Offer violates merchant policy."
        };
    }

    // --------------------------------------------------
    // Policy approved
    // --------------------------------------------------

    // Create pending-payment order
    await query(
        `
        INSERT INTO orders
        (
            id,
            buyer_Id,
            product_id,
            quantity,
            unit_price,
            total_price,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending_payment')
        `,
        [
            orderId,
            buyerId,
            product.productId,
            quantity,
            offeredUnitPrice,
            policyDecision.totalAmount
        ]
    );

    // Reserve existing inventory
    if (!isBackOrder) {
        await InventoryService.reserveStock(
            product.productId,
            quantity
        );
    }

    // Create Razorpay test order
    const razorpayOrder = await RazorpayService.createTestOrder(
        orderId,
        policyDecision.totalAmount
    );

    await logAgentAction({
        orderId,
        agentRole: "MERCHANT_AGENT",
        action: "ORDER_ACCEPTED_PAYMENT_INITIATED",
        inputJson: {
            orderId,
            rzpOrderId: razorpayOrder.id
        },
        decision: "ACCEPTED",
        reason: `Deal sealed. Created Razorpay test order ${
            razorpayOrder.id
        } for ₹${policyDecision.totalAmount.toLocaleString("en-IN")}.`
    });

    return {
        status: "accepted",
        orderId,
        agreedUnitPrice: offeredUnitPrice,
        totalAmount: policyDecision.totalAmount,
        marginPercent: policyDecision.marginPercent,
        razorpayOrder,
        reason:
            "Offer meets all policy guidelines. Payment order created."
    };
};

