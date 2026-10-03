import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { SiteLayout } from "@/components/SiteLayout";
import { useI18n } from "@/i18n";
import { ALLOWED_PHOTO_TYPES, FIXED_STATE, MAX_PHOTO_BYTES, TAMIL_NADU_DISTRICTS } from "@/lib/constants";
import { submitEnrollment } from "@/services/membership";

export const Route = createFileRoute("/enroll")({
  head: () => ({
    meta: [
      { title: "Enroll as a Member — NLCTVS" },
      {
        name: "description",
        content:
          "Submit your party membership enrollment with your name, phone, address, district, constituency and photo. Tamil Nadu only.",
      },
      { property: "og:title", content: "Enroll as a Member — NLCTVS" },
      {
        property: "og:description",
        content: "Submit your party membership enrollment for review by the party office.",
      },
    ],
  }),
  component: EnrollPage,
});

interface FieldErrors {
  fullName?: string;
  phone?: string;
  address?: string;
  district?: string;
  constituency?: string;
  photo?: string;
}

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25";

function EnrollPage() {
  const { t } = useI18n();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const district = String(form.get("district") ?? "");
    const constituency = String(form.get("constituency") ?? "").trim();

    const next: FieldErrors = {};
    if (fullName.length < 2) next.fullName = t("enroll.errors.fullName");
    if (!/^[0-9]{10}$/.test(phone)) next.phone = t("enroll.errors.phone");
    if (address.length < 5) next.address = t("enroll.errors.address");
    if (!district) next.district = t("enroll.errors.district");
    if (constituency.length < 2) next.constituency = t("enroll.errors.constituency");
    if (!photo || !ALLOWED_PHOTO_TYPES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES) {
      next.photo = t("enroll.errors.photo");
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !photo) return;

    setSubmitting(true);
    try {
      await submitEnrollment({ fullName, phone, address, district, constituency, photo });
      setDone(true);
    } catch {
      setFormError(t("enroll.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="panel p-10">
            <span className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-success text-2xl text-success-foreground">
              ✓
            </span>
            <h1 className="mt-5 text-2xl text-primary">{t("enroll.successTitle")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("enroll.successBody")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDone(false);
                  setPhoto(null);
                }}
                className="rounded-md border border-bright-red px-5 py-2.5 text-sm font-semibold text-primary hover:bg-muted"
              >
                {t("enroll.again")}
              </button>
              <Link
                to="/"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t("nav.home")}
              </Link>
            </div>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl text-primary">{t("enroll.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("enroll.subtitle")}</p>

        <form onSubmit={handleSubmit} className="panel mt-8 space-y-5 p-6" noValidate>
          <Field label={t("enroll.fullName")} error={errors.fullName}>
            <input name="fullName" type="text" className={inputClass} autoComplete="name" />
          </Field>

          <Field label={t("enroll.phone")} hint={t("enroll.phoneHint")} error={errors.phone}>
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
              autoComplete="tel-national"
            />
          </Field>

          <Field label={t("enroll.address")} error={errors.address}>
            <textarea name="address" rows={3} className={inputClass} autoComplete="street-address" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("enroll.district")} error={errors.district}>
              <select name="district" className={inputClass} defaultValue="">
                <option value="" disabled>
                  {t("enroll.districtSelect")}
                </option>
                {TAMIL_NADU_DISTRICTS.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("enroll.state")}>
              <input
                name="state"
                value={FIXED_STATE}
                readOnly
                aria-readonly="true"
                className={`${inputClass} bg-muted text-muted-foreground`}
              />
            </Field>
          </div>

          <Field label={t("enroll.constituency")} error={errors.constituency}>
            <input name="constituency" type="text" className={inputClass} />
          </Field>

          <Field label={t("enroll.photo")} hint={t("enroll.photoHint")} error={errors.photo}>
            <input
              name="photo"
              type="file"
              accept={ALLOWED_PHOTO_TYPES.join(",")}
              className={inputClass}
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
            {photo ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {photo.name} · {(photo.size / 1024).toFixed(0)} KB
              </p>
            ) : null}
          </Field>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? t("enroll.submitting") : t("enroll.submit")}
          </button>
        </form>
      </div>
    </SiteLayout>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
