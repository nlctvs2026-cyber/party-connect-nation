import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import partyFlag from "@/assets/favicon.jpeg";
import { BrandStrip } from "./BrandStrip";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
import { useI18n } from "@/i18n";

export function SiteLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/", label: t("nav.home") },
    { to: "/enroll", label: t("nav.enroll") },
    { to: "/card", label: t("nav.card") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandStrip className="no-print" />
      <header className="no-print border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={partyFlag}
              alt={t("app.party")}
              className="h-11 w-11 rounded-full border-2 border-gold object-cover"
            />
            <span>
              <span className="block font-display text-lg leading-tight text-primary">
                {t("app.party")}
              </span>
              <span className="block text-xs text-muted-foreground">{t("app.fullName")}</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="ml-auto hidden items-center gap-1 text-sm md:flex">
            {navItems.map((item) => (
              <HeaderLink key={item.to} to={item.to}>
                {item.label}
              </HeaderLink>
            ))}
            <span className="ml-2">
              <LanguageSwitcher />
            </span>
          </nav>

          {/* Mobile hamburger */}
          <div className="ml-auto md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={t("nav.menu")}
                  aria-expanded={menuOpen}
                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-4/5 flex-col sm:max-w-xs">
                <SheetTitle className="pr-8">{t("nav.menu")}</SheetTitle>
                <nav className="mt-4 flex flex-col gap-1 text-base">
                  {navItems.map((item) => (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to}
                        className="rounded-md px-3 py-3 font-medium text-foreground transition-colors hover:bg-muted"
                        activeProps={{ className: "bg-muted text-primary" }}
                        activeOptions={{ exact: item.to === "/" }}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-6 border-t border-border pt-6">
                  <p className="mb-2 text-xs text-muted-foreground">{t("nav.language")}</p>
                  <LanguageSwitcher />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print mt-16 border-t border-border bg-card">
        <BrandStrip />
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {t("app.party")} · {t("app.state")}
        </div>
      </footer>
    </div>
  );
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-2 font-medium text-foreground transition-colors hover:bg-muted"
      activeProps={{ className: "bg-muted text-primary" }}
      activeOptions={{ exact: to === "/" }}
    >
      {children}
    </Link>
  );
}
