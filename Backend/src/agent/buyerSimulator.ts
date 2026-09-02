import axios from 'axios';

 export interface Scenario {
  name: string;
  sku: string;
  quantity: number;
  offeredUnitPrice: number;
  buyerAgentId: string;
}

const API_BASE =
  process.env.API_BASE_URL || 'http://localhost:3000';
const runScenario = async (
  input: Scenario
): Promise<void> => {

  console.log(`\n======================================================`);
  console.log(`▶ Running Scenario: ${input.name}`);
  console.log(
    `  Intent: Buy ${input.quantity}x ${input.sku} @ ₹${input.offeredUnitPrice.toLocaleString('en-IN')}/unit`
  );
  console.log(`------------------------------------------------------`);

  try {

    let currentOffer = input.offeredUnitPrice;

    let previousCounterOffer:
      number | undefined = undefined;

    let round = 1;

    while (round <= 10) {

      console.log(`\n  Negotiation Round ${round}`);
      console.log(
        `  Buyer offers: ₹${currentOffer.toLocaleString('en-IN')}/unit`
      );

      const response = await axios.post(
        `${API_BASE}/api/v1/agent/negotiate`,
        {
          sku: input.sku,
          quantity: input.quantity,
          offeredUnitPrice: currentOffer,
          buyerAgentId: input.buyerAgentId,

          // IMPORTANT:
          // Send merchant's previous counter
          previousCounterOffer,
        }
      );

      const result = response.data;

      console.log(`  Status: ${result.status}`);
      console.log(`  Reason: ${result.reason}`);

      // ============================================
      // DEAL ACCEPTED
      // ============================================

      if (result.status === 'accepted') {

        console.log(
          `  ✓ Deal accepted at ₹${result.agreedUnitPrice?.toLocaleString('en-IN')}/unit`
        );

        console.log(
          `  Order ID: ${result.orderId}`
        );

        console.log(
          `  Total Amount: ₹${result.totalAmount?.toLocaleString('en-IN')}`
        );

        console.log(
          `  Razorpay Order ID: ${
            result.razorpayOrder?.id || 'N/A'
          }`
        );

        break;
      }

      // ============================================
      // MERCHANT COUNTER OFFER
      // ============================================

      if (result.status === 'counter_offer') {

        const counter =
          result.counterUnitPrice;

        console.log(
          `  ← Merchant counters: ₹${counter?.toLocaleString('en-IN')}/unit`
        );

        if (!counter || counter <= 0) {

          console.log(
            `  ✗ Invalid counter offer received.`
          );

          break;
        }

        /*
         * Save merchant's counter.
         *
         * This is the value that gets sent as
         * previousCounterOffer in the next request.
         */
        previousCounterOffer = counter;

        /*
         * Buyer agent decides its next offer.
         *
         * For the simulator we move halfway toward
         * the merchant's counter.
         *
         * Example:
         *
         * Buyer:    66,000
         * Merchant: 76,471
         *
         * Next buyer offer:
         * (66,000 + 76,471) / 2
         * = 71,236
         */

        currentOffer = Math.ceil(
          (currentOffer + counter) / 2
        );

        round++;

        continue;
      }

      // ============================================
      // HUMAN APPROVAL REQUIRED
      // ============================================

      if (result.status === 'awaiting_approval') {

        console.log(
          `  ⏳ Human approval required`
        );

        console.log(
          `  Approval Request ID: ${result.approvalId}`
        );

        console.log(
          `  Total Order Value: ₹${result.totalAmount?.toLocaleString('en-IN')}`
        );

        break;
      }

      // ============================================
      // REJECTED
      // ============================================

      if (result.status === 'rejected') {

        console.log(
          `  ✗ Negotiation rejected`
        );

        break;
      }

      console.log(
        `  ✗ Unknown negotiation status: ${result.status}`
      );

      break;
    }

    if (round > 10) {

      console.log(
        `  ✗ Negotiation ended after maximum 5 rounds.`
      );

    }

  } catch (error: any) {

    console.error(
      ` Error executing scenario:`,
      error.message
    );

  }
};


const runAllScenarios = async (): Promise<void> => {

  console.log(
    `Starting Buyer Agent Simulation against ${API_BASE}...`
  );

  // Scenario 1
  await runScenario({
    name: '1. Standard Profitable Purchase',
    sku: 'LAPTOP-PRO-15',
    quantity: 1,
    offeredUnitPrice: 83000,
    buyerAgentId: 'agent_buyer_techcorp',
  });

  // Scenario 2
  await runScenario({
    name: '2. Aggressive Low-Ball Negotiation',
    sku: 'LAPTOP-PRO-15',
    quantity: 1,
    offeredUnitPrice: 66000,
    buyerAgentId: 'agent_buyer_bargain_hunter',
  });

  // Scenario 3
  await runScenario({
    name: '3. High-Value Bulk Procurement',
    sku: 'LAPTOP-PRO-15',
    quantity: 5,
    offeredUnitPrice: 75000,
    buyerAgentId: 'agent_buyer_enterprise_corp',
  });

  console.log(
    `\n======================================================\n`
  );
};


runAllScenarios().catch(console.error);