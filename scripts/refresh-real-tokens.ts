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

import { fetchPages } from "../src/lib/facebook/client";
import { upsertPages } from "../src/lib/db/pages";
import { supabaseAdmin } from "../src/lib/supabase/server";

async function run() {
  const db = supabaseAdmin();
  const { data: settings } = await db
    .from("app_settings")
    .select("facebook_user_token, facebook_user_name")
    .eq("id", 1)
    .single();

  if (!settings?.facebook_user_token) {
    throw new Error("No user token found in app_settings");
  }

  console.log("Fetching real pages from Meta Graph API...");
  const pages = await fetchPages();
  console.log(`Fetched ${pages.length} pages from Meta Graph API:`);
  for (const p of pages) {
    console.log(`- ${p.id}: ${p.name} (token_len: ${p.access_token?.length}, prefix: ${p.access_token?.slice(0, 15)})`);
  }

  if (pages.length > 0) {
    console.log("Upserting genuine tokens into pages_cache...");
    await upsertPages(pages, settings.facebook_user_name);
    console.log("Upsert successful!");
  }

  // Reset post 52c86640-e49e-4061-9dc9-489ce42ef78e status to draft so it can be published
  const { data: updatedPost, error: postErr } = await db
    .from("posts")
    .update({
      status: "draft",
      error_message: null,
      approved_by_user: true,
    })
    .eq("id", "52c86640-e49e-4061-9dc9-489ce42ef78e")
    .select()
    .single();

  if (postErr) {
    console.error("Error resetting post:", postErr);
  } else {
    console.log("\nPost 52c86640-e49e-4061-9dc9-489ce42ef78e status reset to 'draft' (approved_by_user: true):");
    console.log({
      id: updatedPost.id,
      title: updatedPost.title,
      page_id: updatedPost.page_id,
      page_name: updatedPost.page_name,
      status: updatedPost.status,
      approved_by_user: updatedPost.approved_by_user,
    });
  }
}

run().catch(console.error);
