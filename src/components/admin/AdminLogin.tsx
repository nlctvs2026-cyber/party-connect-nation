import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/external/client";
import { BrandStrip } from "@/components/BrandStrip";
import { useI18n } from "@/i18n";

export function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setLoading(false);
    if (signInError) {
      setError(t("admin.signInError"));
      return;
    }
    onSignedIn();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <div className="panel overflow-hidden">
        <BrandStrip />
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <h1 className="text-2xl text-primary">{t("admin.title")}</h1>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("admin.email")}</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("admin.password")}</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? t("admin.signingIn") : t("admin.signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
