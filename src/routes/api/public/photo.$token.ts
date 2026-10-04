import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams a member photo for a valid public card token.
 * The storage bucket stays private: this endpoint resolves the token server-side
 * and redirects to a short-lived signed URL. No other member data is exposed.
 */
export const Route = createFileRoute("/api/public/photo/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || !/^[A-Za-z0-9]{6,64}$/.test(token)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: card } = await supabaseAdmin
          .from("member_cards")
          .select("member_id, revoked_at")
          .eq("public_token", token)
          .maybeSingle();

        if (!card || card.revoked_at) return new Response("Not found", { status: 404 });

        const { data: member } = await supabaseAdmin
          .from("members")
          .select("photo_path, is_active")
          .eq("id", card.member_id)
          .maybeSingle();

        if (!member?.is_active || !member.photo_path) {
          return new Response("Not found", { status: 404 });
        }

        const { data: signed } = await supabaseAdmin.storage
          .from("member-photos")
          .createSignedUrl(member.photo_path, 300);

        if (!signed?.signedUrl) return new Response("Not found", { status: 404 });

        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok || !upstream.body) return new Response("Not found", { status: 404 });

        return new Response(upstream.body, {
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
