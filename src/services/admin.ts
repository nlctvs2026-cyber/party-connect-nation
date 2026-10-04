import { supabase } from "@/integrations/external/client";
import { PHOTO_BUCKET } from "@/lib/constants";
import type { CardTemplate, Member } from "./membership";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return Boolean(data);
}

export interface MemberWithCard extends Member {
  member_cards: { public_token: string; issued_at: string } | null;
}

/** Rows fetched per admin members page. */
export const MEMBER_PAGE_SIZE = 25;

export interface MembersPage {
  members: MemberWithCard[];
  total: number;
}

/**
 * One page of members for the admin table, with the total row count so the
 * UI can render page navigation. `search` filters server-side across name,
 * CPF, phone, district and constituency (and exact member number when the
 * term is all digits) — the table stays fast at ten-thousand-member scale.
 */
export async function listMembersPage(page: number, search: string): Promise<MembersPage> {
  const from = page * MEMBER_PAGE_SIZE;
  let query = supabase
    .from("members")
    .select("*, member_cards(public_token, issued_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + MEMBER_PAGE_SIZE - 1);

  const term = search.trim();
  if (term) {
    // Strip PostgREST `or()` syntax characters and wildcard metacharacters so
    // the term is matched literally.
    const safe = term.replace(/[,()%_]/g, "");
    if (safe) {
      const parts = [
        `full_name.ilike.%${safe}%`,
        `cpf_no.ilike.%${safe}%`,
        `phone.ilike.%${safe}%`,
        `district.ilike.%${safe}%`,
        `constituency.ilike.%${safe}%`,
      ];
      if (/^\d+$/.test(safe)) {
        // Match "000042" as well as "42" against the numeric member number.
        parts.push(`member_number.eq.${parseInt(safe, 10)}`);
      }
      query = query.or(parts.join(","));
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { members: (data ?? []) as MemberWithCard[], total: count ?? 0 };
}

/** Signed URL for an admin to view a private photo (expires in 5 minutes). */
export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function listTemplates(): Promise<CardTemplate[]> {
  const { data, error } = await supabase
    .from("card_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(name: string, html: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("card_templates")
    .insert({ name, html, created_by: userData.user?.id ?? null });
  if (error) throw error;
}

export async function activateTemplate(id: string): Promise<void> {
  const { error: clearError } = await supabase
    .from("card_templates")
    .update({ is_active: false })
    .eq("is_active", true);
  if (clearError) throw clearError;

  const { error } = await supabase.from("card_templates").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("card_templates").delete().eq("id", id);
  if (error) throw error;
}
