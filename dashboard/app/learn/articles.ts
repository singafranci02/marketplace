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
    slug: "what-is-crypto-ip-licensing",
    title: "What Is Crypto IP Licensing?",
    description:
      "Memecoins and DeFi bots are forked daily with no attribution and no rev share. The IP Vault fixes this — a marketplace where creators escrow crypto assets under machine-enforceable license terms.",
    date: "2026-03-01",
    tags: ["IP Vault", "Overview", "Agent-Native"],
    readingTime: "4 min read",
    body: [
      {
        heading: "The Problem With Traditional IP",
        content:
          "In the crypto world, IP is copied constantly. A trading bot that took months to tune gets forked in minutes. A memecoin art pack is ripped from GitHub and relaunched on a competing token. A Solidity contract template is copied with the attribution comment deleted. Traditional IP law is too slow and too expensive to enforce in an environment where assets move at blockchain speed. Creators have no mechanism to prove they made something first, or to collect when their work generates value for others.",
      },
      {
        heading: "Enter the IP Vault",
        content:
          "The IP Vault is a marketplace where creators escrow crypto assets under machine-enforceable license terms. Trading bots, memecoin art packs, smart contract templates, and narrative assets are uploaded to IPFS, content-addressed with a CID, and escrowed into the vault alongside a license template. The license template specifies rev share percentage, duration, maximum licensees, and minimum TVS (total value settled). Any agent that wants to use the IP must negotiate and activate a license — autonomously, without a lawyer.",
      },
      {
        heading: "What Kinds of IP Can You Escrow?",
        content:
          "The vault currently supports four IP types. trading_bot: MEV scripts, launch snipers, and DeFi automation strategies. memecoin_art: Layered PNG/SVG packs, brand identity kits, and character IP for token launches. smart_contract: Audited Solidity templates for bonding curves, liquidity locks, and token launches. narrative: Lore packs, community storylines, and worldbuilding IP licensed for derivative projects. Each type gets an IPFS CID as its content address. The CID changes if a single byte of the asset changes — making content authenticity cryptographically verifiable.",
      },
      {
        heading: "Agent-Native by Design",
        content:
          "No humans need to be involved at runtime. A creator agent escrows IP via POST /api/vault. A licensee agent discovers it via GET /api/vault, initiates a license via POST /api/license/{vault_id}, and negotiates terms via A2A v0.3 JSON-RPC. When both agents agree, a dual-signed ip_license_contract artifact is written to the SHA-256 Merkle ledger. The entire lifecycle — from discovery to signed license — runs without a single human click.",
      },
      {
        heading: "Living Licenses",
        content:
          "Static rev share rates create misaligned incentives. A bot that generates 100x returns on a 5% rev share was priced wrong from day one. The IP Vault solves this with performance triggers — conditions baked into the license artifact that automatically adjust terms when thresholds are hit. If a licensed trading bot exceeds 10 ETH PNL, the rev share automatically bumps to 10%. Triggers are negotiated upfront and enforced by the system, not by the licensor chasing payments.",
        code: {
          lang: "json",
          text: `{
  "rev_share_pct": 5,
  "duration_days": 30,
  "max_licensees": 10,
  "min_tvs_usd": 5000,
  "performance_triggers": [
    { "pnl_threshold_eth": 10, "new_rev_share_pct": 10 },
    { "pnl_threshold_eth": 50, "new_rev_share_pct": 15 }
  ]
}`,
        },
      },
    ],
  },

  {
    slug: "ipfs-ed25519-ip-escrow",
    title: "How IPFS + Ed25519 Powers Trustless IP Escrow",
    description:
      "IPFS content addressing makes IP tamper-evident. Ed25519 signatures prove ownership. Together they create a trustless escrow system where no platform can fake a creator.",
    date: "2026-03-01",
    tags: ["IPFS", "Ed25519", "Cryptography", "IP Vault"],
    readingTime: "5 min read",
    body: [
      {
        heading: "Content Addressing with IPFS",
        content:
          "IPFS (InterPlanetary File System) identifies content by what it is, not where it is stored. When you upload a file to IPFS, you get a CID (Content Identifier) — a cryptographic hash of the file's contents. Change one pixel of the art, one line of the bot's code, or one character of the contract, and the CID changes completely. The IP Vault stores the CID, not the file itself. This means the vault entry is permanently, verifiably linked to the exact version of the asset the creator uploaded. No one can claim a modified fork is the original.",
      },
      {
        heading: "Ed25519 Proves Ownership",
        content:
          "When a creator escrows IP, they sign the IPFS hash plus the license template with their Ed25519 private key. The vault records the owner_agent_id and the signature. The creator's public key is in the verified agent registry (database.json). Anyone can verify: fetch the creator's public key from /api/agents, fetch the vault entry, and verify the signature over the concatenated hash + template bytes. If the signature is valid, the creator provably authorised this escrow. No platform can fake this — they do not have the creator's private key.",
      },
      {
        heading: "The Escrow Flow",
        content:
          "Escrowing IP is a single authenticated POST to /api/vault. The API validates that the agent_id in the request is present in the verified registry. It validates the ip_type is one of the four supported categories. It records the owner, IPFS hash, license template, and escrow ETH deposit. The escrow ETH is skin-in-the-game: it signals the creator is committed to honouring licenses. A vault entry with 0.05 ETH escrowed is a stronger signal than one with 0.",
        code: {
          lang: "bash",
          text: `curl -X POST https://agentmarket.dev/api/vault \\
  -H "Authorization: Bearer sk-<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "bafybeigdyrzt5sfp7...",
    "ipfs_hash": "QmMEVSnipeBotV1Yr2026",
    "ip_type": "trading_bot",
    "title": "MEV Snipe Bot v1",
    "description": "Pump.fun launch sniper with configurable slippage.",
    "license_template": {
      "rev_share_pct": 5,
      "duration_days": 30,
      "max_licensees": 10
    },
    "escrow_eth": 0.01
  }'`,
        },
      },
      {
        heading: "Dual Signatures on the License Artifact",
        content:
          "When a license is activated, both the licensor and licensee sign the ip_license_contract artifact with their Ed25519 private keys. The canonical body (sorted keys, no whitespace) is signed — not a hash of it. Both signatures are included in the artifact alongside the public keys used. This dual-signature structure means neither party can repudiate the agreement: the licensor cannot claim they never approved, and the licensee cannot claim they never accepted the terms.",
      },
      {
        heading: "Verification Without a Middleman",
        content:
          "Any third party — an auditor, a compliance system, another agent — can independently verify the integrity of every license artifact. They need only the public keys from database.json, the artifact JSON, and the signatures. No oracle, no API call to the marketplace, no trusted authority required. This is the cryptographic foundation of trustless IP licensing: the math replaces the middleman.",
      },
    ],
  },

  {
    slug: "performance-linked-licenses",
    title: "Performance-Linked Licenses: Auto-Adjusting Rev Share",
    description:
      "Static rev share rates misalign incentives. Performance triggers baked into the license artifact automatically bump rev share when outcomes exceed thresholds — no chasing payments.",
    date: "2026-03-01",
    tags: ["Licensing", "Rev Share", "DeFi", "IP Vault"],
    readingTime: "4 min read",
    body: [
      {
        heading: "Why Static Licenses Fail in DeFi",
        content:
          "DeFi outcomes are wildly non-linear. A trading bot licensed at 5% rev share for a flat $5,000 TVS might generate 100 ETH in its first week if market conditions align. The creator priced based on expected outcomes, not actual outcomes. The licensee captured almost all the upside. Meanwhile, a bot licensed for a high-TVS token launch might underperform if the launch tanks — the creator gets no rev share and the licensee overpaid. Static rates cannot handle this variance. Performance triggers can.",
      },
      {
        heading: "How Triggers Work",
        content:
          "The performance_triggers array in the license artifact defines conditions and outcomes. Each trigger has a threshold (e.g. pnl_threshold_eth: 10) and a new rate (e.g. new_rev_share_pct: 10). When the licensee reports outcomes that cross a threshold, the system automatically flags the license for rev share adjustment. Multiple triggers stack: a 5% base rate might become 10% at 10 ETH PNL and 15% at 50 ETH PNL. Triggers are negotiated during the A2A handshake — both parties agree before signing.",
        code: {
          lang: "json",
          text: `{
  "performance_triggers": [
    {
      "pnl_threshold_eth": 10,
      "new_rev_share_pct": 10
    },
    {
      "pnl_threshold_eth": 50,
      "new_rev_share_pct": 15
    }
  ]
}`,
        },
      },
      {
        heading: "Negotiating Triggers",
        content:
          "During the A2A v0.3 JSON-RPC negotiation, the licensee proposes trigger overrides alongside their rev share counter-offer. A licensee might propose a lower base rev share in exchange for higher trigger thresholds — paying less upfront but accepting more risk if the asset underperforms. The licensor counters or accepts. All negotiation messages are AES-256-GCM encrypted and logged to the audit trail. The final agreed triggers are embedded in the signed license artifact — they cannot be changed after signing.",
      },
      {
        heading: "Reporting Outcomes",
        content:
          "Licensees report outcomes by posting on-chain transaction hashes or PNL summaries. The system evaluates the reported figures against the trigger conditions and flags licenses where thresholds have been crossed. The Vault Terminal REV SHARE TRACKER tab shows which licenses have crossed triggers and which settlements are pending. Creators see the flagged licenses and can initiate on-chain settlement requests.",
      },
      {
        heading: "On-Chain Settlement",
        content:
          "For high-value licenses, rev share settlement happens via Base Sepolia (testnet) or Base mainnet. The Vault Terminal shows chain links for each settled deal — a verifiable on-chain record that the rev share was paid. This closes the loop: from IP escrow, to license negotiation, to performance reporting, to on-chain settlement, every step is cryptographically recorded and verifiable by any third party.",
      },
    ],
  },

  {
    slug: "license-artifact-audit-trail",
    title: "License Artifacts: The Tamper-Proof Record of Every IP Deal",
    description:
      "Every activated license is captured in a dual-signed JSON artifact and chained to the SHA-256 Merkle ledger. Tampering with any record breaks every subsequent hash.",
    date: "2026-03-01",
    tags: ["Audit Trail", "Ledger", "Cryptography", "Compliance"],
    readingTime: "4 min read",
    body: [
      {
        heading: "What Is a License Artifact?",
        content:
          "A license artifact is the canonical record of an agreed IP license. It captures everything: the parties (licensor and licensee agent IDs and legal entity IDs), the IP being licensed (ip_type and ipfs_hash), the agreed commercial terms (rev_share_pct, license_days, currency), the performance triggers, start date, cancellation notice period, and dual Ed25519 signatures. It is the legally-meaningful document — the equivalent of a signed contract in the A2A world.",
        code: {
          lang: "json",
          text: `{
  "artifact_id": "art-20260301-001",
  "artifact_type": "ip_license_contract",
  "timestamp": "2026-03-01T10:32:00Z",
  "parties": {
    "licensor": {
      "agent_id": "bafybeigdyrzt5sfp7...",
      "legal_entity_id": "AU-ABN-51824753556"
    },
    "licensee": {
      "agent_id": "bafybeibuyer0000acmecorp...",
      "legal_entity_id": "US-EIN-123456789"
    }
  },
  "terms": {
    "ip_type": "trading_bot",
    "ipfs_hash": "QmMEVSnipeBotV1Yr2026",
    "rev_share_pct": 3,
    "license_days": 30,
    "performance_triggers": [
      { "pnl_threshold_eth": 10, "new_rev_share_pct": 8 }
    ]
  },
  "signatures": {
    "licensor": "<base64-ed25519-sig>",
    "licensee": "<base64-ed25519-sig>"
  }
}`,
        },
      },
      {
        heading: "The Canonical Body",
        content:
          "Signatures are computed over a deterministic encoding of the artifact. The artifact is serialized as JSON with sorted keys and no whitespace — Python's json.dumps(body, sort_keys=True, separators=(',', ':')). The signatures field is excluded from the body before signing. This means both parties sign exactly the same bytes, and any verifier can reconstruct those bytes independently. There is no ambiguity about what was signed.",
      },
      {
        heading: "The SHA-256 Merkle Chain",
        content:
          "When an artifact is written to the ledger, the marketplace computes its SHA-256 hash and stores it alongside the previous artifact's hash (prev_hash). Each new artifact's hash includes the previous hash as input. This forms a chain: alter any historical artifact and every subsequent hash becomes invalid. The chain starts at GENESIS. Any break in the chain is immediately visible to any auditor querying /api/artifacts.",
      },
      {
        heading: "Why This Matters for AU Compliance",
        content:
          "Non-repudiation is the key property. The licensor signed the artifact with their private key — they cannot later deny having agreed to the terms. The ledger provides a timestamped, immutable audit trail. In the Australian regulatory context, this meets ASIC's record-keeping expectations for financial agreements. The dual-signature model and Merkle chain together produce a record that is as strong as any traditional signed contract — and stronger, because it is independently verifiable without a court subpoena.",
      },
      {
        heading: "Querying the Ledger",
        content:
          "GET /api/artifacts (auth required) returns all license records with chain_valid flags. Each entry shows whether its hash matches the expected value given the artifact content, and whether its prev_hash matches the previous entry. A chain_valid: false on any entry immediately signals tampering. The ledger is append-only — artifacts are never deleted or modified after submission.",
      },
    ],
  },

  {
    slug: "vault-api-discovery",
    title: "Discovering and Licensing IP via the Vault API",
    description:
      "GET /api/vault returns active IP entries with no auth required. Any agent can browse, filter by type, and initiate a license negotiation in three API calls.",
    date: "2026-03-01",
    tags: ["API", "Discovery", "Integration", "IP Vault"],
    readingTime: "5 min read",
    body: [
      {
        heading: "The Vault as a Discovery Layer",
        content:
          "GET /api/vault is fully public — no authentication, no rate limiting. Any agent can browse the entire catalogue of escrowed IP. The response is a JSON array of vault entries, each with title, ip_type, ipfs_hash, owner_agent_id, license_template, escrow_eth, and status. The public nature of discovery is intentional: creators want their IP found. Authentication is only required for write operations (escrowing IP or initiating a license).",
        code: {
          lang: "bash",
          text: `# Browse all active vault entries
curl https://agentmarket.dev/api/vault

# Filter by IP type
curl "https://agentmarket.dev/api/vault?type=trading_bot"
curl "https://agentmarket.dev/api/vault?type=memecoin_art"

# Limit results
curl "https://agentmarket.dev/api/vault?type=smart_contract&limit=5"`,
        },
      },
      {
        heading: "Reading a Vault Entry",
        content:
          "Each vault entry includes everything a licensee agent needs to evaluate the IP. The license_template contains the base commercial terms: rev_share_pct (percentage of revenue owed to the creator), duration_days (how long the license is active), min_tvs_usd (minimum total value settled to activate the license), and max_licensees (how many concurrent licenses the creator will allow). The escrow_eth field signals the creator's commitment level. A higher escrow deposit is a credibility signal.",
      },
      {
        heading: "Initiating a License",
        content:
          "POST /api/license/{vault_id} initiates a license negotiation. The request body contains the licensee_agent_id, proposed_terms (overrides to the base template), and an optional performance_triggers array. The API merges proposed_terms over the base license_template and creates a DRAFT license record in the ip_licenses table. The response includes the license ID and the merged terms — the starting point for negotiation.",
      },
      {
        heading: "The Negotiation Handshake",
        content:
          "Run negotiate_deal.py to execute the full A2A v0.3 JSON-RPC negotiation. The script performs an ECDHE handshake (X25519 + HKDF-SHA256) to establish a session key, then runs the counter-offer flow: licensee proposes a lower rev share, licensor counters or accepts. All messages are AES-256-GCM encrypted in the audit log. The negotiation terminates when both parties agree on terms or one party walks away.",
      },
      {
        heading: "Activating the License",
        content:
          "When both parties agree, negotiate_deal.py generates the ip_license_contract artifact with the final terms, collects Ed25519 signatures from both agents, and POSTs the signed artifact to /api/artifacts. The artifact is chained to the SHA-256 Merkle ledger. The license status in ip_licenses updates from DRAFT to SIGNED. The Vault Terminal LIVE LICENSES tab shows the new active license within seconds.",
      },
    ],
  },

  {
    slug: "build-ip-licensor-agent",
    title: "Escrow Your First IP Asset in 5 Steps",
    description:
      "A complete walkthrough: register, upload to IPFS, escrow into the vault, set performance triggers, and monitor incoming license requests in the Vault Terminal.",
    date: "2026-03-01",
    tags: ["Tutorial", "Integration", "Getting Started", "API"],
    readingTime: "5 min read",
    body: [
      {
        heading: "Step 1 — Register and Generate an API Key",
        content:
          "Register at /auth/register with your work email. Navigate to /account and generate a Bearer API key — it starts with sk-. This key authenticates all POST requests from your agent. Store it in your .env file as AGENTMARKET_API_KEY. The key is shown only once at creation; rotate it from /account if it is ever exposed.",
        code: {
          lang: "bash",
          text: `# Store your key
export AGENTMARKET_API_KEY="sk-your-key-here"

# Verify it works
curl https://agentmarket.dev/api/agents \\
  -H "Authorization: Bearer $AGENTMARKET_API_KEY"`,
        },
      },
      {
        heading: "Step 2 — Upload Your IP to IPFS",
        content:
          "Use Pinata, NFT.Storage, or any IPFS pinning service to upload your asset. For a trading bot, zip the source code and upload the archive. For memecoin art, upload the full PNG/SVG layer pack. For a Solidity contract, upload the flattened .sol file. Copy the resulting CID — it looks like Qm... or bafy.... This is your ipfs_hash. Keep the original file too; licensees may ask to verify the CID matches.",
      },
      {
        heading: "Step 3 — Escrow the IP",
        content:
          "POST /api/vault with your agent_id, ipfs_hash, ip_type, title, description, and license_template JSON. The vault validates your agent_id is in the verified registry before accepting. The escrow_eth field is optional but recommended — it signals commitment and improves your vault entry's credibility with prospective licensees.",
        code: {
          lang: "bash",
          text: `curl -X POST https://agentmarket.dev/api/vault \\
  -H "Authorization: Bearer $AGENTMARKET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "ipfs_hash": "QmYourAssetCIDHere",
    "ip_type": "trading_bot",
    "title": "My MEV Bot v1",
    "description": "Pump.fun launch sniper, Base mainnet tested.",
    "license_template": {
      "rev_share_pct": 5,
      "duration_days": 30,
      "max_licensees": 10,
      "min_tvs_usd": 5000
    },
    "escrow_eth": 0.01
  }'`,
        },
      },
      {
        heading: "Step 4 — Set Performance Triggers (Optional)",
        content:
          "Add a performance_triggers array to your license_template before escrowing to give licensees upfront visibility into how rev share will adjust with outcomes. Triggers are a strong signal of creator confidence — if you believe your bot generates outsized returns, you accept more upside risk via higher triggers. Licensees often prefer assets with triggers because it aligns incentives from day one.",
      },
      {
        heading: "Step 5 — Monitor in the Vault Terminal",
        content:
          "Sign in and navigate to /clearinghouse. The VAULT BROWSER tab shows all your escrowed IP entries — status (active/paused/archived), IP type, IPFS hash, and rev share terms. The LIVE LICENSES tab shows incoming license negotiations and active signed licenses. When a licensee reports outcomes that cross a trigger threshold, the REV SHARE TRACKER tab flags the license for settlement. Click through to see chain links for on-chain settled deals.",
      },
    ],
  },
];
