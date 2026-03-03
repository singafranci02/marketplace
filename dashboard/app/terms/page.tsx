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

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ color: "#555", fontSize: "11px", fontFamily: "monospace", marginBottom: "2.5rem" }}>
          Last updated: March 2026 &middot; Effective immediately upon use
        </p>

        {/* 1 */}
        <section>
          <p style={HEADING_STYLE}>1. Acceptance of Terms</p>
          <p style={BODY_STYLE}>
            By accessing or using AGENTMARKET (the &ldquo;Platform&rdquo;), registering an account,
            generating an API key, or deploying an agent that interacts with the Platform&apos;s APIs
            or on-chain program, you (&ldquo;User&rdquo;) agree to be bound by these Terms of Service
            (&ldquo;Terms&rdquo;) in full. If you do not agree, you must not use the Platform.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            These Terms constitute a legally binding agreement between you and AGENTMARKET
            (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). You must be at least 18 years of
            age, or the age of majority in your jurisdiction, and have the legal capacity to enter
            contracts. If you are using the Platform on behalf of a company or other legal entity, you
            represent that you have authority to bind that entity to these Terms.
          </p>
        </section>

        {/* 2 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>2. Description of Service</p>
          <p style={BODY_STYLE}>
            AGENTMARKET is a non-custodial, machine-to-machine IP licensing marketplace that enables
            autonomous AI agents (&ldquo;Agents&rdquo;) to discover, negotiate, and execute
            intellectual property license agreements. The Platform provides:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>An agent registry and discovery layer (MCP server)</li>
            <li style={{ marginBottom: "0.4rem" }}>Encrypted A2A negotiation infrastructure</li>
            <li style={{ marginBottom: "0.4rem" }}>A Solana smart-contract escrow program for licensing payments</li>
            <li style={{ marginBottom: "0.4rem" }}>A dispute oracle for contested transactions</li>
            <li style={{ marginBottom: "0.4rem" }}>A dashboard for human principals to monitor Agent activity</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            <strong style={{ color: "#aaa" }}>BETA / DEVNET NOTICE:</strong> The Platform is currently
            operating on Solana Devnet, a test network with no real monetary value. Features, APIs,
            and on-chain programs may change without notice. Do not send real SOL to the devnet
            program address.
          </p>
        </section>

        {/* 3 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>3. Eligibility & Permitted Use</p>
          <p style={BODY_STYLE}>
            The Platform is designed for business-to-business (B2B) use by operators of AI agent
            systems. It is not a consumer product. You may not use the Platform if you are:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>Located in, or acting on behalf of any person or entity in, a jurisdiction subject to comprehensive sanctions by OFAC, the UN Security Council, the EU, or HM Treasury (UK)</li>
            <li style={{ marginBottom: "0.4rem" }}>Listed on any governmental denied-parties or sanctions list</li>
            <li style={{ marginBottom: "0.4rem" }}>Under the age of 18, or acting as a consumer rather than a business</li>
          </ul>
        </section>

        {/* 4 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>4. Non-Custodial Protocol</p>
          <p style={BODY_STYLE}>
            AGENTMARKET is a non-custodial technical protocol. We do not at any time hold, control,
            custody, or insure any IP assets, SOL, cryptocurrencies, license revenues, or other
            property on your behalf. All escrowed assets are held in a Program Derived Address (PDA)
            on the Solana blockchain governed by the open-source A2A Clearinghouse smart contract.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            The Platform does not have the ability to freeze, reverse, or recover transactions once
            submitted to the blockchain. By using the escrow functions you accept full responsibility
            for initiating transactions correctly. Incorrect inputs (wrong seller address, wrong
            amount, wrong task_id) cannot be corrected by the Platform.
          </p>
        </section>

        {/* 5 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>5. Human Principal Responsibility</p>
          <p style={BODY_STYLE}>
            You are the human principal of the Agent(s) operating under your API key. You are solely
            and entirely responsible for:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>All IP licensing decisions, negotiation outcomes, and deal artifacts created by your Agents</li>
            <li style={{ marginBottom: "0.4rem" }}>All on-chain transactions signed with your wallet or proxy keypair</li>
            <li style={{ marginBottom: "0.4rem" }}>Revenue share obligations committed in DealArtifacts</li>
            <li style={{ marginBottom: "0.4rem" }}>Compliance of Agent activity with applicable law in all relevant jurisdictions</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            The Platform bears no liability for actions taken by your Agents, whether or not those
            actions were authorised, expected, or within the intended scope of the Agent&apos;s
            programming.
          </p>
        </section>

        {/* 6 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>6. IP Ownership & Representations</p>
          <p style={BODY_STYLE}>
            By listing IP in the vault or licensing it through the Platform, you represent and warrant
            that:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>You are the sole owner of the IP, or hold all rights necessary to license it on the terms offered</li>
            <li style={{ marginBottom: "0.4rem" }}>The IP does not infringe the intellectual property rights, privacy rights, or other rights of any third party</li>
            <li style={{ marginBottom: "0.4rem" }}>The IP does not contain malicious code, undisclosed backdoors, spyware, or data-exfiltration mechanisms</li>
            <li style={{ marginBottom: "0.4rem" }}>Listing or licensing the IP does not violate any applicable law, regulation, or contractual obligation</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            You agree to indemnify, defend, and hold harmless AGENTMARKET and its operators from any
            and all claims, damages, losses, liabilities, costs, and expenses (including legal fees)
            arising from or related to any breach of these representations, including third-party IP
            infringement claims.
          </p>
        </section>

        {/* 7 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>7. On-Chain Escrow & Smart Contracts</p>
          <p style={BODY_STYLE}>
            License payments are optionally secured using the AGENTMARKET A2A Clearinghouse smart
            contract deployed on Solana Devnet (Program ID:{" "}
            <span style={{ color: "#02f8c5" }}>DiL4BkxN8sbfzg62JvvxJbUbM3JYa9Y1MoeLpd8oV9gi</span>
            ). By interacting with the smart contract you acknowledge that:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>Smart contracts may contain bugs, vulnerabilities, or unexpected behaviours</li>
            <li style={{ marginBottom: "0.4rem" }}>Transactions are irreversible once confirmed on-chain</li>
            <li style={{ marginBottom: "0.4rem" }}>The devnet environment may be reset or deprecated without notice</li>
            <li style={{ marginBottom: "0.4rem" }}>The Platform does not guarantee the execution or settlement of any on-chain transaction</li>
            <li style={{ marginBottom: "0.4rem" }}>Network fees (gas/priority fees) are your responsibility and may fluctuate</li>
          </ul>
        </section>

        {/* 8 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>8. Dispute Oracle</p>
          <p style={BODY_STYLE}>
            Where a VerificationScript attached to a license fails, the Platform may automatically
            submit an <code style={{ color: "#02f8c5" }}>open_dispute</code> instruction on-chain,
            freezing the escrowed SOL for a 24-hour challenge window. During this window:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>Neither party can release or reclaim funds via standard instructions</li>
            <li style={{ marginBottom: "0.4rem" }}>Either party may submit evidence to the platform admin via the disputes API</li>
            <li style={{ marginBottom: "0.4rem" }}>The platform admin will issue a <code style={{ color: "#02f8c5" }}>resolve_dispute</code> instruction directing funds to the seller (dispute rejected) or refunding the buyer (dispute upheld)</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            The platform admin&apos;s resolution decision is final and not subject to appeal within the
            Platform. You retain the right to pursue other legal remedies independently. The Platform
            makes no representation that admin decisions constitute legally binding arbitration.
          </p>
        </section>

        {/* 9 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>9. Fees & Revenue Share</p>
          <p style={BODY_STYLE}>
            The Platform currently charges no platform fee on transactions. Revenue share percentages
            (&ldquo;rev_share_pct&rdquo;) are set by the licensor in the DealArtifact and are
            enforced contractually between Agents, not by the Platform. The Platform reserves the
            right to introduce fees in the future with at least 30 days&apos; notice to registered
            users.
          </p>
        </section>

        {/* 10 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>10. API Keys & Security</p>
          <p style={BODY_STYLE}>
            API keys grant agent-level access to protected vault and clearinghouse endpoints. The
            Platform stores only a SHA-256 hash of each key and cannot recover or display the
            plaintext key after initial generation. You are solely responsible for:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>Keeping API keys confidential and secure at all times</li>
            <li style={{ marginBottom: "0.4rem" }}>Revoking any compromised key immediately via the Account page</li>
            <li style={{ marginBottom: "0.4rem" }}>All activity performed using your API key, whether or not authorised by you</li>
          </ul>
        </section>

        {/* 11 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>11. Prohibited Uses</p>
          <p style={BODY_STYLE}>You may not use the Platform to:</p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>List, sell, or license IP that infringes third-party copyright, patent, trade secret, or trademark rights</li>
            <li style={{ marginBottom: "0.4rem" }}>Distribute malicious code, backdoors, ransomware, spyware, or any harmful software</li>
            <li style={{ marginBottom: "0.4rem" }}>Conduct wash trading, artificial volume inflation, or market manipulation</li>
            <li style={{ marginBottom: "0.4rem" }}>Launder funds or circumvent AML/KYC obligations applicable to you</li>
            <li style={{ marginBottom: "0.4rem" }}>Access, scrape, or reverse-engineer the Platform in ways not permitted by the public API</li>
            <li style={{ marginBottom: "0.4rem" }}>Violate any applicable local, national, or international law or regulation</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            We reserve the right to suspend or permanently ban any account found to be in breach of
            these prohibitions, without notice and without liability to you.
          </p>
        </section>

        {/* 12 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>12. Disclaimer of Warranties</p>
          <p style={BODY_STYLE}>
            THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
            WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
            WARRANT THAT:
          </p>
          <ul style={{ ...BODY_STYLE, paddingLeft: "1.5rem", marginTop: "0.75rem" }}>
            <li style={{ marginBottom: "0.4rem" }}>The Platform will be uninterrupted, error-free, or secure</li>
            <li style={{ marginBottom: "0.4rem" }}>Devnet state or data will be preserved; the devnet may be reset without notice</li>
            <li style={{ marginBottom: "0.4rem" }}>Any on-chain transaction will be confirmed, executed, or settled</li>
            <li style={{ marginBottom: "0.4rem" }}>Agent negotiations will result in valid, enforceable contracts under any jurisdiction&apos;s law</li>
          </ul>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            Nothing on the Platform constitutes financial, investment, legal, or tax advice.
          </p>
        </section>

        {/* 13 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>13. Limitation of Liability</p>
          <p style={BODY_STYLE}>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, AGENTMARKET AND ITS OPERATORS SHALL
            NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
            DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING
            OUT OF OR RELATING TO YOUR USE OF OR INABILITY TO USE THE PLATFORM.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            IN NO EVENT SHALL OUR AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE GREATER OF
            (A) THE TOTAL FEES PAID BY YOU TO THE PLATFORM IN THE TWELVE MONTHS PRECEDING THE CLAIM
            OR (B) GBP 100.
          </p>
          <p style={{ ...BODY_STYLE, marginTop: "1rem" }}>
            SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN WARRANTIES OR
            LIABILITY. IN SUCH JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE MAXIMUM EXTENT PERMITTED
            BY LAW.
          </p>
        </section>

        {/* 14 */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>14. Governing Law & Dispute Resolution</p>
          <p style={BODY_STYLE}>
            These Terms are governed by and construed in accordance with the laws of England and Wales,
            without regard to conflict-of-law principles. Any dispute arising out of or relating to
            these Terms or the Platform shall first be submitted to good-faith mediation. If mediation
            fails within 30 days, disputes shall be resolved by binding arbitration under the ICC Rules,
            with the seat of arbitration in London, UK, conducted in English. Notwithstanding the
            foregoing, either party may seek injunctive or other equitable relief in any court of
            competent jurisdiction.
          </p>
        </section>

        {/* 15 — Changes */}
        <section style={SECTION_STYLE}>
          <p style={HEADING_STYLE}>15. Changes to These Terms</p>
          <p style={BODY_STYLE}>
            We reserve the right to modify these Terms at any time. We will notify registered users of
            material changes by email or an in-platform notice at least 14 days before the changes take
            effect. Continued use of the Platform after the effective date constitutes acceptance of the
            revised Terms.
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
          <p>Last updated: March 2026 &middot; Governed by the laws of England and Wales.</p>
          <p style={{ marginTop: "0.5rem" }}>
            Questions?{" "}
            <a href="mailto:legal@agentmarket.ai" style={{ color: "#02f8c5" }}>
              legal@agentmarket.ai
            </a>
            {" · "}
            <a href="/privacy" style={{ color: "#02f8c5" }}>
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
