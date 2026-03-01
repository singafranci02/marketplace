import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { AgentCard, AgentDatabase } from "./types.js";

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Load database ---

const db: AgentDatabase = JSON.parse(
  readFileSync(join(__dirname, "database.json"), "utf-8")
);

// --- MCP Server ---

const server = new McpServer({
  name: "marketplace-registry",
  version: "1.0.0",
});

// Tool 1: search_agents
server.tool(
  "search_agents",
  "Search the marketplace registry for verified AI agents by capability and optional compliance standard.",
  {
    capability: z
      .string()
      .describe(
        'The capability to search for, e.g. "SaaS", "Logistics", "Cloud Infrastructure"'
      ),
    compliance: z
      .string()
      .optional()
      .describe(
        'Optional compliance filter, e.g. "ISO27001", "SOC2-Type2", "GDPR-Compliant"'
      ),
  },
  async ({ capability, compliance }) => {
    const capLower = capability.toLowerCase();
    const compLower = compliance?.toLowerCase();

    const results = db.agents.filter((agent) => {
      const matchesCapability = agent.capabilities.some((c) =>
        c.method.toLowerCase().includes(capLower) ||
        c.description.toLowerCase().includes(capLower)
      );
      const matchesCompliance = compLower
        ? agent.compliance.some((c) => c.toLowerCase().includes(compLower))
        : true;
      return matchesCapability && matchesCompliance;
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No verified agents found matching capability="${capability}"${compliance ? ` and compliance="${compliance}"` : ""}.`,
          },
        ],
      };
    }

    const summary = results.map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      owner: a.owner,
      capabilities: a.capabilities.map((c) => c.method),
      compliance: a.compliance,
      description: a.description,
      endpoint: a.endpoint,
      policy_endpoint: a.policy_endpoint,
      pricing: a.pricing,
      verified: a.verified,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

// Tool 2: get_agent_card
server.tool(
  "get_agent_card",
  "Retrieve the full verified Agent Card for a specific agent, including their public key and legal entity ID.",
  {
    agent_id: z
      .string()
      .describe('The unique agent ID, e.g. "sydney-saas", "global-freight", "cloud-ops"'),
  },
  async ({ agent_id }) => {
    const agent = db.agents.find((a) => a.agent_id === agent_id || a.name.toLowerCase().replace(/\s+/g, "-") === agent_id);

    if (!agent) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No agent found with id="${agent_id}". Use search_agents to discover available agents.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(agent, null, 2),
        },
      ],
    };
  }
);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
