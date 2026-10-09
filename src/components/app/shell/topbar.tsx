"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Bell, CheckCheck, FileText, KeyRound, LogOut, Monitor, Moon, Search, ShoppingCart, Sun, UserRound } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { globalSearch, markAllNotificationsRead, markNotificationRead, type SearchHit } from "@/app/(app)/shell-actions";
import { logoutAction } from "@/app/(auth)/actions";
import type { ClientUser } from "@/server/auth/user";

export interface ShellNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function Topbar({ user, notifications, unread }: { user: ClientUser; notifications: ShellNotification[]; unread: number }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell notifications={notifications} unread={unread} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          setHits(await globalSearch(value));
        } catch {
          setHits([]);
        }
      });
    }, 250);
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const requests = hits.filter((h) => h.type === "request");
  const pos = hits.filter((h) => h.type === "po");

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full max-w-sm justify-start gap-2 text-muted-foreground shadow-none sm:w-72"
      >
        <Search className="size-4" />
        <span className="truncate">Cari nomor, judul, barang…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Pencarian" description="Cari pengajuan atau PO">
        <Command shouldFilter={false}>
        <CommandInput placeholder="Ketik nomor pengajuan, judul, nama barang, atau vendor…" value={query} onValueChange={onChange} />
        <CommandList>
          {pending && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Spinner /> Mencari…
            </div>
          )}
          {!pending && query.trim().length >= 2 && hits.length === 0 && <CommandEmpty>Tidak ada hasil.</CommandEmpty>}
          {query.trim().length < 2 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ketik minimal 2 karakter.</div>}
          {requests.length > 0 && (
            <CommandGroup heading="Pengajuan">
              {requests.map((h) => (
                <CommandItem key={h.id} value={h.id} onSelect={() => go(h.href)}>
                  <FileText />
                  <div className="min-w-0">
                    <div className="truncate">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {pos.length > 0 && (
            <CommandGroup heading="Pesanan (PO)">
              {pos.map((h) => (
                <CommandItem key={h.id} value={h.id} onSelect={() => go(h.href)}>
                  <ShoppingCart />
                  <div className="min-w-0">
                    <div className="truncate">{h.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function NotificationBell({ notifications, unread }: { notifications: ShellNotification[]; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const openItem = (n: ShellNotification) => {
    setOpen(false);
    startTransition(async () => {
      if (!n.readAt) await markNotificationRead(n.id);
      if (n.link) router.push(n.link);
      router.refresh();
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifikasi</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => startTransition(async () => { await markAllNotificationsRead(); router.refresh(); })}
            >
              <CheckCheck className="size-3.5" /> Tandai semua dibaca
            </Button>
          )}
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada notifikasi.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60",
                  !n.readAt && "bg-primary/[0.04]",
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifikasi" onClick={() => setOpen(false)}>
              Lihat semua notifikasi
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ user }: { user: ClientUser }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Menu pengguna">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm font-medium md:inline">{user.fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          {user.roleNames.length > 0 && <div className="mt-1 truncate text-xs text-muted-foreground">{user.roleNames.join(", ")}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profil">
            <UserRound /> Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profil#password">
            <KeyRound /> Ganti password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun /> Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Terang
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Gelap
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> Ikuti perangkat
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Keluar
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
