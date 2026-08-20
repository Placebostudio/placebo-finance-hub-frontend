"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Upload,
  ClipboardCheck,
  Receipt,
  CreditCard,
  GitMerge,
  BarChart3,
  Tag,
  Users,
  Settings,
  ChevronLeft,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";
import { useAuthStore } from "@/store/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Documents",
    icon: FileText,
    children: [
      { label: "All Documents", href: "/documents", icon: FileText },
      { label: "Upload", href: "/documents/upload", icon: Upload },
      { label: "Review Queue", href: "/documents/review", icon: ClipboardCheck },
    ],
  },
  { label: "Expenses", href: "/expenses", icon: Receipt },
  { label: "Transactions", href: "/transactions", icon: CreditCard },
  { label: "Reconciliation", href: "/reconciliation", icon: GitMerge },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Vendors / Categories", href: "/vendors", icon: Tag },
];

const bottomNavItems = [
  { label: "Users", href: "/users", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavLink({ item, sidebarOpen, depth = 0 }) {
  const pathname = usePathname();
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));

  if (item.children) {
    const isGroupActive = item.children.some(
      (c) => pathname === c.href || pathname.startsWith(c.href + "/")
    );
    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            isGroupActive
              ? "text-sidebar-foreground"
              : "text-sidebar-foreground/60",
            !sidebarOpen && "justify-center px-2"
          )}
        >
          <item.icon className="h-5 w-5 flex-shrink-0" />
          {sidebarOpen && <span className="truncate">{item.label}</span>}
        </div>
        {sidebarOpen && (
          <div className="ml-4 space-y-1">
            {item.children.map((child) => (
              <NavLink key={child.href} item={child} sidebarOpen={sidebarOpen} depth={1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={item.href}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          !sidebarOpen && "justify-center px-2",
          depth > 0 && sidebarOpen && "py-1.5 text-xs"
        )}
        title={!sidebarOpen ? item.label : undefined}
      >
        <item.icon className={cn("flex-shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
        {sidebarOpen && <span className="truncate">{item.label}</span>}
      </div>
    </Link>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { user, logout } = useAuthStore();

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-30 flex h-full flex-col border-r bg-sidebar transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16",
          "lg:relative lg:z-auto"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">
                  Placebo Finance
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">Hub</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "ml-auto h-8 w-8 flex-shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground",
              !sidebarOpen && "hidden lg:flex"
            )}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ChevronLeft
              className={cn("h-4 w-4 transition-transform", !sidebarOpen && "rotate-180")}
            />
          </Button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
          {navItems.map((item) => (
            <NavLink key={item.href ?? item.label} item={item} sidebarOpen={sidebarOpen} />
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="border-t p-3 space-y-1">
          {bottomNavItems.map((item) => (
            <NavLink key={item.href} item={item} sidebarOpen={sidebarOpen} />
          ))}

          {/* User */}
          {user && sidebarOpen && (
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="text-xs">{getInitials(user.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 text-left">
                <p className="truncate text-xs font-medium">{user.fullName}</p>
                <p className="truncate text-xs text-sidebar-foreground/50">Sign out</p>
              </div>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
