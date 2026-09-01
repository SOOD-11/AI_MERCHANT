import axios from 'axios';

interface  Scenerio{

name: string,
sku:string,
quantity: number,
offeredUnitPrice: number,
buyerAgentId: string



}

const Api_base= process.env.API_BASE_URL || 'http://localhost:8000';
export const runScenerio= async(input: Scenerio) :Promise<void> =>{

console.log(`\n======================================================`);
  console.log(`▶ Running Scenario: ${input.name}`);
  console.log(`  Intent: Buy ${input.quantity}x ${input.sku} @ ₹${input.offeredUnitPrice.toLocaleString('en-IN')}/unit`);
  console.log(`------------------------------------------------------`);  


const response= await axios.post(`${Api_base}/api/v1/agent/negotiate`,{
        sku: input.sku,
        quantity: input.quantity,
        offeredUnitPrice: input.offeredUnitPrice,
        buyerAgentId: input.buyerAgentId,
      })


const result=response.data;
console.log(` Status: ${result.status}`);
    console.log(` Reason: ${result.reason}`);

    if (result.status === 'ACCEPTED') {
      console.log(` Order ID: ${result.orderId}`);
      console.log(` Total Amount: ₹${result.totalAmount?.toLocaleString('en-IN')}`);
      console.log(` Razorpay Order ID: ${result.razorpayOrder?.id || 'N/A'}`);
    } else if (result.status === 'COUNTER_OFFER') {
      console.log(` Counter Unit Price: ₹${result.counterUnitPrice?.toLocaleString('en-IN')}`);
    } else if (result.status === 'AWAITING_HUMAN_APPROVAL') {
      console.log(` Approval Request ID: ${result.approvalId}`);
      console.log(` Total Order Value: ₹${result.totalAmount?.toLocaleString('en-IN')}`);
    }

  } catch (error: any) {
    console.error(` Error executing scenario:`, error.message);
  }



  export const runAllScenarios = async (): Promise<void> => {
  console.log(`Starting Buyer Agent Simulation against ${API_BASE}...`);

  // Scenario 1: Profitable Deal -> ACCEPTED
  await runScenerio({
    name: '1. Standard Profitable Purchase',
    sku: 'LAPTOP-PRO-15',
    quantity: 1,
    offeredUnitPrice: 78000,
    buyerAgentId: 'agent_buyer_techcorp',
  });

  // Scenario 2: Aggressive Offer (< 15% margin) -> COUNTER_OFFER
  await runScenerio({
    name: '2. Aggressive Low-Ball Negotiation',
    sku: 'LAPTOP-PRO-15',
    quantity: 1,
    offeredUnitPrice: 66000,
    buyerAgentId: 'agent_buyer_bargain_hunter',
  });

  // Scenario 3: Large Order Exceeding ₹50k spend limit -> AWAITING_HUMAN_APPROVAL
  await runScenerio({
    name: '3. High-Value Bulk Procurement',
    sku: 'LAPTOP-PRO-15',
    quantity: 5,
    offeredUnitPrice: 75000,
    buyerAgentId: 'agent_buyer_enterprise_corp',
  });

  console.log(`\n======================================================\n`);
};

runAllScenarios().catch(console.error);


