import { supabase } from "@/integrations/supabase/client";
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

/** Fields an admin may edit on a member row. */
export interface MemberEditInput {
  full_name: string;
  phone: string;
  district: string;
  constituency: string;
  /** ISO date (yyyy-mm-dd) from the date picker, or null when cleared. */
  date_of_birth: string | null;
  /** Optional replacement photo — compressed client-side before it arrives. */
  photo?: File | null;
}

function photoExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Persist an admin's edits to a member row. When a replacement photo is
 * provided it is uploaded to the private bucket first, then the row's
 * `photo_path` is repointed to the new object and the superseded object is
 * deleted, so photo swaps do not accumulate orphans in the bucket. RLS
 * restricts the table update and the storage writes/deletes to admins.
 *
 * Cleanup is ordered so no reference ever dangles: the old object is removed
 * only after the row update succeeds, and the fresh upload is removed if the
 * row update fails (both cleanups are best-effort — they must not mask the
 * real error or turn a committed save into a reported failure;
 * scripts/purge-member-photos.mjs remains the manual backstop).
 */
export async function updateMember(memberId: string, input: MemberEditInput): Promise<void> {
  let photoPath: string | null = null;
  let previousPhotoPath: string | null = null;

  if (input.photo) {
    // Capture the current path before uploading: after a successful swap this
    // is the object that has to go. (`members.photo_path` is the only live
    // reference — membership_applications was dropped in migration 0003 and
    // every upload uses a fresh UUID path, so nothing else can point at it.)
    const { data: row, error: readError } = await supabase
      .from("members")
      .select("photo_path")
      .eq("id", memberId)
      .maybeSingle();
    if (readError) throw readError;
    previousPhotoPath = row?.photo_path ?? null;

    photoPath = `applications/${crypto.randomUUID()}.${photoExtension(input.photo)}`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, input.photo, { contentType: input.photo.type, upsert: false });
    if (uploadError) throw uploadError;
  }

  const update = {
    full_name: input.full_name.trim(),
    phone: input.phone.trim(),
    district: input.district.trim(),
    constituency: input.constituency.trim(),
    date_of_birth: input.date_of_birth,
    ...(photoPath ? { photo_path: photoPath } : {}),
  };

  const { error } = await supabase.from("members").update(update).eq("id", memberId);
  if (error) {
    // The row still points at the old photo, so the new upload is already
    // unreferenced — delete it rather than orphaning it on a failed save.
    if (photoPath) {
      const { error: rollbackError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([photoPath]);
      if (rollbackError) {
        console.error(
          `[admin] orphaned upload ${photoPath} could not be removed: ${rollbackError.message}`,
        );
      }
    }
    throw error;
  }

  // Swap committed: the row points at the new object, so the old one is now
  // an orphan. Best-effort delete — the edit itself already succeeded.
  if (photoPath && previousPhotoPath && previousPhotoPath !== photoPath) {
    const { error: removeError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove([previousPhotoPath]);
    if (removeError) {
      console.error(
        `[admin] superseded photo ${previousPhotoPath} could not be deleted: ${removeError.message}`,
      );
    }
  }
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
