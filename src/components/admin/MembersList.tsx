import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { listMembers } from "@/services/admin";

export function MembersList() {
  const { t, language } = useI18n();
  const [search, setSearch] = useState("");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["members"],
    queryFn: listMembers,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !data) return data ?? [];
    return data.filter((member) =>
      [
        member.full_name,
        member.cpf_no,
        member.member_number !== null ? String(member.member_number).padStart(6, "0") : "",
        member.district,
        member.constituency,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, search]);

  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
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
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("admin.members.search")}
        maxLength={80}
        className="w-full max-w-sm rounded-md border border-input bg-card px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.members.empty")}</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
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
              {filtered.map((member) => {
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
    </div>
  );
}
