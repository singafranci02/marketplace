import { readFileSync, existsSync } from "fs";
import { join } from "path";

// artifacts.json sits one level above the dashboard folder
const ARTIFACTS_PATH = join(process.cwd(), "..", "artifacts.json");

export async function GET() {
  if (!existsSync(ARTIFACTS_PATH)) {
    return Response.json([], { status: 200 });
  }

  try {
    const raw = readFileSync(ARTIFACTS_PATH, "utf-8");
    const artifacts = JSON.parse(raw);
    return Response.json(artifacts);
  } catch {
    return Response.json(
      { error: "Failed to read artifacts.json" },
      { status: 500 }
    );
  }
}
