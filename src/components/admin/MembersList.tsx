import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { compressPhoto } from "@/lib/photo-compress";
import { listMembersPage, MEMBER_PAGE_SIZE, signedPhotoUrl, updateMember } from "@/services/admin";
import type { Member } from "@/services/membership";

/** Tamil Nadu districts offered as quick options (the field itself is free text). */
const DISTRICT_OPTIONS = [
  "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri",
  "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur",
  "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris",
  "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga",
  "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
  "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore",
  "Viluppuram", "Virudhunagar",
];

export function MembersList() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openEdit, setOpenEdit] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);

  // Debounce the search box: only hit the server 300ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0); // a new search always restarts at page 1
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load a signed URL for the member's existing photo while the dialog is open.
  useEffect(() => {
    let cancelled = false;
    setCurrentPhotoUrl(null);
    if (openEdit && editMember?.photo_path) {
      void signedPhotoUrl(editMember.photo_path).then((url) => {
        if (!cancelled) setCurrentPhotoUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [openEdit, editMember?.photo_path]);

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["members", page, search],
    queryFn: () => listMembersPage(page, search),
    placeholderData: (previous) => previous, // keep the old page visible while fetching
  });

  const members = data?.members ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / MEMBER_PAGE_SIZE));

  function openEditDialog(member: Member) {
    setEditMember(member);
    setEditPhoto(null);
    setOpenEdit(true);
  }

  function closeDialog() {
    setOpenEdit(false);
    setEditMember(null);
    setEditPhoto(null);
    setCurrentPhotoUrl(null);
  }

  const save = useMutation({
    mutationFn: () => {
      if (!editMember) throw new Error("no member selected");
      return updateMember(editMember.id, {
        full_name: editMember.full_name ?? "",
        phone: editMember.phone ?? "",
        address: editMember.address ?? "",
        cpf_no: editMember.cpf_no ?? "",
        posting: editMember.posting ?? "",
        district: editMember.district ?? "",
        constituency: editMember.constituency ?? "",
        date_of_birth: editMember.date_of_birth || null,
        photo: editPhoto,
      });
    },
    onSuccess: () => {
      toast.success(t("admin.members.saved"));
      closeDialog();
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => {
      // Unique constraints on cpf_no and phone are the last line of defence
      // against duplicates — tell the admin which one collided instead of a
      // generic failure. PostgREST names the offending column in `details`.
      const info = `${error.message} ${(error as { details?: string }).details ?? ""}`;
      if ((error as { code?: string }).code === "23505" && /cpf_no/.test(info)) {
        toast.error(t("enroll.errors.cpfTaken"));
      } else if ((error as { code?: string }).code === "23505" && /phone/.test(info)) {
        toast.error(t("enroll.errors.phoneTaken"));
      } else {
        toast.error(t("common.error"));
      }
    },
  });

  if (isPending && !data) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (isError) {
    return (
      <div className="text-sm">
        <p className="text-destructive">{t("common.error")}</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 underline">
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("admin.members.search")}
          maxLength={80}
          className="w-full max-w-sm rounded-md border border-input bg-card px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {t("admin.members.count").replace("{total}", String(total))}
        </span>
        {isFetching ? <span className="text-xs text-muted-foreground">…</span> : null}
      </div>

      {/* Below `lg` the columns were squeezed to the phone viewport and
          `overflow-wrap: anywhere` let each name break one character per line.
          A min-width gives the columns room and lets the wrapper scroll
          sideways; `members-table` keeps the cells on one line at those widths
          only. From `lg` up neither applies, so the desktop table is unchanged. */}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.members.empty")}</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="members-table w-full min-w-[1000px] text-left text-sm lg:min-w-0">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("common.name")}</th>
                <th className="px-4 py-3">{t("admin.members.memberNo")}</th>
                <th className="px-4 py-3">{t("admin.members.cpf")}</th>
                <th className="px-4 py-3">{t("admin.members.posting")}</th>
                <th className="px-4 py-3">{t("common.phone")}</th>
                <th className="px-4 py-3">{t("card.district")}</th>
                <th className="px-4 py-3">{t("card.constituency")}</th>
                <th className="px-4 py-3">{t("card.issued")}</th>
                <th className="px-4 py-3">{t("admin.members.viewCard")}</th>
                <th className="px-4 py-3">{t("admin.members.edit")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const token = member.member_cards?.public_token;
                return (
                  <tr key={member.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{member.full_name}</td>
                    <td className="px-4 py-3">
                      {member.member_number !== null
                        ? String(member.member_number).padStart(6, "0")
                        : ""}
                    </td>
                    <td className="px-4 py-3">{member.cpf_no}</td>
                    <td className="px-4 py-3">{member.posting ?? ""}</td>
                    <td className="px-4 py-3">{member.phone}</td>
                    <td className="px-4 py-3">{member.district}</td>
                    <td className="px-4 py-3">{member.constituency}</td>
                    <td className="px-4 py-3">{formatDate(member.joined_at, language)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {token ? (
                        <Link
                          to="/verify/$token"
                          params={{ token }}
                          target="_blank"
                          className="font-medium text-primary underline"
                        >
                          {t("admin.members.viewCard")}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => openEditDialog(member)}
                      >
                        {t("admin.members.edit")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 || total > MEMBER_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {t("admin.members.pageInfo")
              .replace("{page}", String(page + 1))
              .replace("{pages}", String(pageCount))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={page === 0 || isFetching}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || isFetching}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              ‹ {t("admin.members.prev")}
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={page >= pageCount - 1 || isFetching}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              {t("admin.members.next")} ›
            </button>
            <button
              type="button"
              onClick={() => setPage(pageCount - 1)}
              disabled={page >= pageCount - 1 || isFetching}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              »
            </button>
          </div>
        </div>
      ) : null}

      {/* Edit Member Dialog */}
      {openEdit && editMember ? (
        <div
          className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div
            className="my-auto w-full max-w-lg rounded-lg bg-card p-6 shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            role="document"
          >
            <h2 className="mb-5 text-lg font-semibold text-foreground">
              {t("admin.members.editMember")}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("common.name")}
                </label>
                <input
                  value={editMember.full_name ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, full_name: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={70}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("enroll.cpf")}
                </label>
                <input
                  value={editMember.cpf_no ?? ""}
                  onChange={(e) =>
                    setEditMember({ ...editMember, cpf_no: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={30}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("enroll.posting")}
                </label>
                <input
                  value={editMember.posting ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, posting: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={70}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("common.phone")}
                </label>
                <input
                  value={editMember.phone ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, phone: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={10}
                  type="tel"
                  inputMode="numeric"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("enroll.address")}
                </label>
                <textarea
                  value={editMember.address ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, address: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  rows={3}
                  maxLength={300}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("card.district")}
                </label>
                <input
                  value={editMember.district ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, district: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={70}
                  placeholder={t("enroll.districtSelect")}
                  list="edit-district-options"
                  required
                />
                <datalist id="edit-district-options">
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("enroll.constituency")}
                </label>
                <input
                  value={editMember.constituency ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, constituency: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  maxLength={70}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("common.dob")}
                </label>
                <input
                  type="date"
                  value={editMember.date_of_birth ?? ""}
                  onChange={(e) => setEditMember({ ...editMember, date_of_birth: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("enroll.photo")}
                </label>
                <div className="flex items-center gap-4">
                  {editPhoto ? (
                    <img
                      src={URL.createObjectURL(editPhoto)}
                      alt={t("enroll.photo")}
                      className="h-20 w-16 rounded-md border border-border object-cover"
                    />
                  ) : currentPhotoUrl ? (
                    <img
                      src={currentPhotoUrl}
                      alt={t("enroll.photo")}
                      className="h-20 w-16 rounded-md border border-border object-cover"
                    />
                  ) : null}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void compressPhoto(file).then(setEditPhoto);
                    }}
                    className="text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("admin.members.photoMaxSize")}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="flex-1 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {save.isPending ? t("common.loading") : t("common.save")}
                </button>
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={save.isPending}
                  className="flex-1 whitespace-nowrap rounded-md border border-border px-4 py-2 text-sm text-foreground disabled:opacity-60"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}