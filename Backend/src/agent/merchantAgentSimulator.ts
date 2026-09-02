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
    buyerAgentId?: string;
    previousCounterOffer?: number;

}

interface AgentNegotiationResponse {
    status: | "accepted" | "counter_offer" | "rejected" | "awaiting_approval";
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

    const {sku,quantity,offeredUnitPrice} = input;

    const buyerId =input.buyerAgentId || "buyer_agent_default";

    const orderId = randomUUID();
    if (quantity <= 0) {
        return {
            status: "rejected",
            reason: "Quantity must be greater than zero."
        };
    }

    if (offeredUnitPrice <= 0) {
        return {
            status: "rejected",
            reason: "Offered price must be greater than zero."
        };
    }



    // 2. FETCH MERCHANT POLICIES

    const policyRows = await query(
        `

        SELECT min_gross_margin_percent AS minGrossMarginPercent,
          max_autonomous_spend_inr AS maxAutonomousSpendInr,
            max_discount_percent AS maxDiscountPercent
        FROM policies
        LIMIT 1
        `,

        []

    );

    if (!policyRows || (policyRows as any[]).length === 0 ) {

        console.log(
            "Unable to fetch deterministic policies for the merchant"
        );
        return {
            status: "rejected",
            reason: "Merchant policy could not be determined."
        };

    }

    const merchantPolicy =(policyRows as any[])[0];

    // 3. FIND PRODUCT

    const product =await InventoryService.getProductBySku(sku);

    if (!product) {
        await logAgentAction({
            agentRole: "MERCHANT_AGENT",
            action: "PRODUCT_LOOKUP_FAILED",
            decision: "REJECTED",
            reason: "Product is not listed by merchant"
        });

        return {
            status: "rejected",
            reason: "Product requested is not sold by the merchant."
        };

    }



    // 4. DETERMINE ACTUAL COST

    let baseCost = product.baseCost;
    let isBackOrder = false;
    let stockQuantity = Math.min(product.quantityAvailable,quantity);
    let supplierQuantity = 0;

    // 5. HANDLE BACKORDER / SUPPLIER PROCUREMENT

    if (product.quantityAvailable < quantity) {
        isBackOrder = true;
        stockQuantity = product.quantityAvailable;

        supplierQuantity = quantity - stockQuantity;

     

        // Ask supplier for missing quantity

        const quote =await requestSupplierQuote( sku, supplierQuantity );

        const existingStockCost =stockQuantity * product.baseCost;

        const supplierCost = supplierQuantity * quote.unitWholeSaleCost;

        const totalProcurementCost =existingStockCost +supplierCost;



        // Effective average cost for this order

        baseCost =  totalProcurementCost / quantity;

        // Audit supplier quote

        await logAgentAction({
            agentRole: "MERCHANT_AGENT",
            action: "SUPPLIER_QUOTE_RECEIVED",
            inputJson: {supplier: quote.supplierName, requestedQuantity: quantity,existingStockQuantity:stockQuantity,supplierQuantity,
                existingStockUnitCost:  product.baseCost,
                supplierUnitCost: quote.unitWholeSaleCost,
                existingStockCost,
                supplierCost,
                totalProcurementCost,
                effectiveUnitCost:
                    baseCost
            },
            decision: "RESTOCK_QUOTE_ACQUIRED",
            reason:     `Supplier quoted ₹${quote.unitWholeSaleCost.toLocaleString("en-IN"  )}/unit for ${supplierQuantity} units.`

        });

    }
    // 6. RUN POLICY ENGINE
    const policyDecision = checkPolicy( merchantPolicy, {actionType: "PRICE_OVERRIDE",offeredPrice:offeredUnitPrice,quantity,msrp: product.msrp,   unitCost: baseCost  }
        );



    // 7. HANDLE PRICE POLICY VIOLATION



    if (!policyDecision.allowed) {
        const discountFloor = product.msrp *(1 - Number(merchantPolicy.maxDiscountPercent) / 100);
        const minMargin =  merchantPolicy.minGrossMarginPercent  / 100;
        const marginFloor =baseCost /(1 - minMargin);
        const negotiationFloor = Math.ceil(Math.max(discountFloor,marginFloor));
        if (offeredUnitPrice <negotiationFloor ) {
            let counterUnitPrice: number;

            // FIRST NEGOTIATION ROUND

            if (input.previousCounterOffer ===undefined ) {

                counterUnitPrice =  Math.ceil((0.95*(Number(product.msrp))) );

            }

            // SUBSEQUENT NEGOTIATION ROUND

            else {

                counterUnitPrice = Math.ceil( (input.previousCounterOffer -0.05*input.previousCounterOffer ));

            }

            counterUnitPrice = Math.max(counterUnitPrice,negotiationFloor );

            await logAgentAction({



                agentRole:

                    "MERCHANT_AGENT",

                action:

                    "PROPOSE_COUNTER_OFFER",

                inputJson: {

                    originalOffer: offeredUnitPrice,  previousCounterOffer:input.previousCounterOffer ?? null,   msrp: product.msrp,   effectiveUnitCost: baseCost,  maxDiscountPercent:  merchantPolicy.maxDiscountPercent, minGrossMarginPercent:   merchantPolicy.minGrossMarginPercent, discountFloor,marginFloor, negotiationFloor,counterUnitPrice
                },
                decision:  "COUNTER_OFFER",
                reason:
                    `Buyer offer is below the safe negotiation range. Counter offer is ₹${counterUnitPrice.toLocaleString("en-IN" )}.` });

            return {
                status:  "counter_offer",
                counterUnitPrice,
                marginPercent:
        policyDecision.marginPercent,
                reason: `The lowest price we can negotiate to is ₹${negotiationFloor.toLocaleString( "en-IN")}.`
             };

        }

    
        await logAgentAction({
            agentRole:"MERCHANT_AGENT",action: "POLICY_CHECK_FAILED", inputJson: { offeredUnitPrice,quantity,sku, effectiveUnitCost: baseCost }, decision:"REJECTED",reason: "Offer violates merchant policy." });
        return {

            status:

                "rejected",

            marginPercent:

                policyDecision.marginPercent,

            reason:

                "Offer violates merchant policy."

        };

    }



    // 8. PRICE IS ACCEPTABLE

    

    // NOW check autonomous spending.


    if ( policyDecision.totalAmount > Number(merchantPolicy.maxAutonomousSpendInr )  ) {

        const approvalId =

            randomUUID();

        // Create human approval request
        await query(  `
            INSERT INTO approvals(id, order_id, requested_amount, status, reason )VALUES (?, ?, ?, 'pending', ?) `,    [approvalId,  orderId, policyDecision.totalAmount, `Transaction exceeds merchant's autonomous spending limit of ₹${Number( merchantPolicy.maxAutonomousSpendInr ).toLocaleString("en-IN")}.` ] );

        // Audit approval requirement

        await logAgentAction({
            orderId,
            agentRole: "MERCHANT_AGENT",action: "AUTONOMOUS_SPEND_LIMIT_EXCEEDED",
            inputJson: { totalAmount:policyDecision.totalAmount, maxAutonomousSpendInr: merchantPolicy.maxAutonomousSpendInr },
            decision: "AWAITING_APPROVAL",
            reason:`Transaction amount ₹${policyDecision.totalAmount.toLocaleString( "en-IN" )} exceeds the autonomous spending limit of ₹${Number(merchantPolicy.maxAutonomousSpendInr ).toLocaleString("en-IN")}.` });

        return {
            status:"awaiting_approval",
            totalAmount:policyDecision.totalAmount,marginPercent:policyDecision.marginPercent,approvalId,reason: `Transaction exceeds the merchant's autonomous spending limit of ₹${Number( merchantPolicy.maxAutonomousSpendInr ).toLocaleString("en-IN")}. Human approval is required.`  };

    }
    // 9. CREATE ORDER

    await query(  `INSERT INTO orders (id,buyer_Id,product_id,quantity, unit_price,total_price,status ) VALUES (?, ?, ?, ?, ?, ?, 'pending_payment') `, [  orderId, buyerId, product.productId, quantity,offeredUnitPrice,policyDecision.totalAmount]

    );



    // 10. RESERVE EXISTING STOCK
    // Even for a backorder, reserve whatever stock
    // the merchant already has.
    if (stockQuantity > 0) {
        await InventoryService.reserveStock(product.productId, stockQuantity );
    }
    // 11. CREATE RAZORPAY TEST ORDER

    const razorpayOrder = await RazorpayService.createTestOrder(orderId, policyDecision.totalAmount );

    // 12. AUDIT SUCCESSFUL ORDER
    await logAgentAction({
        orderId,
        agentRole: "MERCHANT_AGENT",
        action:  "ORDER_ACCEPTED_PAYMENT_INITIATED",inputJson: {
            orderId, rzpOrderId: razorpayOrder.id, agreedUnitPrice: offeredUnitPrice,    quantity,   effectiveUnitCost: baseCost,isBackOrder, supplierQuantity
        }, decision:"ACCEPTED", reason:`Deal sealed. Created Razorpay test order ${razorpayOrder.id } for ₹${policyDecision.totalAmount.toLocaleString( "en-IN" )}.` }
    );

    // 13. FINAL RESPONSE

    return {
        status:"accepted",
        orderId,
        agreedUnitPrice:offeredUnitPrice,totalAmount:policyDecision.totalAmount, marginPercent: policyDecision.marginPercent, razorpayOrder, reason: "Offer meets all policy guidelines. Payment order created."};

};