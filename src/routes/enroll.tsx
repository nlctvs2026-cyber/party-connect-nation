import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { SiteLayout } from "@/components/SiteLayout";
import { useI18n } from "@/i18n";
import { compressPhoto } from "@/lib/photo-compress";
import {
  ALLOWED_PHOTO_EXTENSIONS,
  ALLOWED_PHOTO_TYPES,
  FIXED_STATE,
  MAX_PHOTO_BYTES,
  TAMIL_NADU_CONSTITUENCIES,
  TAMIL_NADU_DISTRICTS,
} from "@/lib/constants";
import {
  CpfTakenError,
  PhoneTakenError,
  phoneCanApply,
  submitEnrollment,
} from "@/services/membership";

export const Route = createFileRoute("/enroll")({
  head: () => ({
    meta: [
      { title: "Enroll as a Member — NLCTVS" },
      {
        name: "description",
        content:
          "Enroll as a party member with your name, phone, address, district, constituency and photo. Tamil Nadu only. Your membership card is issued instantly.",
      },
      { property: "og:title", content: "Enroll as a Member — NLCTVS" },
      {
        property: "og:description",
        content: "Enroll as a party member and get your digital membership card instantly.",
      },
    ],
  }),
  component: EnrollPage,
});

interface FieldErrors {
  fullName?: string;
  phone?: string;
  dob?: string;
  address?: string;
  district?: string;
  constituency?: string;
  cpf?: string;
  photo?: string;
}

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25";

/** True when `yyyy-mm-dd` is a real date at least 18 years in the past. */
function isAtLeast18(dateString: string): boolean {
  const dob = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const eighteenthBirthday = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
  return eighteenthBirthday.getTime() <= Date.now();
}

/**
 * BUG-004 (strict): names are letters (any script, including Tamil) and
 * spaces only — digits and every special character are rejected. Also used
 * to scrub the field as the user types.
 */
const NAME_ALLOWED = /[\p{L}\s]/u;
const NAME_INVALID = /[^\p{L}\s]/u;

/** BUG-003: phone fields keep digits only — everything else is stripped. */
function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/**
 * BUG-007: valid Indian mobile — 10 digits, first digit 6-9. (The national
 * numbering plan has no 0/1-5 mobile prefixes; this rejects keyboard mashes
 * like 0000000000 and transposed landline codes.)
 */
const VALID_PHONE = /^[6-9][0-9]{9}$/;

/** Keep the first image file whose type/extension is an accepted photo. */
function isAcceptedPhoto(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_PHOTO_TYPES.includes(file.type) && ALLOWED_PHOTO_EXTENSIONS.includes(extension);
}

function EnrollPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // BUG-008: the constituency is picked from the selected district's own
  // list, so the district/constituency pair can never mismatch or be
  // misspelled.
  const [district, setDistrict] = useState("");
  const [constituency, setConstituency] = useState("");
  const districtConstituencies = TAMIL_NADU_CONSTITUENCIES[district] ?? [];
  // Date-picker ceiling: applicants must already be 18 (today minus 18 years).
  const [dobMax] = useState(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    return cutoff.toISOString().slice(0, 10);
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const district = String(form.get("district") ?? "");
    const constituency = String(form.get("constituency") ?? "").trim();
    const dateOfBirth = String(form.get("dateOfBirth") ?? "");
    const cpfNo = String(form.get("cpfNo") ?? "").trim();
    const posting = String(form.get("posting") ?? "");

    const next: FieldErrors = {};
    if (fullName.length < 2 || NAME_INVALID.test(fullName)) {
      next.fullName = t("enroll.errors.fullName");
    }
    if (!VALID_PHONE.test(phone)) next.phone = t("enroll.errors.phone");
    // CPF number is provided by the applicant (client requirement).
    if (cpfNo.length < 3) next.cpf = t("enroll.errors.cpf");
    if (address.length < 5) next.address = t("enroll.errors.address");
    if (!district) next.district = t("enroll.errors.district");
    if (constituency.length < 2) next.constituency = t("enroll.errors.constituency");
    if (!dateOfBirth) next.dob = t("enroll.errors.dob");
    else if (!isAtLeast18(dateOfBirth)) next.dob = t("enroll.errors.dobAge");
    if (!photo || !ALLOWED_PHOTO_TYPES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES) {
      next.photo = t("enroll.errors.photo");
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !photo) return;

    // Membership is instant, so a phone number that already belongs to a
    // member cannot enroll again. Check before uploading so a duplicate gets
    // a friendly message instead of a failed insert after the photo upload.
    // The database's unique constraint re-checks, covering race conditions.
    setSubmitting(true);
    try {
      // Compress client-side (600×750 box, JPEG, ≤100 KB) so storage stays
      // tiny and card pages load fast on mobile data. The compressed file
      // replaces the picker's file so the size note reflects what is sent.
      const compressed = await compressPhoto(photo);
      setPhoto(compressed);

      const available = await phoneCanApply(phone);
      if (!available) {
        setErrors({ phone: t("enroll.errors.phoneTaken") });
        setSubmitting(false);
        return;
      }
      const created = await submitEnrollment({
        fullName,
        phone,
        address,
        district,
        constituency,
        dateOfBirth,
        photo: compressed,
        cpfNo,
        posting,
      });
      // No intermediate confirmation screen — go straight to the member's
      // card page (the phone is stored in the DB, so /card lookup still
      // works later on).
      void navigate({ to: "/verify/$token", params: { token: created.publicToken } });
    } catch (error) {
      if (error instanceof CpfTakenError) {
        setErrors({ cpf: t("enroll.errors.cpfTaken") });
      } else if (error instanceof PhoneTakenError) {
        setErrors({ phone: t("enroll.errors.phoneTaken") });
      } else {
        setFormError(t("enroll.errors.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl text-primary">{t("enroll.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("enroll.subtitle")}</p>

        <form onSubmit={handleSubmit} className="panel mt-8 space-y-5 p-6" noValidate>
          <Field label={t("enroll.fullName")} error={errors.fullName}>
            <input
              name="fullName"
              type="text"
              maxLength={70}
              className={inputClass}
              autoComplete="name"
              onInput={(event) => {
                // Live scrub: strip anything a name cannot contain.
                const input = event.currentTarget;
                const cleaned = input.value.split("").filter((ch) => NAME_ALLOWED.test(ch)).join("");
                if (cleaned !== input.value) input.value = cleaned;
              }}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("enroll.phone")} hint={t("enroll.phoneHint")} error={errors.phone}>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className={inputClass}
                autoComplete="tel-national"
                onInput={(event) => {
                  // Live scrub (BUG-003): keep digits only, capped at 10.
                  const input = event.currentTarget;
                  const cleaned = onlyDigits(input.value).slice(0, 10);
                  if (cleaned !== input.value) input.value = cleaned;
                }}
              />
            </Field>

            <Field label={t("enroll.dob")} hint={t("enroll.dobHint")} error={errors.dob}>
              <input
                name="dateOfBirth"
                type="date"
                max={dobMax}
                className={inputClass}
                autoComplete="bday"
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("enroll.cpf")} hint={t("enroll.cpfHint")} error={errors.cpf}>
              <input
                name="cpfNo"
                type="text"
                maxLength={30}
                className={inputClass}
                onInput={(event) => {
                  // CPF numbers are uppercase on the party document.
                  const input = event.currentTarget;
                  const cleaned = input.value.toUpperCase();
                  if (cleaned !== input.value) input.value = cleaned;
                }}
              />
            </Field>

            <Field label={t("enroll.posting")}>
              <input
                type="text"
                name="posting"
                maxLength={70}
                className={inputClass}
                autoComplete="organization-title"
              />
            </Field>
          </div>

          <Field label={t("enroll.address")} error={errors.address}>
            <textarea name="address" rows={3} maxLength={300} className={inputClass} autoComplete="street-address" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("enroll.district")} error={errors.district}>
              <select
                name="district"
                className={inputClass}
                value={district}
                onChange={(event) => {
                  setDistrict(event.target.value);
                  setConstituency("");
                }}
              >
                <option value="" disabled>
                  {t("enroll.districtSelect")}
                </option>
                {TAMIL_NADU_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
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
            <select
              name="constituency"
              className={inputClass}
              value={constituency}
              disabled={!district}
              onChange={(event) => setConstituency(event.target.value)}
            >
              <option value="" disabled>
                {district ? t("enroll.constituencySelect") : t("enroll.constituencyPickDistrict")}
              </option>
              {districtConstituencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("enroll.photo")} hint={t("enroll.photoHint")} error={errors.photo}>
            <input
              name="photo"
              type="file"
              accept={ALLOWED_PHOTO_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
              className={inputClass}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                // BUG-002: browsers only soft-enforce `accept` (the picker can
                // still be switched to "All files"), so validate the pick and
                // reject non-image files immediately with a clear message.
                if (file && !isAcceptedPhoto(file)) {
                  setPhoto(null);
                  setPhotoNote(t("enroll.errors.photo"));
                  event.target.value = "";
                  return;
                }
                setPhoto(file);
                setPhotoNote(null);
              }}
            />
            {photo ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {photo.name} · {(photo.size / 1024).toFixed(0)} KB
              </p>
            ) : null}
            {!photo && photoNote ? (
              <p className="mt-2 text-xs text-destructive">{photoNote}</p>
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
