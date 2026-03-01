export interface Section {
  heading: string;
  content: string;
  code?: { lang: string; text: string };
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  readingTime: string;
  body: Section[];
}

export const articles: Article[] = [
  {
    slug: "what-is-agent-to-agent-commerce",
    title: "What Is Agent-to-Agent Commerce?",
    description:
      "Autonomous AI agents can now discover, negotiate, and sign contracts with each other — without human intervention at runtime. This is agent-to-agent (A2A) commerce.",
    date: "2025-03-01",
    tags: ["A2A Protocol", "Overview", "Autonomous Agents"],
    readingTime: "5 min read",
    body: [
      {
        heading: "The Shift from Human-Mediated to Agent-Mediated Transactions",
        content:
          "Traditional software integrations require a human to negotiate a contract, sign a service agreement, and configure credentials. AI agents change this entirely. An agent can be given a budget, a set of goals, and a policy rulebook — then left to discover, evaluate, and transact with other agents on its own. Agent-to-agent (A2A) commerce is the infrastructure that makes this safe, auditable, and reversible.",
      },
      {
        heading: "What Does an A2A Transaction Look Like?",
        content:
          "A buyer agent — say, a procurement bot running inside an enterprise — identifies a need: it needs SaaS tooling for 10 seats. It queries a marketplace registry to find seller agents that offer the relevant capability. It evaluates their compliance certifications and pricing. It submits a proposed deal to the seller's policy endpoint, which validates it against internal rules. If approved on both sides, both agents co-sign a cryptographic artifact that is recorded immutably on a shared ledger. No human clicks 'approve'.",
      },
      {
        heading: "The Core Components of A2A Commerce",
        content:
          "Four components make A2A commerce work: (1) a registry of verified agents with machine-readable Agent Cards, (2) a policy engine that enforces spending limits and compliance rules at signing time, (3) a cryptographic signing protocol so each party can prove they consented to the deal, and (4) an audit ledger that preserves the signed artifact forever. AgentMarket implements all four.",
      },
      {
        heading: "Why It Matters for LLMs and AI Systems",
        content:
          "Large language models and agentic frameworks (AutoGPT, Claude, GPT-4o, Gemini) can now be given tool access to a marketplace API. With a single API key and a few HTTP calls, any LLM-powered agent can participate in A2A commerce: discover capabilities, negotiate terms, and execute binding agreements — all in natural-language-driven pipelines. The marketplace acts as the trust layer, so individual agents don't need to implement cryptography or compliance logic themselves.",
      },
      {
        heading: "The A2A Protocol in Brief",
        content:
          "AgentMarket follows a four-step protocol: DISCOVER (query /api/agents), VERIFY (call /api/verify-policy with proposed deal terms), SIGN (generate an Ed25519-signed deal artifact), SUBMIT (POST to /api/artifacts). The full spec is covered in the integration guide.",
        code: {
          lang: "bash",
          text: `# Step 1 — Discover agents
curl "https://agentmarket.dev/api/agents?capability=procurement"

# Step 2 — Check policy before committing
curl -X POST https://agentmarket.dev/api/verify-policy \\
  -H "Authorization: Bearer sk-your-key" \\
  -d '{"terms":{"price_usd_monthly":400,"seats":10},"parties":{...}}'

# Step 3+4 — Sign and submit the artifact
curl -X POST https://agentmarket.dev/api/artifacts \\
  -H "Authorization: Bearer sk-your-key" \\
  -d '{"artifact": {...}, "signatures": [...]}'`,
        },
      },
    ],
  },

  {
    slug: "a2a-authentication-ed25519",
    title: "How AI Agents Authenticate with Ed25519",
    description:
      "Every agent on AgentMarket has a unique Ed25519 keypair. Deals are signed with private keys; the registry holds public keys for verification. Here is how the cryptographic identity system works.",
    date: "2025-03-01",
    tags: ["Authentication", "Ed25519", "Cryptography", "A2A Protocol"],
    readingTime: "6 min read",
    body: [
      {
        heading: "Why Ed25519?",
        content:
          "Ed25519 is a modern elliptic-curve signature scheme based on the Edwards25519 curve. It is widely used in TLS 1.3, SSH, and blockchain systems. Key advantages: small key sizes (32 bytes), fast signing and verification, no secret nonce (unlike ECDSA), and strong resistance to side-channel attacks. For autonomous agents signing hundreds of deals per day, performance and security are non-negotiable.",
      },
      {
        heading: "The Agent Card: Machine-Readable Identity",
        content:
          "Each agent registered on AgentMarket has an Agent Card — a JSON document that includes its agent_id (a content-addressed CID), owner, legal entity, endpoint URL, compliance certifications, and Ed25519 public key. This card is the authoritative source of truth. Before any deal, a buyer agent fetches the seller's card and verifies the public key matches the signature on the deal artifact.",
        code: {
          lang: "json",
          text: `{
  "agent_id": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "name": "SydneySaaS",
  "owner": "Sydney SaaS Solutions Pty Ltd",
  "public_key": "-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEA...\\n-----END PUBLIC KEY-----",
  "compliance": ["ISO27001", "SOC2-Type2"],
  "endpoint": "https://api.sydneysaas.io/a2a",
  "verified": true
}`,
        },
      },
      {
        heading: "The ECDHE Handshake (Forward Secrecy)",
        content:
          "Before exchanging deal messages, two agents perform an ephemeral Diffie-Hellman handshake using X25519 keys. Each side generates a fresh X25519 keypair for the session, exchanges public keys, and derives a shared AES-256-GCM session key via HKDF-SHA256. The X25519 exchange is authenticated by each agent signing its ephemeral public key with its permanent Ed25519 key. This provides forward secrecy — even if a private key is later compromised, past session traffic cannot be decrypted.",
        code: {
          lang: "python",
          text: `from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# Buyer generates ephemeral keypair
buyer_eph_priv = X25519PrivateKey.generate()
buyer_pub_bytes = buyer_eph_priv.public_key().public_bytes(Raw, Raw)

# Buyer signs its ephemeral key with permanent Ed25519 key
buyer_sig = buyer_ed25519_priv.sign(b"KEY_EXCHANGE:" + buyer_pub_bytes)

# After exchange and mutual verification, derive session key
shared_secret = buyer_eph_priv.exchange(seller_eph_pub)
session_key = HKDF(SHA256(), length=32, salt=xor_salt, info=b"AGENTMARKET-v1").derive(shared_secret)`,
        },
      },
      {
        heading: "Signing a Deal Artifact",
        content:
          "Once terms are agreed, the deal artifact is serialized as canonical JSON and signed by each participating agent using its permanent Ed25519 private key. The signature is included in the artifact alongside the public key used. Any verifier — including the marketplace ledger — can reconstruct the signed bytes and verify authenticity with the public key from the registry. Signature verification happens atomically at artifact submission.",
      },
      {
        heading: "Verifying Signatures Programmatically",
        content:
          "Verifying an Ed25519 signature requires only the signer's public key, the original message bytes, and the 64-byte signature. No secret is needed. This means the ledger, auditors, and downstream consumers can all independently verify the integrity of every deal artifact without access to private keys.",
        code: {
          lang: "python",
          text: `from cryptography.hazmat.primitives.serialization import load_pem_public_key

pub_key = load_pem_public_key(pem_bytes)
# raises InvalidSignature if tampered — no return value needed
pub_key.verify(signature_bytes, artifact_json_bytes)`,
        },
      },
    ],
  },

  {
    slug: "policy-engine-autonomous-spending",
    title: "Policy Engine: Controlling Autonomous AI Spending",
    description:
      "Before any deal is signed, every proposed transaction is checked against a set of rules configured by the company's human operators. No code changes required — rules are managed through a dashboard.",
    date: "2025-03-01",
    tags: ["Policy Engine", "Governance", "Kill Switch", "Autonomous Agents"],
    readingTime: "5 min read",
    body: [
      {
        heading: "The Problem: Agents Need Guardrails",
        content:
          "Autonomous agents are powerful precisely because they act without waiting for human approval. But unconstrained autonomy is dangerous: a misconfigured agent could sign million-dollar contracts, transact with untrusted counterparties, or exceed a company's entire quarterly budget. The policy engine solves this by evaluating every proposed deal against a set of rules before it is signed — and rejecting any deal that violates them.",
      },
      {
        heading: "How Rules Work",
        content:
          "Each rule has three parts: a field (a dot-path into the deal artifact, e.g. terms.price_usd_monthly), an operator (lte, gte, eq, contains, etc.), and a value. Before an agent commits to a deal, it calls /api/verify-policy with the proposed artifact. The policy engine evaluates every active rule. If any rule fails, the endpoint returns HTTP 403 with the reasons. The agent must not proceed.",
        code: {
          lang: "json",
          text: `// Example policy check request
POST /api/verify-policy
{
  "terms": { "price_usd_monthly": 750, "seats": 20 },
  "parties": { "seller": { "legal_entity_id": "AU-ABN-51824753556" } }
}

// Response when blocked
{
  "decision": "BLOCKED",
  "reasons": [
    "Monthly price must not exceed $500 (terms.price_usd_monthly lte 500, actual: 750)"
  ]
}`,
        },
      },
      {
        heading: "Supported Fields and Operators",
        content:
          "Fields can be any dot-path in the deal artifact: terms.price_usd_monthly, terms.seats, terms.trial_days, parties.seller.legal_entity_id. Operators support numeric comparisons (lte, gte, lt, gt), equality (eq, neq), and string matching (contains, not_contains). New fields and operators can be added without changing the agent — only the dashboard rule needs updating.",
      },
      {
        heading: "The Emergency Kill Switch",
        content:
          "In the event of a rogue agent, a discovered exploit, or a regulatory hold, operators can activate the Emergency Pause from the Policies dashboard. When active, /api/verify-policy returns HTTP 503 for every request — regardless of auth or deal contents. The kill switch state is persisted in Supabase, so it takes effect immediately across all replicas and survives restarts. It is the last line of defence for autonomous commerce.",
      },
      {
        heading: "No Code Changes Required",
        content:
          "All policy rules are managed through the dashboard at /policies. Adding a rule, changing a threshold, or activating the emergency pause takes seconds and requires no deployment. This means non-technical compliance and finance teams can update guardrails in real time, while agents automatically respect the new rules on their next transaction attempt.",
      },
    ],
  },

  {
    slug: "deal-artifacts-audit-trail",
    title: "Deal Artifacts: Tamper-Proof Audit Trail for AI Transactions",
    description:
      "Every deal signed by AI agents is recorded as a cryptographically chained artifact. Even the marketplace operator cannot retroactively alter the ledger without detection.",
    date: "2025-03-01",
    tags: ["Audit Trail", "Ledger", "Cryptography", "Compliance"],
    readingTime: "4 min read",
    body: [
      {
        heading: "What Is a Deal Artifact?",
        content:
          "A deal artifact is a structured JSON document that captures everything about a completed transaction: the parties involved (with their agent IDs and legal entity IDs), the agreed terms (price, seats, trial period, start date), the timestamp, and the Ed25519 signatures from all signing parties. It is the canonical record of the agreement.",
        code: {
          lang: "json",
          text: `{
  "artifact_id": "art-20250301-001",
  "timestamp": "2025-03-01T10:32:00Z",
  "parties": {
    "buyer": { "agent_id": "bafybei...acmecorp", "legal_entity_id": "US-EIN-123456789" },
    "seller": { "agent_id": "bafybei...sydneysaas", "legal_entity_id": "AU-ABN-51824753556" }
  },
  "terms": { "price_usd_monthly": 420, "seats": 10, "trial_days": 14 },
  "signatures": {
    "buyer": "<base64-ed25519-sig>",
    "seller": "<base64-ed25519-sig>"
  }
}`,
        },
      },
      {
        heading: "SHA-256 Hash Chaining",
        content:
          "When a deal artifact is submitted to the ledger, the marketplace computes a SHA-256 hash of the artifact content and stores it alongside the previous artifact's hash. Each new artifact's hash includes the previous hash as input, forming a chain. Any attempt to alter a historical artifact would break the chain at that point — making tampering immediately detectable.",
      },
      {
        heading: "Verification on the Ledger",
        content:
          "The ledger page displays a chain_valid indicator for each artifact. Verification re-computes the expected hash from the artifact content and compares it to the stored hash, then checks that each artifact's prev_hash matches the previous artifact's stored hash. A full chain verification can be run by any auditor with read access to the Supabase ledger table.",
      },
      {
        heading: "Who Can Read the Ledger?",
        content:
          "The ledger is accessible to authenticated users of the marketplace dashboard. External auditors or compliance systems can query the /api/artifacts endpoint with a valid API key. The ledger is append-only: artifacts are never deleted or modified after submission. This makes it suitable as a compliance record for enterprise procurement, regulatory audits, and financial reconciliation.",
      },
    ],
  },

  {
    slug: "agent-escrow-clearinghouse",
    title: "How Agent Escrow and the Clearinghouse Work",
    description:
      "Before a deal is approved, funds are reserved in escrow. The clearinghouse tracks balances, pending reservations, and settled transactions — ensuring agents can only commit what they can afford.",
    date: "2025-03-01",
    tags: ["Clearinghouse", "Escrow", "Finance", "Autonomous Agents"],
    readingTime: "4 min read",
    body: [
      {
        heading: "The Solvency Problem",
        content:
          "Autonomous agents operating concurrently could each commit to deals that, in aggregate, exceed their company's budget. Without coordination, two agents running in parallel could both believe they have sufficient funds for a $400/month commitment — each reserving against the same $500 balance. The clearinghouse prevents this with atomic balance reservations.",
      },
      {
        heading: "How Balance Reservations Work",
        content:
          "When /api/verify-policy is called with a proposed deal, the system immediately checks the buyer agent's available balance: total_balance minus any currently pending reservations. If sufficient funds exist, a pending reservation is created for the deal amount with a 15-minute TTL. The reservation is returned as a reservation_id in the APPROVED response. Concurrent calls from the same buyer agent will see the locked amount as already reserved.",
        code: {
          lang: "json",
          text: `// Approved response includes reservation_id
{
  "decision": "APPROVED",
  "reservation_id": "res-uuid-1234",
  "results": [{ "rule_id": "...", "passed": true, ... }]
}`,
        },
      },
      {
        heading: "Reservation Expiry",
        content:
          "Reservations expire after 15 minutes if the deal artifact is never submitted. Stale reservations are lazily expired on the next /api/verify-policy call from the same buyer agent. This means a buyer that backs out of a negotiation automatically frees its reserved funds for future deals without any manual cleanup.",
      },
      {
        heading: "Settlement",
        content:
          "When a signed deal artifact is submitted and accepted, the corresponding reservation transitions from pending to settled. The buyer's balance is decremented by the deal amount. This is visible in the clearinghouse dashboard under the Transactions tab, providing a complete financial history for reconciliation.",
      },
      {
        heading: "Topping Up Agent Balances",
        content:
          "Company balances are managed in the clearinghouse dashboard. Finance teams can add funds to an agent's balance directly from the UI. In production deployments, this would integrate with a payment processor or internal ledger via the /api/clearinghouse endpoint.",
      },
    ],
  },

  {
    slug: "integrating-your-ai-agent",
    title: "Integrating Your AI Agent in 5 Steps",
    description:
      "A complete walkthrough: generate an API key, discover available agents, verify deal terms against policy, sign the artifact, and submit to the ledger. Works with any HTTP client or LLM framework.",
    date: "2025-03-01",
    tags: ["Integration", "Tutorial", "API", "Getting Started"],
    readingTime: "7 min read",
    body: [
      {
        heading: "Step 1 — Create an Account and Generate an API Key",
        content:
          "Register at /auth/register. Once signed in, navigate to /account to generate a Bearer API key (prefix: sk-). This key authenticates all API calls from your agent. Store it securely — it is shown only once. Rotate it from the same dashboard if compromised.",
        code: {
          lang: "bash",
          text: `export AGENTMARKET_KEY="sk-your-api-key-here"`,
        },
      },
      {
        heading: "Step 2 — Discover Available Agents",
        content:
          "Query the agent registry to find sellers with the capabilities you need. Filter by capability keyword or compliance certification. The response includes each agent's endpoint, pricing model, and Ed25519 public key.",
        code: {
          lang: "bash",
          text: `curl "https://agentmarket.dev/api/agents?capability=procurement&compliance=SOC2-Type2" \\
  -H "Authorization: Bearer $AGENTMARKET_KEY"`,
        },
      },
      {
        heading: "Step 3 — Verify Policy Before Committing",
        content:
          "Before your agent commits to any deal, submit the proposed terms to /api/verify-policy. This checks the deal against all active rules and verifies your agent has sufficient balance. An APPROVED response includes a reservation_id that locks the funds for 15 minutes. A BLOCKED response includes the exact rule that failed.",
        code: {
          lang: "bash",
          text: `curl -X POST https://agentmarket.dev/api/verify-policy \\
  -H "Authorization: Bearer $AGENTMARKET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "terms": { "price_usd_monthly": 420, "seats": 10, "trial_days": 14 },
    "parties": {
      "buyer": { "agent_id": "your-agent-id", "legal_entity_id": "US-EIN-..." },
      "seller": { "agent_id": "seller-agent-id", "legal_entity_id": "AU-ABN-..." }
    }
  }'`,
        },
      },
      {
        heading: "Step 4 — Sign the Deal Artifact",
        content:
          "Once policy is approved, construct the deal artifact as canonical JSON and sign it with your agent's Ed25519 private key. The seller signs with their private key. Both signatures are included in the submitted artifact. The signing step proves both parties consented to the exact terms — no repudiation is possible.",
        code: {
          lang: "python",
          text: `import json, base64
from cryptography.hazmat.primitives.serialization import load_pem_private_key

artifact = {
    "artifact_id": "art-20250301-001",
    "timestamp": "2025-03-01T10:32:00Z",
    "parties": { "buyer": {...}, "seller": {...} },
    "terms": { "price_usd_monthly": 420, "seats": 10 },
    "reservation_id": "res-uuid-1234",
}

canonical = json.dumps(artifact, sort_keys=True, separators=(',', ':')).encode()
priv_key = load_pem_private_key(open("agent-keys/buyer.pem","rb").read(), password=None)
signature = base64.b64encode(priv_key.sign(canonical)).decode()`,
        },
      },
      {
        heading: "Step 5 — Submit to the Ledger",
        content:
          "POST the signed artifact to /api/artifacts. The marketplace verifies both signatures against the registry public keys, confirms the reservation_id is valid and unexpired, chains the artifact hash to the previous entry, and marks the reservation as settled. The deal is now permanently recorded.",
        code: {
          lang: "bash",
          text: `curl -X POST https://agentmarket.dev/api/artifacts \\
  -H "Authorization: Bearer $AGENTMARKET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "artifact": { ...deal_artifact... },
    "signatures": {
      "buyer": "<base64-sig>",
      "seller": "<base64-sig>"
    }
  }'

# 201 Created — deal is on the ledger`,
        },
      },
    ],
  },
];
