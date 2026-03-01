import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

const DB_PATH = join(process.cwd(), "..", "database.json");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  if (!existsSync(DB_PATH)) {
    return Response.json({ agents: [], total: 0 }, { headers: CORS_HEADERS });
  }

  let allAgents: Record<string, unknown>[] = [];
  try {
    allAgents = JSON.parse(readFileSync(DB_PATH, "utf-8")).agents ?? [];
  } catch {
    return Response.json(
      { error: "Failed to read agent database" },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const { searchParams } = req.nextUrl;
  const capability = searchParams.get("capability")?.toLowerCase();
  const compliance = searchParams.get("compliance")?.toLowerCase();
  const id         = searchParams.get("id");

  let results = allAgents;

  // Filter by agent_id exact match
  if (id) {
    results = results.filter((a) => a["agent_id"] === id);
  }

  // Filter by capability (method name or description substring)
  if (capability) {
    results = results.filter((a) => {
      const caps = a["capabilities"] as Array<{ method: string; description: string }>;
      return caps?.some(
        (c) =>
          c.method.toLowerCase().includes(capability) ||
          c.description.toLowerCase().includes(capability)
      );
    });
  }

  // Filter by compliance standard
  if (compliance) {
    results = results.filter((a) => {
      const comp = a["compliance"] as string[];
      return comp?.some((c) => c.toLowerCase().includes(compliance));
    });
  }

  return Response.json(
    { agents: results, total: results.length },
    { headers: CORS_HEADERS }
  );
}
