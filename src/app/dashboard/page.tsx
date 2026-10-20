import Link from "next/link";
import {
  MegaphoneSimple,
  CalendarCheck,
  ClockCountdown,
  ChartLineUp,
  Sparkle,
  ArrowRight,
  WarningCircle,
  ImageSquare,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { PostsChart } from "@/components/dashboard/posts-chart";
import { listPosts } from "@/lib/db/posts";
import { getSettings } from "@/lib/db/settings";
import { isFacebookConnected } from "@/lib/types";
import type { Post } from "@/lib/types";

export const dynamic = "force-dynamic";

function buildChartData(posted: { posted_at: string | null }[]) {
  const days = 14;
  const counts = new Map<string, number>();
  const today = new Date();

  const labels: { date: string; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    counts.set(key, 0);
    labels.push({
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  for (const post of posted) {
    if (!post.posted_at) continue;
    const key = post.posted_at.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return labels.map((l) => ({ ...l, count: counts.get(l.date) ?? 0 }));
}

function SetupNeeded({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card className="border-amber-500/30 bg-amber-500/5 p-6 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <WarningCircle size={24} weight="bold" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-foreground">
              Database Setup Required
            </h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              The application is deployed, but unable to query the database.
              Verify your Supabase credentials and schema:
            </p>

            <ol className="mt-4 space-y-2.5 text-xs sm:text-sm text-foreground list-decimal pl-4">
              <li>
                <span className="font-semibold">Run schema:</span> In Supabase SQL Editor, execute{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary">
                  supabase/schema.sql
                </code>.
              </li>
              <li>
                <span className="font-semibold">Check environment variables:</span> Ensure{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                  SUPABASE_SERVICE_ROLE_KEY
                </code>{" "}
                are configured.
              </li>
            </ol>

            <p className="mt-4 rounded-xl bg-surface-2 p-3 font-mono text-xs break-all text-muted-foreground border border-border">
              {reason}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default async function DashboardOverviewPage() {
  let posts: Post[];
  let settings: Awaited<ReturnType<typeof getSettings>>;

  try {
    [posts, settings] = await Promise.all([listPosts({ limit: 200 }), getSettings()]);
  } catch (err) {
    return <SetupNeeded reason={err instanceof Error ? err.message : String(err)} />;
  }

  const posted = posts.filter((p: Post) => p.status === "posted");
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const postedThisWeek = posted.filter((p: Post) => p.posted_at && new Date(p.posted_at).getTime() > weekAgo);
  const inQueue = posts.filter((p: Post) => p.status === "scheduled" || p.status === "draft");
  const failed = posts.filter((p: Post) => p.status === "failed");
  const recent = posts.slice(0, 6);
  const connected = isFacebookConnected(settings);

  const chartData = buildChartData(posted);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Connection Alert if not configured */}
      {!connected && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 sm:flex-row sm:items-center shadow-xs">
          <div className="space-y-0.5">
            <p className="font-semibold text-sm sm:text-base text-foreground">
              Connect Facebook to start publishing
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              You can generate and stage drafts via Custom GPT, but publishing requires an authorized Facebook Page.
            </p>
          </div>
          <Link href="/dashboard/settings" className="shrink-0">
            <Button size="sm" className="gap-1.5 rounded-xl font-semibold">
              <span>Connect Facebook</span>
              <ArrowRight size={14} weight="bold" />
            </Button>
          </Link>
        </div>
      )}

      {/* 2. Top Summary Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total posted"
          value={posted.length}
          icon={MegaphoneSimple}
          tone="primary"
        />
        <StatCard
          label="Posted this week"
          value={postedThisWeek.length}
          icon={CalendarCheck}
          tone="success"
        />
        <StatCard
          label="In queue"
          value={inQueue.length}
          icon={ClockCountdown}
          tone="warning"
        />
        <StatCard
          label="Failed"
          value={failed.length}
          icon={ChartLineUp}
          tone={failed.length > 0 ? "danger" : "default"}
        />
      </div>

      {/* 3. Middle Section: Activity Chart (Left) & Quick Generate Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Chart Column (Span 2) */}
        <div className="lg:col-span-2 rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm sm:text-base font-bold text-foreground">
              Posts published — last 14 days
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              {posted.length} total recorded
            </span>
          </div>
          <PostsChart data={chartData} />
        </div>

        {/* Quick Generate Panel (Span 1) */}
        <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <h2 className="font-heading text-sm sm:text-base font-bold text-foreground">
              Quick generate
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Pick a topic and let the bot write the copy and source the image.
            </p>
          </div>

          <Link href="/dashboard/generate" className="w-full">
            <Button className="w-full py-3 rounded-xl gap-2 font-semibold shadow-md shadow-primary/20 bg-primary hover:bg-primary-hover text-primary-foreground">
              <Sparkle size={18} weight="fill" />
              <span>Generate a post</span>
            </Button>
          </Link>

          <div className="border-t border-border/80 pt-4 space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Facebook</span>
              <span className={connected ? "font-semibold text-emerald-500" : "font-medium text-muted-foreground"}>
                {connected ? (settings.facebook_user_name ?? "Connected") : "Not connected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Page</span>
              <span className="truncate font-semibold text-foreground max-w-[160px] text-right">
                {settings.default_page_name ?? "None selected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Autopilot</span>
              <span className={settings.auto_post_enabled ? "font-semibold text-emerald-500" : "font-medium text-muted-foreground"}>
                {settings.auto_post_enabled ? `On · ${settings.posts_per_day}/day` : "Off"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: Recent Activity Table */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm sm:text-base font-bold text-foreground">
            Recent activity
          </h2>
          <Link
            href="/dashboard/history"
            className="text-xs sm:text-sm font-semibold text-primary hover:underline transition"
          >
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
              <ImageSquare size={24} />
            </div>
            <p className="text-sm font-medium text-foreground">No posts yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Stage a content request or generate your first post to see your activity timeline here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                  <th className="py-2.5 pr-3 w-12">Image</th>
                  <th className="py-2.5 pr-3">Title</th>
                  <th className="py-2.5 pr-3 hidden sm:table-cell">Page</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recent.map((post: Post) => (
                  <tr key={post.id} className="hover:bg-surface-2/40 transition">
                    <td className="py-3 pr-3">
                      {post.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.image_url}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover bg-surface-2 border border-border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted-foreground">
                          <ImageSquare size={16} />
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-medium text-foreground truncate max-w-[200px] sm:max-w-[340px]">
                      {post.title}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground hidden sm:table-cell truncate max-w-[160px]">
                      {post.page_name ?? "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={post.status} />
                    </td>
                    <td className="py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(post.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
