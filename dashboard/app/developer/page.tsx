import path from "path";
import fs from "fs";
import { Nav } from "../components/Nav";
import { DeveloperSandbox } from "../components/DeveloperSandbox";

export const dynamic = "force-dynamic";

interface Capability {
  method: string;
  description: string;
}

interface Agent {
  agent_id: string;
  name: string;
  owner: string;
  legal_entity_id: string;
  public_key: string;
  capabilities: Capability[];
  compliance: string[];
  endpoint: string;
  verified: boolean;
  verification: {
    type: string;
    issued_by: string;
    issued_at: string;
    expires_at: string;
    certificate_id: string;
  };
}

function getAgents(): Agent[] {
  const dbPath = path.join(process.cwd(), "..", "database.json");
  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  return db.agents as Agent[];
}

export default function DeveloperPage() {
  const agents = getAgents();

  return (
    <>
      <Nav />
      <main className="px-6 py-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "#02f8c5" }}>
            DEVELOPER SANDBOX
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">AGENT CARDS</h1>
          <p className="mt-2 text-sm" style={{ color: "#aaa" }}>
            Inspect registered agent identities and verify Ed25519 signing keys are correctly configured.
          </p>
        </div>

        <DeveloperSandbox agents={agents} />

        <p className="mt-8 text-xs font-mono" style={{ color: "#666" }}>
          KEYS: ../agent-keys/*.pem · REGISTRY: database.json · TEST: sign + verify Ed25519 challenge
        </p>
      </main>
    </>
  );
}
