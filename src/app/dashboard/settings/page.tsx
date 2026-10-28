"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FacebookLogo,
  CheckCircle,
  WarningCircle,
  LinkSimple,
  LinkBreak,
  ArrowClockwise,
  Key,
  Copy,
  Check,
  ClockCountdown,
  Rocket,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";


interface SettingsState {
  facebook_connected: boolean;
  /** False when the deployment has no real Meta app credentials. */
  facebook_configured?: boolean;
  facebook_app_id: string | null;
  facebook_config_id: string | null;
  /** The secret itself never reaches the browser — only whether one is stored. */
  facebook_app_secret_set?: boolean;
  facebook_user_name: string | null;
  default_page_name: string | null;
  image_source?: string;
  utm_suffix: string;
  auto_post_enabled: boolean;
  posts_per_day: number;
  posting_hours: number[];
  timezone: string;
  topic_source?: "mine" | "trending" | "mixed";
  chatgpt_custom_gpt_url?: string | null;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <SettingsForm />
    </Suspense>
  );
}

function SettingsForm() {
  const params = useSearchParams();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [configId, setConfigId] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"uri" | "domain" | "cron" | null>(null);
  // Read from the browser rather than configured, so they always match the
  // hostname the user is actually on — the values Facebook compares against.
  const [redirectUri, setRedirectUri] = useState("");
  const [appDomain, setAppDomain] = useState("");
  const [cronUrl, setCronUrl] = useState("");
  const [runningCron, setRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/facebook/oauth/callback`);
    setAppDomain(window.location.hostname);
    setCronUrl(`${window.location.origin}/api/cron/process-queue`);
  }, []);

  const oauthStatus = params.get("facebook");
  const oauthMessage = params.get("message");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load settings.");
        setSettings(data);
        setAppId(data.facebook_app_id ?? "");
        setConfigId(data.facebook_config_id ?? "");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load settings."));
  }, []);

  async function saveCredentials() {
    setCredsError(null);
    if (!appId.trim()) {
      setCredsError("Enter the App ID from your Meta app.");
      return;
    }
    // An already-stored secret is left alone unless a new one is typed, so the
    // masked field does not have to round-trip the real value.
    if (!appSecret.trim() && !settings?.facebook_app_secret_set) {
      setCredsError("Enter the App Secret from App settings > Basic.");
      return;
    }

    setSavingCreds(true);
    try {
      const res = await fetch("/api/facebook/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: appId.trim(),
          appSecret: appSecret.trim() || undefined,
          configId: configId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save those credentials.");

      setAppSecret("");
      setSettings((s) =>
        s
          ? {
              ...s,
              facebook_app_id: appId.trim(),
              facebook_config_id: configId.trim() || null,
              facebook_app_secret_set: true,
              facebook_configured: true,
            }
          : s
      );
    } catch (err) {
      setCredsError(err instanceof Error ? err.message : "Couldn't save those credentials.");
    } finally {
      setSavingCreds(false);
    }
  }

  async function copyValue(value: string, which: "uri" | "domain") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCredsError("Copying failed — select the field and copy manually.");
    }
  }

  async function save(patch: Partial<SettingsState>) {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings((s) => (s ? { ...s, ...data } : s));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const res = await fetch("/api/facebook/disconnect", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to disconnect Facebook.");
      setSettings((s) =>
        s
          ? {
              ...s,
              facebook_connected: false,
              facebook_user_name: null,
              default_page_name: null,
              facebook_page_ready: false,
            }
          : s
      );
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : "Failed to disconnect Facebook.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {oauthStatus === "connected" && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3.5 text-sm text-success">
          <CheckCircle size={18} /> Facebook account connected.
        </div>
      )}
      {oauthStatus === "error" && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <WarningCircle size={18} /> {oauthMessage ?? "Couldn't connect Facebook."}
        </div>
      )}

      {/* Facebook connection */}
      <Card>
        {disconnectError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <WarningCircle size={16} /> {disconnectError}
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FacebookLogo size={22} weight="fill" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-foreground">Facebook account</h2>
              {settings.facebook_connected ? (
                <div>
                  <p className="mt-0.5 text-sm text-success">
                    Connected as {settings.facebook_user_name ?? "your account"}
                  </p>
                  {settings.default_page_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Default Page: <span className="font-medium text-foreground">{settings.default_page_name}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-500 font-medium">
                      No Facebook Page selected yet.{" "}
                      <Link href="/dashboard/pages" className="underline font-semibold">
                        Choose Page →
                      </Link>
                    </p>
                  )}
                </div>
              ) : settings.facebook_configured === false ? (
                <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                  Add your Meta App ID and secret below to enable connecting.
                  Everything else works without them.
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">Not connected yet</p>
              )}
            </div>
          </div>
          {settings.facebook_connected ? (
            <div className="flex items-center gap-2">
              <a href="/api/facebook/oauth/start">
                <Button size="sm" variant="secondary">
                  <ArrowClockwise size={14} /> Reconnect
                </Button>
              </a>
              <Button size="sm" variant="secondary" onClick={disconnect} disabled={disconnecting}>
                <LinkBreak size={14} /> {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ) : (
            // A plain anchor on purpose: this route answers with a redirect to
            // Facebook, which needs a full page navigation. <Link> would try to
            // route it client-side.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/api/facebook/oauth/start"
              aria-disabled={settings.facebook_configured === false}
              className={settings.facebook_configured === false ? "pointer-events-none" : undefined}
            >
              <Button size="sm" disabled={settings.facebook_configured === false}>
                <LinkSimple size={14} /> Connect
              </Button>
            </a>
          )}
        </div>
      </Card>

      {/* Meta app credentials */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground">
            <Key size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading font-bold text-foreground">Meta app</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Create one at{" "}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                developers.facebook.com/apps
              </a>{" "}
              with the <strong>&quot;Manage everything on your Page&quot;</strong> use case — not
              the Facebook Login one, which Meta treats as incompatible with Page
              management. Posting to a Page you administer needs no App Review.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">App ID</label>
                <input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1234567890123456"
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">App Secret</label>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={
                    settings.facebook_app_secret_set ? "•••• saved — type to replace" : "from App settings > Basic"
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Login configuration ID
              </label>
              <input
                value={configId}
                onChange={(e) => setConfigId(e.target.value)}
                placeholder="required if your app uses Facebook Login for Business"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Apps created with the &quot;Manage everything on your Page&quot; use case use
                Facebook Login for Business, where this replaces the permission list.
                Find it under <strong>Facebook Login for Business → Configurations</strong>.
                Leave blank for classic Facebook Login.
              </p>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Redirect URI — paste this into your Meta app&apos;s login settings, under Valid OAuth Redirect URIs
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={redirectUri}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 font-mono text-xs text-muted-foreground outline-none"
                />
                <Button size="sm" variant="secondary" onClick={() => copyValue(redirectUri, "uri")}>
                  {copied === "uri" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "uri" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-muted-foreground">
                App Domain — paste this into App settings &gt; Basic &gt; App Domains
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={appDomain}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 font-mono text-xs text-muted-foreground outline-none"
                />
                <Button size="sm" variant="secondary" onClick={() => copyValue(appDomain, "domain")}>
                  {copied === "domain" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "domain" ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Without this, Facebook refuses the login with
                &quot;Can&apos;t load URL: the domain of this URL isn&apos;t included in the
                app&apos;s domains&quot;. No <code className="rounded bg-surface-2 px-1 text-[11px]">https://</code>,
                no trailing slash.
              </p>
            </div>

            {credsError && <p className="mt-2 text-xs text-destructive">{credsError}</p>}

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={saveCredentials} disabled={savingCreds}>
                {savingCreds ? "Saving…" : "Save credentials"}
              </Button>
              {settings.facebook_configured && (
                <span className="text-xs font-medium text-success">Credentials stored</span>
              )}
            </div>

            {/* Once the App ID is known these can be built for this exact app,
                which saves hunting through the Meta dashboard for the three
                screens this setup touches. */}
            {settings.facebook_app_id && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Open in your Meta app
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {[
                    {
                      label: "Basic settings — App Domains",
                      href: `https://developers.facebook.com/apps/${settings.facebook_app_id}/settings/basic/`,
                    },
                    {
                      label: "Use cases — add permissions",
                      href: `https://developers.facebook.com/apps/${settings.facebook_app_id}/use_cases/`,
                    },
                    {
                      label: "Login settings — Redirect URIs",
                      href: `https://developers.facebook.com/apps/${settings.facebook_app_id}/fb-login/settings/`,
                    },
                    {
                      label: "Login configurations",
                      href: `https://developers.facebook.com/apps/${settings.facebook_app_id}/fb-login/configurations/`,
                    },
                    {
                      label: "App dashboard",
                      href: `https://developers.facebook.com/apps/${settings.facebook_app_id}/`,
                    },
                  ].map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {link.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>


      {/* ChatGPT Assistant Bridge */}
      <Card>
        <h2 className="font-heading font-bold text-foreground">Custom GPT Assistant (Vetechno FB Auto Post)</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Connect your Custom GPT with DALL-E image generation to create posts using your ChatGPT subscription, without requiring paid OpenAI or image API keys.
        </p>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted-foreground">
            Custom GPT URL (e.g. https://chatgpt.com/g/g-675034...-vetechno-fb-auto-post)
          </label>
          <input
            type="url"
            value={settings.chatgpt_custom_gpt_url ?? ""}
            onChange={(e) => setSettings({ ...settings, chatgpt_custom_gpt_url: e.target.value || null })}
            onBlur={(e) => save({ chatgpt_custom_gpt_url: e.target.value.trim() || null })}
            placeholder="https://chatgpt.com/g/g-..."
            className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            When configured, the &ldquo;Open Custom GPT&rdquo; button in the Generate dashboard will launch this assistant directly.
          </p>
        </div>
      </Card>

      {/* Background Scheduler & Webhook */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold text-foreground">Scheduled Posts Background Worker</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              How scheduled posts are monitored and automatically published when their time arrives.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Worker active
          </span>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle size={16} className="text-success shrink-0" />
              <span>Real-Time Browser Scheduler (Active)</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              While any dashboard tab is open in your browser, the internal background worker polls every 60 seconds (and immediately when refocusing tabs). Any due scheduled posts are automatically dispatched to Facebook without needing manual intervention.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-3">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ClockCountdown size={16} className="text-primary shrink-0" />
              <span>Unattended 24/7 Publishing (When Browser Is Closed)</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              To publish scheduled posts even when your computer is asleep or no browser tab is open, configure a free recurring ping (every 5 to 10 minutes) with a cron service like <strong className="text-foreground">cron-job.org</strong>, <strong className="text-foreground">GitHub Actions</strong>, or <strong className="text-foreground">Vercel Cron</strong> to call this endpoint:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cronUrl}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(cronUrl);
                  setCopied("cron");
                  setTimeout(() => setCopied(null), 2000);
                }}
              >
                {copied === "cron" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "cron" ? "Copied" : "Copy URL"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Note: If your environment has a <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">CRON_SECRET</code> configured, supply it via header <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">Authorization: Bearer &lt;CRON_SECRET&gt;</code> or URL parameter <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">?secret=&lt;CRON_SECRET&gt;</code>.
            </p>
          </div>

          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={runningCron}
              onClick={async () => {
                setRunningCron(true);
                setCronResult(null);
                try {
                  const res = await fetch("/api/cron/process-queue", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    setCronResult(
                      `Success: Processed ${data.processedFromQueue ?? 0} due post(s).`
                    );
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("pab:posts-updated", { detail: data }));
                    }
                  } else {
                    setCronResult(`Error: ${data.error ?? "Failed to run scheduler"}`);
                  }
                } catch (e) {
                  setCronResult(e instanceof Error ? e.message : "Network error");
                } finally {
                  setRunningCron(false);
                }
              }}
              className="gap-1.5"
            >
              <Rocket size={14} />
              {runningCron ? "Running Scheduler Check…" : "Run Scheduler Check Now"}
            </Button>
            {cronResult && (
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[60%]">
                {cronResult}
              </span>
            )}
          </div>
        </div>
      </Card>


      <div className="h-4 text-right text-xs text-muted-foreground">
        {saving ? "Saving…" : saved ? "Saved ✓" : ""}
      </div>
    </div>
  );
}
