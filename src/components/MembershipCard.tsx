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
      {/* Front side: the active HTML card template. Template HTML is authored
          by administrators only. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />

      {/* Back side (QA BUG-19): printed on its own page so the download/print
          output always carries both sides of the ID card together. */}
      <div className="card-back no-print-on-screen hidden print:block print:break-before-page">
        <div className="mx-auto w-[560px] max-w-full">
          <div
            style={{
              width: "100%",
              fontFamily: "Georgia, serif",
              color: "#261611",
              background: "#F3F0C8",
              border: "6px solid #790604",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", height: 10 }}>
              <div style={{ flex: 1, background: "#790604" }} />
              <div style={{ flex: 1, background: "#246820" }} />
              <div style={{ flex: 1, background: "#EBC336" }} />
            </div>
            <div
              style={{
                padding: "14px 20px",
                background: "#790604",
                color: "#F3F0C8",
                fontSize: 18,
                fontWeight: "bold",
                letterSpacing: 1,
              }}
            >
              தமிழக வாழ்வுரிமைக் கட்சி
            </div>
            <div style={{ padding: "16px 20px", fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontWeight: "bold", fontSize: 16, color: "#790604" }}>
                {values.name}
              </div>
              <div>Member No: {values.member_number}</div>
              <div>CPF No: {values.cpf_no}</div>
              {values.posting ? <div>Posting: {values.posting}</div> : null}
              {values.date_of_birth ? <div>DOB: {values.date_of_birth}</div> : null}
              <div style={{ marginTop: 8, fontSize: 11, color: "#693E2C" }}>
                This card is the property of the party. If found, please return
                it to the nearest party office. Membership is non-transferable.
              </div>
            </div>
            <div style={{ display: "flex", height: 8 }}>
              <div style={{ flex: 1, background: "#790604" }} />
              <div style={{ flex: 1, background: "#246820" }} />
              <div style={{ flex: 1, background: "#EBC336" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
