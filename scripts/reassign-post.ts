import fs from "fs";
import path from "path";

// Preload env from .env.local
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

  // Update staged post 7ebe8a60-9836-4ace-8e8a-423353b9507c to Loving Doggy
  const { data, error } = await db
    .from("posts")
    .update({
      page_id: "286923627847340",
      page_name: "loving doggy",
      status: "draft",
      approved_by_user: false,
      approval_content_hash: null,
      approved_at: null,
    })
    .eq("id", "7ebe8a60-9836-4ace-8e8a-423353b9507c")
    .select("id, title, page_id, page_name, status, approved_by_user, image_url, description");

  console.log("UPDATE_RESULT:", { data, error });
}

main().catch(console.error);
