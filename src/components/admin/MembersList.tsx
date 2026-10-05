import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { listMembersPage, MEMBER_PAGE_SIZE } from "@/services/admin";

export function MembersList() {
  const { t, language } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce the search box: only hit the server 300ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0); // a new search always restarts at page 1
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["members", page, search],
    queryFn: () => listMembersPage(page, search),
    placeholderData: (previous) => previous, // keep the old page visible while fetching
  });

  const members = data?.members ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / MEMBER_PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * MEMBER_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * MEMBER_PAGE_SIZE);

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
          <table className="members-table w-full min-w-[900px] text-left text-sm lg:min-w-0">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="break-anywhere px-4 py-3">{t("common.name")}</th>
                <th className="break-anywhere px-4 py-3">{t("admin.members.memberNo")}</th>
                <th className="break-anywhere px-4 py-3">{t("admin.members.cpf")}</th>
                <th className="break-anywhere px-4 py-3">{t("admin.members.posting")}</th>
                <th className="break-anywhere px-4 py-3">{t("common.phone")}</th>
                <th className="break-anywhere px-4 py-3">{t("card.district")}</th>
                <th className="break-anywhere px-4 py-3">{t("card.constituency")}</th>
                <th className="break-anywhere px-4 py-3">{t("card.issued")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const token = member.member_cards?.public_token;
                return (
                  <tr key={member.id} className="border-t border-border">
                    <td className="break-anywhere px-4 py-3 font-medium">{member.full_name}</td>
                    <td className="break-anywhere px-4 py-3">
                      {member.member_number !== null
                        ? String(member.member_number).padStart(6, "0")
                        : ""}
                    </td>
                    <td className="break-anywhere px-4 py-3">{member.cpf_no}</td>
                    <td className="break-anywhere px-4 py-3">{member.posting ?? ""}</td>
                    <td className="break-anywhere px-4 py-3">{member.phone}</td>
                    <td className="break-anywhere px-4 py-3">{member.district}</td>
                    <td className="break-anywhere px-4 py-3">{member.constituency}</td>
                    <td className="break-anywhere px-4 py-3">{formatDate(member.joined_at, language)}</td>
                    <td className="break-anywhere px-4 py-3">
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
    </div>
  );
}
