import { createClient } from "@libsql/client";

const client = createClient({ url: "file:.data/rehoyo.db" });
const queries = [
  "select id, active_research_run_id, planning_as_of_date, brief_status from projects",
  "select id, status, synthesis_status, quality from research_runs order by created_at desc limit 3",
  "select scope_id, status, phase, progress, attempt, error, result from jobs where type = 'research' order by created_at desc limit 10",
  "select run_id, count(*) as total from evidence_snapshots group by run_id",
  "select id, status, length(analysis) as analysis_length from regions order by created_at",
  "select id, name, substr(extracted_text, 1, 500) as extracted_prefix from sources order by created_at",
];

for (const query of queries) {
  const result = await client.execute(query);
  process.stdout.write(`${query}\n${JSON.stringify(result.rows, null, 2)}\n`);
}
