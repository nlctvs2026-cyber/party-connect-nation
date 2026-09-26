import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BrandStrip } from "@/components/BrandStrip";
import { MembershipCard } from "@/components/MembershipCard";
import { SiteLayout } from "@/components/SiteLayout";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { memberPhotoUrl, verifyCard } from "@/services/membership";

export const Route = createFileRoute("/verify/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Membership Verification — NLCTVS" },
      {
        name: "description",
        content:
          "Verify a party membership card. Only minimal verification details are shown publicly.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Membership Verification" },
      { property: "og:description", content: "Verify a party membership card." },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { token } = Route.useParams();
  const { t, language } = useI18n();

  const { data, isPending, isError } = useQuery({
    queryKey: ["verify-card", token],
    queryFn: () => verifyCard(token),
    retry: false,
  });

  if (isPending) {
    return (
      <SiteLayout>
        <p className="mx-auto max-w-3xl px-4 py-20 text-sm text-muted-foreground">
          {t("card.loading")}
        </p>
      </SiteLayout>
    );
  }

  if (isError) {
    return (
      <SiteLayout>
        <p className="mx-auto max-w-3xl px-4 py-20 text-sm text-destructive">{t("common.error")}</p>
      </SiteLayout>
    );
  }

  if (!data) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-4 py-20">
          <div className="panel p-8 text-center">
            <p className="text-sm text-destructive">{t("card.notFound")}</p>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="panel overflow-hidden">
          <BrandStrip />
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  data.valid
                    ? "bg-success text-success-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {data.valid ? t("card.verified") : t("card.revoked")}
              </span>
              <h1 className="text-xl text-primary">{t("card.verificationTitle")}</h1>
            </div>

            <dl className="mt-6 grid gap-4 break-anywhere sm:grid-cols-2">
              <Detail label={t("common.name")} value={data.full_name} />
              <Detail label={t("card.memberNo")} value={String(data.member_number)} />
              <Detail label={t("card.cpf")} value={data.cpf_no} />
              {data.posting ? <Detail label={t("card.posting")} value={data.posting} /> : null}
              <Detail label={t("card.district")} value={data.district} />
              <Detail label={t("card.constituency")} value={data.constituency} />
              <Detail label={t("card.state")} value={data.state} />
              <Detail label={t("card.issued")} value={formatDate(data.issued_at, language)} />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">{t("card.privacyNote")}</p>
          </div>
        </div>

        <div className="mt-10">
          <MembershipCard
            token={token}
            values={{
              name: data.full_name,
              member_number: String(data.member_number),
              cpf_no: data.cpf_no,
              posting: data.posting ?? "",
              date_of_birth: data.date_of_birth ?? "",
              district: data.district,
              state: data.state,
              constituency: data.constituency,
              photo: data.photo_path ? memberPhotoUrl(token) : "",
            }}
          />
        </div>

        <div className="no-print mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("card.print")}
          </button>
        </div>
      </div>
    </SiteLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
