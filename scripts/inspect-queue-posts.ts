import fs from "fs";
import path from "path";

const envLocalPath = path.resolve(".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { supabaseAdmin } from "../src/lib/supabase/server";

async function main() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("posts")
    .select("id, topic, title, status, page_id, page_name, approved_by_user, scheduled_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("DB Error:", error);
    return;
  }

  console.log(`TOTAL_POSTS: ${data?.length}`);
  for (const p of data || []) {
    console.log(
      `[${p.status}] ID: ${p.id} | Page: ${p.page_name || "UNASSIGNED"} (${p.page_id || "no_id"}) | Topic: ${p.topic} | Title: "${p.title}" | Approved: ${p.approved_by_user} | Created: ${p.created_at}`
    );
  }
}

main().catch(console.error);
