import { supabaseAdmin } from "@/lib/supabase/server";
import type { PostTemplate } from "@/lib/types";

export async function listTemplates(): Promise<PostTemplate[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      // Table may not exist yet if migration hasn't been run
      console.warn("Templates table query skipped/error:", error.message);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      ratio: row.ratio,
      width: row.width,
      height: row.height,
      backgroundType: row.background_type ?? "gradient",
      backgroundUrl: row.background_url ?? undefined,
      backgroundGradient: row.background_gradient ?? undefined,
      backgroundColor: row.background_color ?? undefined,
      overlayOpacity: Number(row.overlay_opacity ?? 0.2),
      textElements: Array.isArray(row.text_elements) ? row.text_elements : [],
      category: row.category ?? "Custom",
      created_at: row.created_at,
    }));
  } catch (err) {
    console.warn("Failed to load templates from database:", err);
    return [];
  }
}

export async function saveTemplate(
  template: Omit<PostTemplate, "id" | "created_at"> & { id?: string }
): Promise<PostTemplate> {
  const row = {
    name: template.name,
    ratio: template.ratio,
    width: template.width,
    height: template.height,
    background_type: template.backgroundType,
    background_url: template.backgroundUrl || null,
    background_gradient: template.backgroundGradient || null,
    background_color: template.backgroundColor || null,
    overlay_opacity: template.overlayOpacity,
    text_elements: template.textElements,
    category: template.category || "Custom",
    updated_at: new Date().toISOString(),
  };

  const db = supabaseAdmin();
  if (template.id && !template.id.startsWith("preset-")) {
    const { data, error } = await db
      .from("templates")
      .update(row)
      .eq("id", template.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return {
      ...template,
      id: data.id,
      created_at: data.created_at,
    };
  }

  const { data, error } = await db.from("templates").insert(row).select().single();
  if (error) throw new Error(error.message);
  return {
    ...template,
    id: data.id,
    created_at: data.created_at,
  };
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from("templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
