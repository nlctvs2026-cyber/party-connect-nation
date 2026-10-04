import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { MembersList } from "@/components/admin/MembersList";
import { TemplatesManager } from "@/components/admin/TemplatesManager";
import { BrandStrip } from "@/components/BrandStrip";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentUserAdmin } from "@/services/admin";

export const Route = createFileRoute("/admin")({
  // Client-only: the session lives in the browser. Authorization itself is
  // enforced by database row level security, not by this route.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Portal" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Administrator access only." },
    ],
  }),
  component: AdminPage,
});

type Tab = "members" | "templates";

function AdminPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "anonymous" | "forbidden" | "admin">("checking");
  const [tab, setTab] = useState<Tab>("members");

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState("anonymous");
      return;
    }
    setState((await isCurrentUserAdmin()) ? "admin" : "forbidden");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setState("anonymous");
  }

  if (state === "checking") {
    return <p className="p-10 text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (state === "anonymous") {
    return <AdminLogin onSignedIn={() => void check()} />;
  }

  if (state === "forbidden") {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <p className="text-sm text-destructive">{t("admin.notAdmin")}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 rounded-md border border-border px-4 py-2 text-sm"
        >
          {t("admin.signOut")}
        </button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "members", label: t("admin.tabs.members") },
    { id: "templates", label: t("admin.tabs.templates") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <BrandStrip />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <h1 className="font-display text-xl text-primary">{t("admin.title")}</h1>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
            >
              {t("admin.signOut")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav className="mb-6 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "members" ? <MembersList /> : null}
        {tab === "templates" ? <TemplatesManager /> : null}
      </div>
    </div>
  );
}
