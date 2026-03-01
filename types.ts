/**
 * Marketplace Agent Card Types
 * Based on the 2026 A2A Protocol standard (v0.3+) with B2B marketplace extensions.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Content Identifier (CIDv1) — a self-describing, content-addressed unique ID.
 * Format: bafybei<base32-encoded-multihash>
 * Example: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
 */
export type CID = string & { readonly __brand: "CID" };

/** ISO 8601 datetime string (e.g. "2026-01-15T09:00:00Z") */
export type ISODateTime = string & { readonly __brand: "ISODateTime" };

/** HTTPS URL string */
export type HttpsUrl = string & { readonly __brand: "HttpsUrl" };

// ---------------------------------------------------------------------------
// JSON-RPC Capability
// ---------------------------------------------------------------------------

/**
 * A single JSON-RPC method that the agent exposes.
 * Buyers use this to know exactly what they can call on the seller agent.
 */
export interface JsonRpcMethod {
  /** Full method name in dot-notation, e.g. "procurement.evaluate_vendor" */
  method: string;
  /** Human-readable description of what this method does */
  description: string;
  /**
   * JSON Schema object describing the params.
   * Agents use this to validate requests before sending.
   */
  params_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  /** Human-readable description of the return value */
  returns: string;
}

// ---------------------------------------------------------------------------
// Verification Certificate
// ---------------------------------------------------------------------------

/** The only valid verification type in this marketplace. */
export type VerificationType = "Marketplace_Signed";

/**
 * A digital certificate issued by the marketplace authority
 * confirming the agent has passed identity and compliance checks.
 */
export interface VerificationCertificate {
  /** Always "Marketplace_Signed" — discriminates against self-signed or unverified entries */
  type: VerificationType;
  /** The authority that signed this certificate, e.g. "AgentMarketplace Authority v1" */
  issued_by: string;
  /** ISO 8601 timestamp of when the certificate was issued */
  issued_at: ISODateTime;
  /** ISO 8601 timestamp of when the certificate expires */
  expires_at: ISODateTime;
  /** Unique certificate ID for revocation checks */
  certificate_id: string;
  /** Base64url-encoded JWS (JSON Web Signature) over the agent_id + owner + issued_at */
  signature: string;
}

// ---------------------------------------------------------------------------
// Agent Card — the canonical "profile" for an agent in the marketplace
// ---------------------------------------------------------------------------

/**
 * AgentCard — the A2A-compliant identity and capability document for a
 * marketplace participant. Published at /.well-known/agent.json and returned
 * by the registry's get_agent_card tool.
 */
export interface AgentCard {
  /** Schema version for forward compatibility */
  schema_version: "1.0";
  /** A2A protocol version this agent implements */
  a2a_version: "0.3.0";

  /**
   * Unique Content Identifier (CIDv1) for this agent card.
   * Derived from the hash of the card content — changes when the card changes.
   */
  agent_id: CID;

  /** Legal registered company name of the agent owner */
  owner: string;

  /**
   * Marketplace-issued verification certificate.
   * Agents without a valid Marketplace_Signed cert are not listed.
   */
  verification: VerificationCertificate;

  /**
   * Array of JSON-RPC methods this agent exposes to counterparties.
   * Buyer agents use this manifest to discover what they can negotiate.
   */
  capabilities: JsonRpcMethod[];

  /**
   * HTTPS endpoint where deal proposals are POSTed for internal corporate
   * policy approval before the agent commits to a contract.
   */
  policy_endpoint: HttpsUrl;

  // ---- Additional standard fields ----

  /** Display name of the agent */
  name: string;
  /** Plain-text description of the agent's purpose */
  description: string;
  /** Primary A2A endpoint for agent-to-agent communication */
  endpoint: HttpsUrl;
  /** Ed25519 PEM public key for verifying agent-signed messages */
  public_key: string;
  /** Legal entity identifier (format: JURISDICTION-TYPE-IDENTIFIER) */
  legal_entity_id: string;
  /** Compliance certifications the agent holds */
  compliance: string[];
  /** Pricing information */
  pricing: {
    model: "per-deal" | "per-shipment" | "monthly-retainer" | "subscription";
    base_fee_usd: number;
  };
  /** ISO 8601 timestamp of when the agent joined the marketplace */
  joined_at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Database shape (internal registry storage)
// ---------------------------------------------------------------------------

export interface AgentDatabase {
  agents: AgentCard[];
}
