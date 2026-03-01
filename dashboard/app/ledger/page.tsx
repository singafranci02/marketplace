import { createClient } from "@/lib/supabase/server";
import { LedgerLive } from "../components/LedgerLive";
import { Nav } from "../components/Nav";

async function getArtifacts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ledger")
    .select("artifact, verified, artifact_hash, prev_hash")
    .order("id", { ascending: true });
  if (!data) return [];
  return data.map((row, idx) => ({
    ...(row.artifact as Record<string, unknown>),
    verified:      row.verified,
    artifact_hash: row.artifact_hash as string,
    chain_valid:   idx === 0
      ? row.prev_hash === "GENESIS"
      : row.prev_hash === data[idx - 1].artifact_hash,
  }));
}

export default async function LedgerPage() {
  const artifacts = await getArtifacts();
  return (
    <>
      <Nav />
      <LedgerLive initialArtifacts={artifacts} />
    </>
  );
}
