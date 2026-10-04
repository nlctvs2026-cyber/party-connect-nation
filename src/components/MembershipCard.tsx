import { useEffect, useMemo, useState } from "react";

import { renderCardTemplate, type CardValues } from "@/lib/card-template";
import { verificationQrDataUrl } from "@/lib/qr";
import { fetchActiveTemplate } from "@/services/membership";
import { useI18n } from "@/i18n";

interface Props {
  token: string;
  values: Omit<CardValues, "qr_code">;
}

/** Renders the active HTML card template with the member's data, client-side. */
export function MembershipCard({ token, values }: Props) {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  const valuesKey = useMemo(() => JSON.stringify(values), [values]);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      setState("loading");
      try {
        const [template, qr] = await Promise.all([
          fetchActiveTemplate(),
          verificationQrDataUrl(token),
        ]);
        if (cancelled) return;
        if (!template) {
          setState("empty");
          return;
        }
        setHtml(renderCardTemplate(template.html, { ...JSON.parse(valuesKey), qr_code: qr }));
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [token, valuesKey]);

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">{t("card.loading")}</p>;
  }
  if (state === "empty") {
    return <p className="text-sm text-muted-foreground">{t("card.noTemplate")}</p>;
  }
  if (state === "error" || !html) {
    return <p className="text-sm text-destructive">{t("common.error")}</p>;
  }

  return (
    <div id="membership-card" className="max-w-full overflow-x-auto">
      {/* The active HTML card template with the member's data. Template HTML
          is authored by administrators only, and the printed/downloaded file
          contains exactly this card and nothing else. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
