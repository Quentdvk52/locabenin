"use client";

// ============================================================
// LocaBénin — Chrome applicatif
// • PublicHeader : header collant public (logo, recherche rapide, CTA)
// • MobileTabBar : navigation basse mobile (≥ 44 px, mobile-first)
// • DashboardShell : coquille des 4 espaces (sidebar desktop + menu mobile,
//   sélecteur de rôle, cloche de notifications)
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, Search, Heart, MessageSquare, User, Moon, Sun, Bell, LogOut, Menu, ChevronDown, ShieldCheck, Landmark, LayoutDashboard, Building2, Users, Wallet, CreditCard, CalendarDays, Wrench, Megaphone, FileText, Settings, BarChart3, ScrollText, KeyRound, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/lib/client/session";
import { navigate, useRoute } from "@/lib/client/router";
import { label, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function Logo({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <Link href="#" onClick={(e) => { e.preventDefault(); navigate("/"); }} className={cn("flex items-center gap-2", className)} aria-label="LocaBénin — accueil">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <Landmark className="size-5" aria-hidden />
      </span>
      <span className={cn("font-display text-lg font-bold tracking-tight", light ? "text-white" : "text-foreground")}>
        Loca<span className="text-primary">Bénin</span>
      </span>
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Basculer le mode sombre" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="size-5 dark:hidden" />
      <Moon className="hidden size-5 dark:block" />
    </Button>
  );
}

export function PublicHeader() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const route = useRoute();
  const isHome = route.path === "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Logo />
        {!isHome && (
          <form
            className="relative ml-2 hidden flex-1 md:block"
            onSubmit={(e) => { e.preventDefault(); navigate(`/recherche?q=${encodeURIComponent(q)}`); }}
            role="search"
          >
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quartier, ville, type de bien…" className="pl-9 bg-secondary/60" aria-label="Recherche rapide" />
          </form>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" className="hidden md:inline-flex" onClick={() => navigate("/devenir-demarcheur")}>
            Devenir démarcheur
          </Button>
          {user ? (
            <UserMenu variant="public" />
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/connexion")}>Connexion</Button>
              <Button onClick={() => navigate("/connexion?mode=register&role=OWNER")} className="hidden sm:inline-flex">Publier une offre</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function NotificationsBell() {
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/me/notifications");
        if (!res.ok) return { unread: 0, items: [] };
        const json = await res.json();
        return json.data ?? { unread: 0, items: [] };
      } catch {
        return { unread: 0, items: [] };
      }
    },
    refetchInterval: 30_000,
  });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${data?.unread ? ` (${data.unread} non lues)` : ""}`}>
          <Bell className="size-5" />
          {(data?.unread ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid size-4.5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-amber-950">
              {data!.unread > 9 ? "9+" : data!.unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[92vw]">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {(data?.unread ?? 0) > 0 && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={async () => {
                await fetch("/api/me/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >Tout marquer comme lu</button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="styled-scroll max-h-96 overflow-y-auto">
          {(data?.items ?? []).length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucune notification pour le moment.</p>
          )}
          {(data?.items ?? []).slice(0, 12).map((n) => (
            <button
              key={n.id}
              className={cn("w-full px-3 py-2.5 text-left hover:bg-accent/50", !n.readAt && "bg-primary/5")}
              onClick={async () => {
                if (!n.readAt) {
                  await fetch("/api/me/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }
                setOpen(false);
                if (n.linkHash) navigate(n.linkHash);
              }}
            >
              <p className={cn("text-sm", !n.readAt ? "font-semibold" : "font-medium")}>{n.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ variant }: { variant: "public" | "dashboard" }) {
  const { user, switchRole, logout } = useSession();
  const qc = useQueryClient();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-8">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
            <AvatarFallback className="bg-primary/15 text-primary font-semibold">
              {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden flex-col items-start lg:flex">
            <span className="max-w-32 truncate text-sm font-semibold leading-tight">{user.fullName}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{label(user.activeRole)}</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="truncate">{user.fullName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.phone ?? user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.roles.length > 1 && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Changer d&apos;espace ({label(user.activeRole)})</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {user.roles.map((r) => (
                    <DropdownMenuItem key={r} disabled={r === user.activeRole} onClick={async () => { await switchRole(r); toast.success(`Espace ${label(r)} activé`); }}>
                      {label(r)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        {user.isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/admin")}><ShieldCheck className="mr-2 size-4" />Back-office admin</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate("/locataire/profil")}><User className="mr-2 size-4" />Mon profil &amp; KYC</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await logout(); qc.clear(); navigate("/"); }}>
          <LogOut className="mr-2 size-4" />Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface SpaceNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function DashboardShell({
  title, nav, children,
}: {
  title: string;
  nav: SpaceNavItem[];
  children: React.ReactNode;
}) {
  const route = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPath = route.path;

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav className="space-y-1" aria-label={`Navigation ${title}`}>
      {nav.map((item) => {
        const active = currentPath === item.href || currentPath.startsWith(item.href + "/");
        return (
          <button
            key={item.href}
            onClick={() => { navigate(item.href); onNavigate?.(); }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden />
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500/20 text-amber-700 dark:text-amber-400")}>
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-surface/60">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
        <Logo />
        <div className="mt-6 flex-1 styled-scroll overflow-y-auto">{renderNavLinks()}</div>
        <div className="border-t pt-3">
          <UserMenu variant="dashboard" />
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-4"><Logo /></SheetTitle>
              {renderNavLinks(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>
          <h1 className="truncate font-display text-lg font-bold">{title}</h1>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <div className="lg:hidden"><UserMenu variant="dashboard" /></div>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 lg:px-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}

/** Navigation basse mobile pour les espaces (mobile-first absolu). */
export function SpaceTabBar({ items }: { items: SpaceNavItem[] }) {
  const route = useRoute();
  const shown = items.slice(0, 4);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur safe-bottom lg:hidden" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {shown.map((item) => {
          const active = route.path === item.href || route.path.startsWith(item.href + "/");
          return (
            <button key={item.href} onClick={() => navigate(item.href)} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <item.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => navigate("/compte")} aria-current={route.path.startsWith("/compte") ? "page" : undefined}
          className={cn("flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium", route.path.startsWith("/compte") ? "text-primary" : "text-muted-foreground")}>
          <User className="size-5" aria-hidden />
          <span>Compte</span>
        </button>
      </div>
    </nav>
  );
}

/** Navigation basse mobile publique. */
export function PublicTabBar() {
  const route = useRoute();
  const { user } = useSession();
  const items = [
    { href: "/", label: "Accueil", icon: Home },
    { href: "/recherche", label: "Rechercher", icon: Search },
    { href: "/favoris", label: "Favoris", icon: Heart },
    { href: user ? "/messagerie" : "/connexion", label: "Messages", icon: MessageSquare },
    { href: user ? "/compte" : "/connexion", label: user ? "Compte" : "Connexion", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur safe-bottom md:hidden" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = route.path === item.href;
          return (
            <button key={`${item.href}-${item.label}`} onClick={() => navigate(item.href)} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <item.icon className="size-5" aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Icônes partagées pour la navigation des espaces (importées par la coquille). */
export const navIcons = { LayoutDashboard, Building2, Users, Wallet, CreditCard, CalendarDays, MessageSquare, Wrench, Megaphone, FileText, Settings, BarChart3, ScrollText, ShieldCheck, KeyRound, MapPin, Heart, Search, User, Bell };
