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
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { supabaseAdmin } from "../src/lib/supabase/server";

async function run() {
  const db = supabaseAdmin();
  const { data: pages } = await db
    .from("pages_cache")
    .select("page_id, name, is_active, access_token");

  for (const p of pages || []) {
    console.log(
      `PAGE: ${p.page_id} | ${p.name} | is_active: ${p.is_active} | token_len: ${p.access_token?.length} | token_prefix: ${p.access_token?.slice(0, 20)}`
    );
  }

  const { data: post } = await db
    .from("posts")
    .select("*")
    .eq("id", "52c86640-e49e-4061-9dc9-489ce42ef78e")
    .single();

  if (post) {
    console.log(`\nPOST: ${post.id}`);
    console.log(`  title: "${post.title}"`);
    console.log(`  page_id: "${post.page_id}"`);
    console.log(`  page_name: "${post.page_name}"`);
    console.log(`  status: "${post.status}"`);
    console.log(`  approved_by_user: ${post.approved_by_user}`);
    console.log(`  error_message: "${post.error_message}"`);
  } else {
    console.log("\nPost 52c86640-e49e-4061-9dc9-489ce42ef78e not found");
  }

  // Also check if app_settings has user token to refresh pages
  const { data: settings } = await db
    .from("app_settings")
    .select("facebook_user_token, facebook_user_name, default_page_id, default_page_token")
    .eq("id", 1)
    .single();

  console.log(`\nSETTINGS: user_token_len: ${settings?.facebook_user_token?.length}, default_page_id: ${settings?.default_page_id}`);
}

run().catch(console.error);
