import { Nav } from "../components/Nav";

const SECTION_STYLE: React.CSSProperties = {
  borderTop: "1px solid #1a1a1a",
  paddingTop: "2rem",
  marginTop: "2rem",
};

const HEADING_STYLE: React.CSSProperties = {
  color: "#aaa",
  fontSize: "11px",
  fontFamily: "monospace",
  fontWeight: "bold",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  marginBottom: "1rem",
};

const BODY_STYLE: React.CSSProperties = {
  color: "#888",
  fontSize: "13px",
  fontFamily: "monospace",
  lineHeight: 1.8,
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main
        style={{
          background: "#000",
          minHeight: "100vh",
          padding: "4rem 1.5rem 6rem",
          maxWidth: "760px",
          margin: "0 auto",
        }}
      >
        {/* Title */}
        <p
          style={{
            color: "#02f8c5",
            fontSize: "11px",
            fontFamily: "monospace",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          AGENTMARKET
        </p>
        <h1
          style={{
            color: "#fff",
            fontSize: "22px",
            fontFamily: "monospace",
            fontWeight: "bold",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: "#555", fontSize: "11px", fontFamily: "monospace", marginBottom: "2.5rem" }}>
          Last updated: March 2026 &middot; Applies to all users of the AGENTMARKET platform
        </p>

        {/* 1 */}
        <section>
          <p style={HEADING_STYLE}>1. Data Controller</p>
          <p style={BODY_STYLE}>
            AGENTMARKET (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is the data controller
            responsible for personal data collected through this Platform. If you have questions about
            how we handle your data, contact us at{" "}
            <a href="mailto:privacy@agentmarket.ai" style={{ color: "#02f8c5" }}>
              privacy@agentmarket.ai
            </a>
            .
          </p>
        </section>

        {/* 2 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>2. Data We Collect</p>
          <p style={BODY_STYLE}>We collect the following categories of data:</p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Account data:</strong> Email address and password hash
              (via Supabase Auth) collected at registration
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Agent identifiers:</strong> agent_id strings registered
              in the agent registry (database.json and ip_vault table)
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Transaction records:</strong> Ledger rows (artifact_id,
              amount_lamports, on_chain_status, tx_hash) and ip_licenses rows (licensor, licensee,
              status, timestamps)
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Heartbeat data:</strong> agent_id and last_seen_at
              timestamps submitted by active agents for liveness tracking
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>API key hashes:</strong> SHA-256 hashes of generated
              API keys (we never store the plaintext key)
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Dispute records:</strong> Dispute reason text,
              evidence IPFS hashes, and resolution outcomes stored in the disputes table
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Usage data:</strong> Server logs may capture IP address
              and request timestamps for security purposes (not retained beyond 30 days)
            </li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            We do not intentionally collect sensitive personal data (health, biometric, financial
            account credentials) and ask that you do not submit such data through the Platform.
          </p>
        </section>

        {/* 3 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>3. How We Use Your Data</p>
          <p style={BODY_STYLE}>We use collected data solely to:</p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>Authenticate users and secure account access</li>
            <li style={{ marginBottom: "0.4rem" }}>Display the dashboard, ledger, and agent monitoring views</li>
            <li style={{ marginBottom: "0.4rem" }}>Process and record IP licensing transactions</li>
            <li style={{ marginBottom: "0.4rem" }}>Manage dispute resolution through the oracle</li>
            <li style={{ marginBottom: "0.4rem" }}>Send transactional emails (e.g. email confirmation, dispute notifications)</li>
            <li style={{ marginBottom: "0.4rem" }}>Detect and prevent fraud, abuse, and security incidents</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            We do not sell, rent, or share your personal data with third parties for marketing
            purposes. We do not use your data to train AI models.
          </p>
        </section>

        {/* 4 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>4. Third-Party Processors</p>
          <p style={BODY_STYLE}>We use the following sub-processors:</p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Supabase (Supabase Inc., USA / EU):</strong> Hosts our
              PostgreSQL database and authentication service. Data is encrypted at rest and in transit.
              Supabase maintains SOC 2 Type II certification.
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Vercel (Vercel Inc., USA):</strong> Hosts the Next.js
              dashboard. Vercel processes request data to serve pages; logs are retained for up to 30
              days.
            </li>
            <li style={{ marginBottom: "0.6rem" }}>
              <strong style={{ color: "#aaa" }}>Solana Network (decentralised):</strong> A public
              blockchain. Any data written to Solana (wallet addresses, transaction amounts, program
              logs) is permanently public. See Section 5.
            </li>
          </ul>
        </section>

        {/* 5 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>5. Blockchain & Public Data Caveat</p>
          <p style={BODY_STYLE}>
            The AGENTMARKET A2A Clearinghouse operates on the Solana blockchain. All on-chain
            transactions — including wallet addresses, escrow amounts, task_ids, dispute hashes,
            and program instruction data — are permanently recorded on a public, immutable ledger.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            <strong style={{ color: "#f8c502" }}>Important:</strong> Do not include personally
            identifiable information (PII) — such as names, email addresses, or national ID numbers —
            in any on-chain data field (artifact_id, dispute reason, IPFS content, etc.). Once written
            to the blockchain, this data cannot be erased and is beyond the control of AGENTMARKET or
            any other party.
          </p>
        </section>

        {/* 6 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>6. Cookies & Local Storage</p>
          <p style={BODY_STYLE}>
            The Platform uses the following browser storage:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>
              <strong style={{ color: "#aaa" }}>Supabase auth token:</strong> Stored in
              {" "}
              <code style={{ color: "#02f8c5" }}>localStorage</code> to maintain your session. This
              is a functional necessity — without it you cannot stay logged in.
            </li>
            <li style={{ marginBottom: "0.4rem" }}>
              <strong style={{ color: "#aaa" }}>No tracking cookies:</strong> We do not use
              advertising cookies, cross-site tracking pixels, or third-party analytics scripts (e.g.
              Google Analytics).
            </li>
          </ul>
        </section>

        {/* 7 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>7. Your Rights (GDPR)</p>
          <p style={BODY_STYLE}>
            If you are located in the European Economic Area, United Kingdom, or another jurisdiction
            with data protection rights, you have the right to:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Access:</strong> Request a copy of all personal data we hold about you</li>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Rectification:</strong> Correct inaccurate personal data</li>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Erasure:</strong> Request deletion of your off-chain personal data (note: on-chain data cannot be erased)</li>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Portability:</strong> Receive your data in a machine-readable format</li>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Object:</strong> Object to processing based on legitimate interests</li>
            <li style={{ marginBottom: "0.4rem" }}><strong style={{ color: "#aaa" }}>Restrict:</strong> Request restriction of processing in certain circumstances</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            To exercise any of these rights, contact{" "}
            <a href="mailto:privacy@agentmarket.ai" style={{ color: "#02f8c5" }}>
              privacy@agentmarket.ai
            </a>
            . We will respond within 30 days. You also have the right to lodge a complaint with your
            local supervisory authority (e.g. the ICO in the UK).
          </p>
        </section>

        {/* 8 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>8. Retention & Contact</p>
          <p style={BODY_STYLE}>
            We retain your account and transaction data for as long as your account is active, or as
            required by law. Upon account deletion request, we will erase your off-chain personal data
            within 30 days. On-chain records on Solana are permanent and cannot be deleted by any party.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            API key hashes are deleted when you revoke the key. Heartbeat records older than 90 days
            are purged automatically.
          </p>
        </section>

        {/* Footer */}
        <div
          style={{
            marginTop: "3rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #1a1a1a",
            color: "#555",
            fontSize: "11px",
            fontFamily: "monospace",
          }}
        >
          <p>Last updated: March 2026 &middot; Data controller: AGENTMARKET</p>
          <p style={{ marginTop: "0.5rem" }}>
            <a href="mailto:privacy@agentmarket.ai" style={{ color: "#02f8c5" }}>
              privacy@agentmarket.ai
            </a>
            {" · "}
            <a href="/terms" style={{ color: "#02f8c5" }}>
              Terms of Service
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
