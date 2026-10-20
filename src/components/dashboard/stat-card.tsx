import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  icon: IconCmp,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: Icon;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
  const toneStyles = {
    default: "bg-surface-2 text-foreground border border-border",
    primary: "bg-primary/15 text-primary border border-primary/20",
    success: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-500 border border-amber-500/20",
    danger: "bg-rose-500/15 text-rose-500 border border-rose-500/20",
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-xs transition hover:border-border">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneStyles)}>
        <IconCmp size={22} weight="bold" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}
