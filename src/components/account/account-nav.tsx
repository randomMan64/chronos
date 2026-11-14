"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Settings, Shield, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/account/profile", label: "My Profile", icon: User },
  { href: "/account/settings", label: "Account Settings", icon: Settings },
  { href: "/account/security", label: "Security", icon: Shield },
  { href: "/account/appearance", label: "Appearance", icon: Monitor },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center bg-panel border border-border p-1 rounded-lg gap-1 max-w-full overflow-x-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
              isActive
                ? "bg-elevated text-foreground shadow-sm font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-elevated/40"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
