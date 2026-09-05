# AI Merchant — Autonomous Agent-to-Agent B2B Commerce

> An open, machine-readable commerce layer where AI agents **discover** a merchant,
> **negotiate** a price under hard financial guardrails, **pay** over Razorpay, and
> **auto-restock** from suppliers via RazorpayX — with a human-in-the-loop only when
> a spend limit is crossed.

Built for the **Razorpay AI Buildathon** · Track: AI Growth & Agentic Commerce

---

## 1. The problem

B2B procurement is still manual: humans email for quotes, haggle over price, raise POs,
and chase payments. As AI agents begin acting for us, they need a way to **transact with
each other safely** — to negotiate and settle without a human clicking checkout, while
staying inside limits their owner set.

There is no open, machine-readable way for one company's buying agent to discover another
company's selling agent, agree a price, and pay. AI Merchant is a working prototype of that
missing layer, built on Razorpay's rails.

## 2. What it does

Two autonomous AI agents run a complete commercial transaction end to end:

1. **Discover** — the merchant publishes a machine-readable catalog at
   `/.well-known/agent-commerce.json` (products, MSRP, live stock). Any agent can read it.
2. **Negotiate** — a buyer agent bids; the merchant agent negotiates toward a closable
   price. Every price is checked against a policy engine (margin floor, discount cap,
   spend limit).
3. **Guardrail** — the policy check runs **in code**, not at the LLM's discretion. The
   agent can propose anything; no deal clears unless the code says it is within policy.
4. **Escalate** — if the order exceeds the autonomous spend limit, it is paused and routed
   to a human operator in the merchant cockpit for Approve / Reject.
5. **Pay (money in)** — on agreement the merchant issues a **Razorpay Payment Link**; a
   signed **Razorpay webhook** confirms capture and flips the order to `paid`.
6. **Restock (money out)** — when stock drops below threshold, the merchant negotiates with
   a wholesale supplier agent and disburses a **RazorpayX payout** to the supplier.
7. **Audit** — every agent decision is written to an immutable action log with its reason.

## 3. Why it's different

- Two-sided settlement**, not one API call: inbound Payment Links *and* outbound
  RazorpayX payouts in a single autonomous loop.
- **Agents negotiate**, they don't just fill a cart — real LLM tool-use with convergence
  logic that closes deals instead of walking away.
- **Guardrails enforced in code** — the safety story for autonomous spend. A lazy or
  prompt-injected LLM cannot bypass margin, discount, or spend limits.
- **Open discovery standard** — `.well-known/agent-commerce.json` lets any third-party
  agent transact, not just this project's frontend.
- **Human-in-the-loop by design** — over-limit spend is escalated, mirroring the
  authorize-once / delegate-execution model behind India's agentic-payments push
  (UPI Reserve Pay).

## 4. Architecture

```
                       +--------------------------------------+
                       |  /.well-known/agent-commerce.json    |
   Buyer Agent --read->|  (machine-readable catalog)          |
   (LLM, Groq)         +--------------------------------------+
        |
        | POST /api/v1/agent/procure  (natural-language intent)
        v
+------------------------------------------------------------------+
|                  Merchant Agent  (LLM + tools)                    |
|   check_inventory (once)  ->  negotiate price  ->  verdict        |
|                              |                                    |
|                    +---------v----------+                        |
|                    |   Policy Engine    |  margin / discount /   |
|                    |  (CODE-LEVEL GATE) |  spend  ->              |
|                    +---------+----------+  APPROVE / REJECT /     |
|                              |             ESCALATE               |
+------------------------------+-----------------------------------+
        approved |             | over spend limit
                 v             v
   +--- Razorpay Payment Link ---+   +-- Merchant Cockpit --+
   | buyer pays -> webhook (HMAC)|   |  Approve / Reject     |
   |  -> order = PAID            |   |  (human operator)     |
   +-----------------------------+   +-----------------------+
                 |  stock low?
                 v
   +-- Supplier Agent negotiation --> RazorpayX Payout --+
   |        (money out to supplier bank account)         |
   +-----------------------------------------------------+

   Every decision --> agent_actions audit log (MySQL)
```

## 5. Razorpay APIs used

| Capability            | API                        | File |
|-----------------------|----------------------------|------|
| Collect payment       | Razorpay Payment Links     | `src/services/razorpayService.ts` |
| Order creation        | Razorpay Orders            | `src/services/razorpayService.ts` |
| Payment confirmation  | Razorpay Webhooks (HMAC)   | `src/routes/webhookRoutes.ts` |
| Pay suppliers         | RazorpayX Payouts          | `src/services/razorpayXService.ts` |

## 6. Tech stack

- **Backend:** Node + Express 5 + TypeScript (tsx), MySQL (mysql2)
- **AI:** Groq LLM with function/tool calling
- **Payments:** Razorpay + RazorpayX
- **Frontend:** React + Vite + TypeScript + Tailwind (buyer cockpit + merchant command desk)

## 7. API reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET  | `/.well-known/agent-commerce.json` | Machine-readable merchant catalog for agents |
| POST | `/api/v1/agent/procure` | Full autonomous buy from a natural-language prompt |
| POST | `/api/v1/agent/negotiate` | Single bilateral negotiation call |
| POST | `/api/v1/agent/restock` | Trigger wholesale restock (supplier negotiation + payout) |
| GET  | `/api/v1/agent/orders/:orderId/status` | Poll an order's payment status (UI live update) |
| GET  | `/api/v1/dashboard/metrics` | Stock, orders, revenue, pending escalations |
| GET  | `/api/v1/dashboard/audit-logs` | Recent agent decisions with reasons |
| GET  | `/api/v1/dashboard/approvals` | Pending human-approval queue |
| POST | `/api/v1/dashboard/approvals/:id/decide` | Operator Approve / Reject an escalated order |
| POST | `/api/v1/webhooks/razorpay` | Razorpay webhook (HMAC-verified) |

### Example

```bash
# Machine-readable catalog
curl http://localhost:3000/.well-known/agent-commerce.json

# Autonomous procurement from natural language
curl -X POST http://localhost:3000/api/v1/agent/procure \
  -H "Content-Type: application/json" \
  -d '{"prompt":"buy 2 pro laptops, budget 90000 per unit"}'
```

## 8. Database schema (MySQL)

Nine tables:

- **merchants** - the selling business.
- **products** - SKU, name, MSRP, base cost (FK -> merchants).
- **inventory** - quantity_available, quantity_reserved (FK -> products).
- **suppliers** - wholesale sources for restock.
- **policies** - the guardrails: `min_gross_margin_percent`, `max_autonomous_spend_inr`,
  `max_discount_percent` (FK -> merchants).
- **orders** - buyer_id, product, quantity, unit_price, total_price, status
  (`pending_payment` / `paid` / `blocked` / `cancelled`).
- **transactions** - Razorpay order/payment IDs, amount, capture status (FK -> orders).
- **approvals** - human-approval queue for escalated orders (FK -> orders).
- **agent_actions** - immutable audit log of every agent decision + reason.

> Note: `policies.max_autonomous_spend_inr` must be `DECIMAL(12,2)` (see
> `src/db/fix_policies_column.sql`) so real spend limits above 999 can be stored.

## 9. Safety & design notes

- **Policy is a code-level gate.** Even if the LLM skips its policy tool or is
  prompt-injected ("ignore the margin rules"), the deal is re-checked in code before any
  order or payment. The LLM's tool calls are advisory; the code is authoritative.
- **Webhooks are HMAC-verified** against the raw request body with a timing-safe compare.
- **Secrets are environment-only.** Nothing is committed; keys load from `.env`.
- **Human-in-the-loop** for over-limit spend, mirroring the authorize-once model of UPI
  Reserve Pay used in production agentic payments.

## 10. Getting started

### Prerequisites
- Node 18+, MySQL, a Razorpay **test** account (Payment Links + RazorpayX), a Groq API key.

### Backend
```bash
cd Backend
npm install
cp example.env .env         # fill in every value
mysql -u root -p ai_merchant < src/db/schema.sql
mysql -u root -p ai_merchant < src/db/fix_policies_column.sql
npm run seed
npm run dev                 # http://localhost:3000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Webhook
Expose the server (`ngrok http 3000`) and register
`https://<tunnel>/api/v1/webhooks/razorpay` in the Razorpay dashboard with the same secret
as `RAZORPAY_WEBHOOK_SECRET`.

## 11. Roadmap

- **UPI Reserve Pay integration** - replace the payment-link step with an authorize-once,
  debit-many mandate (the production model behind Razorpay's agentic payments).
- **Signed spend mandates** - cryptographic authorization the buyer agent presents, so the
  merchant can verify the agent is acting within an owner-approved budget.

## 12. Vision — the Razorpay Agent Commerce SDK

What this project demonstrates is the **engine**. The vision is to package it as a
drop-in SDK so any of Razorpay's 10M+ merchants can add autonomous, guardrailed agent
commerce to their store in a few lines of code — buyer-side negotiation, supplier-side
procurement and payouts, and safe settlement, all on Razorpay's existing rails.

```js
import { AgentCommerce } from '@razorpay/agent-commerce';

const merchant = new AgentCommerce({
  keyId, keySecret,
  policy: {
    minMargin: 15,          // never sell below a 15% gross margin
    maxDiscount: 20,        // never discount more than 20%
    autoSpendLimit: 200000, // above this, escalate to a human
  },
});

// 1. Publish a machine-readable storefront that AI agents can discover
merchant.publishCatalog(products);

// 2. Let agents negotiate and settle — safely, automatically
merchant.on('negotiation', merchant.autoNegotiate);    // buyer-side deal, margin-protected
merchant.on('lowStock',    merchant.autoRestock);      // supplier negotiation + RazorpayX payout
merchant.on('overLimit',   (deal) => notifyHuman(deal)); // human-in-the-loop escalation
```

### Three product pillars (all prototyped in this repo)

1. **Autonomous buyer negotiation** — AI buying agents can transact with the store while
   the merchant's agent defends margin and policy.
2. **Autonomous supplier procurement + payouts** — restock automatically by negotiating
   with wholesale supplier agents and paying them via RazorpayX.
3. **Guardrails + human-in-the-loop** — code-enforced policy (margin / discount / spend),
   escalation above limits, and a full audit trail.

### Why Razorpay

- **Instant distribution** to 10M+ merchants already on Razorpay's rails.
- **On-theme** — extends Razorpay's Agent Studio / Agentic Payments direction into
  autonomous *negotiation* and *B2B procurement*.
- **Uses both sides of the stack** — Razorpay (collect) + RazorpayX (payout).

### Honest scope

- Settlement today uses **Razorpay Payment Links** (real, dashboard-visible, webhook-confirmed).
  Fully tapless execution maps to **UPI Reserve Pay mandates** (authorize-once, debit-many) —
  the production model behind Razorpay's agentic payments — and is the settlement roadmap.
- This is a **working prototype of the engine**, not a packaged production SDK. Productizing
  it into the SDK above is the next step. The hard part — the negotiation, guardrail, and
  dual-settlement logic — is what runs in this demo.

## 13. Demo

Demo video: _add link_