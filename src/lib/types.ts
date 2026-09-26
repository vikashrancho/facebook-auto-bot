export type ImageSource = "ai" | "stock";
export type ImageSourcePref = "ai" | "stock" | "mixed";
export type PostStatus = "draft" | "scheduled" | "posted" | "failed";

/**
 * Where autopilot gets its subjects. "mine" rotates through the owner's own
 * topic list and only borrows trending ideas while that list is empty.
 */
export type TopicSource = "mine" | "trending" | "mixed";

export interface Topic {
  id: string;
  text: string;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface AppSettings {
  id: 1;
  /** Meta app credentials, normally entered in Settings rather than env vars. */
  facebook_app_id: string | null;
  facebook_app_secret: string | null;
  /**
   * Facebook Login for Business "login configuration" id. Apps created with the
   * Page-management use case get Login for Business, where config_id replaces
   * scope — the permissions come from the saved configuration instead of the
   * URL. Null means the app uses classic Facebook Login and scopes.
   */
  facebook_config_id: string | null;
  /** Long-lived user token — lists Pages and mints Page tokens, never posts. */
  facebook_user_token: string | null;
  facebook_token_expires_at: string | null;
  facebook_user_name: string | null;
  default_page_id: string | null;
  default_page_name: string | null;
  /** Page tokens derived from a long-lived user token do not expire. */
  default_page_token: string | null;
  image_source: ImageSourcePref;
  utm_suffix: string;
  auto_post_enabled: boolean;
  posts_per_day: number;
  posting_hours: number[];
  timezone: string;
  last_auto_post_at: string | null;
  /** Absent on databases created before topics existed; treat as "mine". */
  topic_source?: TopicSource;
  /** Custom system prompt for copywriting. Defaults to internal prompt if null. */
  system_prompt?: string | null;
  /** Active AI provider or auto-fallback */
  ai_provider?: "gemini" | "groq" | "openai" | "openrouter" | "auto";
  gemini_api_key?: string | null;
  groq_api_key?: string | null;
  openai_api_key?: string | null;
  openrouter_api_key?: string | null;
  gemini_enabled?: boolean;
  groq_enabled?: boolean;
  openai_enabled?: boolean;
  openrouter_enabled?: boolean;
  updated_at: string;
}

export interface Post {
  id: string;
  topic: string;
  title: string;
  description: string;
  hashtags: string[];
  image_url: string;
  image_source: ImageSource;
  link_url: string | null;
  page_id: string | null;
  page_name: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  facebook_post_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface PageCache {
  page_id: string;
  name: string;
  category: string | null;
  fetched_at: string;
}

/** Which service wrote the copy. "template" means every provider was unreachable. */
export type ContentProvider =
  | "gemini"
  | "groq"
  | "openai"
  | "openrouter"
  | "pollinations"
  | "template";

export interface GeneratedContent {
  title: string;
  description: string;
  hashtags: string[];
  image_prompt?: string;
  provider?: ContentProvider;
  /** First provider failure, surfaced so a degraded draft can explain itself. */
  providerError?: string;
}

/**
 * Public URL of a published post. Facebook returns `post_id` as
 * `<page-id>_<post-id>`, and that composite is itself addressable.
 */
export const facebookPostUrl = (postId: string) => `https://www.facebook.com/${postId}`;

export const isFacebookConnected = (s: Pick<AppSettings, "facebook_user_token">) =>
  Boolean(s.facebook_user_token);

/**
 * Facebook takes one `message` per post, so the separately-edited parts are
 * composed here — one place, shared by the publisher and the preview.
 */
export function composeMessage(
  post: Pick<Post, "title" | "description" | "hashtags" | "link_url">,
  utmSuffix = ""
): string {
  const tags = post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return [post.title, post.description, post.link_url ?? "", tags, utmSuffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------- Facebook Post Templates */

export type FacebookAspectRatio = "1:1" | "4:5" | "1.91:1" | "9:16";

export interface AspectRatioConfig {
  id: FacebookAspectRatio;
  label: string;
  sublabel: string;
  width: number;
  height: number;
  description: string;
}

export const FACEBOOK_ASPECT_RATIOS: Record<FacebookAspectRatio, AspectRatioConfig> = {
  "1:1": {
    id: "1:1",
    label: "Square",
    sublabel: "1200 × 1200",
    width: 1200,
    height: 1200,
    description: "Standard Facebook Feed. Perfectly balanced for desktop & mobile feeds.",
  },
  "4:5": {
    id: "4:5",
    label: "Portrait",
    sublabel: "1080 × 1350",
    width: 1080,
    height: 1350,
    description: "Vertical Feed Post. Maximizes vertical screen presence on mobile.",
  },
  "1.91:1": {
    id: "1.91:1",
    label: "Landscape",
    sublabel: "1200 × 630",
    width: 1200,
    height: 630,
    description: "Horizontal Banner. Ideal for link shares, events & news announcements.",
  },
  "9:16": {
    id: "9:16",
    label: "Story / Reel",
    sublabel: "1080 × 1920",
    width: 1080,
    height: 1920,
    description: "Full-screen vertical format for Facebook Stories and Reels.",
  },
};

export interface TemplateTextElement {
  id: string;
  type: "badge" | "headline" | "subtext" | "footer" | "custom";
  text: string;
  fontSize: number; // in px at base canvas scale
  fontWeight: "normal" | "600" | "bold" | "800";
  fontFamily: "Inter" | "Montserrat" | "Merriweather" | "Impact" | "Outfit";
  color: string;
  align: "left" | "center" | "right";
  yOffset: number; // percentage from top (0 - 100)
  showBackgroundPill?: boolean;
  pillColor?: string;
  pillOpacity?: number;
}

export interface PostTemplate {
  id: string;
  name: string;
  ratio: FacebookAspectRatio;
  width: number;
  height: number;
  backgroundType: "image" | "gradient" | "color";
  backgroundUrl?: string;
  backgroundGradient?: string;
  backgroundColor?: string;
  overlayOpacity: number; // 0 to 1
  logoUrl?: string;
  logoPosition?: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center";
  logoSize?: number;
  logoOpacity?: number;
  showLogoBackdrop?: boolean;
  textElements: TemplateTextElement[];
  category?: string;
  created_at?: string;
}
