"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ImageSquare,
  UploadSimple,
  DownloadSimple,
  Rocket,
  FloppyDisk,
  Sparkle,
  Eye,
  PencilSimple,
  Trash,
  Plus,
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  ArrowSquareOut,
  FacebookLogo,
  Palette,
  TextT,
  Crop,
  ThumbsUp,
  ChatCircle,
  ShareFat,
  Copy,
  TextAlignLeft,
  TextAlignCenter,
  TextAlignRight,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FACEBOOK_ASPECT_RATIOS,
  type FacebookAspectRatio,
  type PostTemplate,
  type TemplateTextElement,
  type TemplateFontFamily,
  type PageCache,
  facebookPostUrl,
} from "@/lib/types";
import { TEMPLATE_PRESETS, GRADIENT_PRESETS } from "@/lib/templates/presets";
import { cn } from "@/lib/cn";

export interface UploadedTemplateItem {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export const AVAILABLE_FONTS: {
  id: TemplateFontFamily;
  label: string;
  category: string;
  fontCss: string;
}[] = [
  { id: "Inter", label: "Inter", category: "Modern Clean Sans", fontCss: "'Inter', sans-serif" },
  { id: "Outfit", label: "Outfit", category: "Punchy Display", fontCss: "'Outfit', sans-serif" },
  { id: "Montserrat", label: "Montserrat", category: "Geometric Bold", fontCss: "'Montserrat', sans-serif" },
  { id: "Poppins", label: "Poppins", category: "Friendly Rounded", fontCss: "'Poppins', sans-serif" },
  { id: "Bebas Neue", label: "Bebas Neue", category: "Tall Bold Impact", fontCss: "'Bebas Neue', sans-serif" },
  { id: "Playfair Display", label: "Playfair Display", category: "Luxury Serif", fontCss: "'Playfair Display', serif" },
  { id: "Merriweather", label: "Merriweather", category: "Editorial Serif", fontCss: "'Merriweather', serif" },
  { id: "Roboto", label: "Roboto", category: "Digital Clean", fontCss: "'Roboto', sans-serif" },
  { id: "Impact", label: "Impact", category: "Bold Compact", fontCss: "Impact, sans-serif" },
];

export const FONT_SIZE_PRESETS = [
  { label: "Small", size: 24 },
  { label: "Medium", size: 36 },
  { label: "Large", size: 52 },
  { label: "Title", size: 68 },
  { label: "Huge", size: 92 },
];

export const COLOR_PALETTE = [
  { name: "White", value: "#ffffff" },
  { name: "Dark", value: "#0f172a" },
  { name: "Yellow", value: "#facc15" },
  { name: "Emerald", value: "#34d399" },
  { name: "Sky Blue", value: "#38bdf8" },
  { name: "Coral", value: "#f87171" },
  { name: "Purple", value: "#c084fc" },
  { name: "Amber", value: "#fb923c" },
];

export default function TemplatesPage() {
  // Current active template state
  const [selectedRatio, setSelectedRatio] = useState<FacebookAspectRatio>("1:1");
  const [templateName, setTemplateName] = useState("Custom Post Template");
  const [backgroundType, setBackgroundType] = useState<"gradient" | "image">("gradient");
  const [backgroundGradient, setBackgroundGradient] = useState(
    GRADIENT_PRESETS[0].value
  );
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [overlayOpacity, setOverlayOpacity] = useState(0.2);
  const [textElements, setTextElements] = useState<TemplateTextElement[]>(
    TEMPLATE_PRESETS[0].textElements
  );

  // Uploaded templates gallery state
  const [uploadedTemplates, setUploadedTemplates] = useState<UploadedTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [templateViewSection, setTemplateViewSection] = useState<"uploaded" | "presets">("uploaded");
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  // Brand Logo state
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoPosition, setLogoPosition] = useState<
    "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center"
  >("top-right");
  const [logoSize, setLogoSize] = useState<number>(120);
  const [logoOpacity, setLogoOpacity] = useState<number>(1.0);
  const [showLogoBackdrop, setShowLogoBackdrop] = useState<boolean>(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Studio tabs & UI state
  const [activeTab, setActiveTab] = useState<"templates" | "text" | "background" | "logo" | "saved">("templates");
  const [viewMode, setViewMode] = useState<"canvas" | "feed">("canvas");
  const [savedTemplates, setSavedTemplates] = useState<PostTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Notification state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Publish Drawer / Modal State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [pages, setPages] = useState<PageCache[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [postHashtags, setPostHashtags] = useState<string[]>(["facebookpost", "tips", "daily"]);
  const [newHashtag, setNewHashtag] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isPublishing, setIsPublishing] = useState<"now" | "schedule" | "draft" | null>(null);
  const [livePublishedUrl, setLivePublishedUrl] = useState<string | null>(null);
  const [generatingCaption, setGeneratingCaption] = useState(false);

  // Hidden / Interactive Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasDataUrl, setCanvasDataUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentRatioConfig = FACEBOOK_ASPECT_RATIOS[selectedRatio];

  // Load initial templates & pages
  useEffect(() => {
    loadTemplates();
    loadUploadedTemplates();
    try {
      const savedLogo = localStorage.getItem("facebook_bot_brand_logo");
      if (savedLogo) setLogoUrl(savedLogo);
    } catch {}

    fetch("/api/facebook/pages")
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages ?? []);
        if (d.defaultPageId) setSelectedPageId(d.defaultPageId);
      })
      .catch(() => {});
  }, []);

  function loadUploadedTemplates() {
    try {
      const stored = localStorage.getItem("facebook_bot_uploaded_templates");
      if (stored) {
        const parsed: UploadedTemplateItem[] = JSON.parse(stored);
        setUploadedTemplates(parsed);
        if (parsed.length > 0 && !backgroundUrl) {
          setSelectedTemplateId(parsed[0].id);
          setBackgroundUrl(parsed[0].url);
          setBackgroundType("image");
        }
      }
    } catch {}
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        const userSaved = (data.templates ?? []).filter(
          (t: PostTemplate) => !t.id.startsWith("preset-")
        );
        setSavedTemplates(userSaved);
      }
    } catch {
      // Fallback to local storage if API or DB unavailable
      try {
        const local = localStorage.getItem("facebook_bot_saved_templates");
        if (local) setSavedTemplates(JSON.parse(local));
      } catch {}
    } finally {
      setLoadingTemplates(false);
    }
  }

  // Draw on Canvas whenever configuration changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = currentRatioConfig.width;
    const height = currentRatioConfig.height;
    canvas.width = width;
    canvas.height = height;

    let isCancelled = false;

    async function render() {
      if (!ctx || !canvas) return;

      if (typeof document !== "undefined" && document.fonts) {
        try {
          await document.fonts.ready;
        } catch {}
      }
      if (isCancelled) return;

      // 1. Draw Background
      if (backgroundType === "image" && backgroundUrl) {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = backgroundUrl;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            // Draw image covering the canvas (cover fit)
            const hRatio = width / img.width;
            const vRatio = height / img.height;
            const ratio = Math.max(hRatio, vRatio);
            const centerShiftX = (width - img.width * ratio) / 2;
            const centerShiftY = (height - img.height * ratio) / 2;
            ctx.drawImage(
              img,
              0,
              0,
              img.width,
              img.height,
              centerShiftX,
              centerShiftY,
              img.width * ratio,
              img.height * ratio
            );
            resolve();
          };
          img.onerror = () => {
            // Fallback to solid background
            ctx.fillStyle = "#111827";
            ctx.fillRect(0, 0, width, height);
            resolve();
          };
        });
      } else {
        // Draw gradient
        drawGradient(ctx, width, height, backgroundGradient);
      }

      if (isCancelled) return;

      // 2. Draw Dark Overlay / Tint for contrast
      if (overlayOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayOpacity})`;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Draw Text Layers
      for (const el of textElements) {
        if (!el.text.trim()) continue;

        ctx.save();
        const y = (height * el.yOffset) / 100;
        const fontFam = el.fontFamily || "Inter";
        const isSerif = fontFam === "Playfair Display" || fontFam === "Merriweather";
        const weightValue =
          el.fontWeight === "bold"
            ? "700"
            : el.fontWeight === "800"
              ? "800"
              : el.fontWeight === "600"
                ? "600"
                : "400";
        ctx.font = `${weightValue} ${el.fontSize}px "${fontFam}", ${isSerif ? "serif" : "sans-serif"}`;
        ctx.textAlign = el.align;
        ctx.textBaseline = "middle";

        let x = width / 2;
        if (el.align === "left") x = 80;
        if (el.align === "right") x = width - 80;

        const maxTextWidth = width - 160;

        // Word wrap for long text
        const lines = wrapText(ctx, el.text, maxTextWidth);
        const lineHeight = el.fontSize * 1.25;
        const totalBlockHeight = lines.length * lineHeight;
        const startY = y - totalBlockHeight / 2 + lineHeight / 2;

        // Optional background pill behind text
        if (el.showBackgroundPill) {
          const paddingX = 24;
          const paddingY = 12;
          let blockMaxWidth = 0;
          for (const line of lines) {
            const metrics = ctx.measureText(line);
            if (metrics.width > blockMaxWidth) blockMaxWidth = metrics.width;
          }

          let pillX = x - paddingX;
          if (el.align === "center") pillX = x - blockMaxWidth / 2 - paddingX;
          if (el.align === "right") pillX = x - blockMaxWidth - paddingX;

          const pillY = startY - lineHeight / 2 - paddingY / 2;
          const pillW = blockMaxWidth + paddingX * 2;
          const pillH = totalBlockHeight + paddingY;

          ctx.fillStyle = el.pillColor || "rgba(0, 0, 0, 0.4)";
          drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 12);
          ctx.fill();
        }

        // Draw shadow for readability
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = el.color;
        lines.forEach((line, index) => {
          ctx.fillText(line, x, startY + index * lineHeight);
        });

        ctx.restore();
      }

      // 4. Draw Brand Logo (if uploaded)
      if (logoUrl) {
        const logoImg = new window.Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = logoUrl;
        await new Promise<void>((resolve) => {
          logoImg.onload = () => {
            ctx.save();
            ctx.globalAlpha = logoOpacity;

            const aspect = logoImg.width / logoImg.height;
            const logoW = logoSize;
            const logoH = logoSize / (aspect || 1);
            const margin = 60;

            let lx = margin;
            let ly = margin;

            if (logoPosition === "top-center") {
              lx = (width - logoW) / 2;
              ly = margin;
            } else if (logoPosition === "top-right") {
              lx = width - logoW - margin;
              ly = margin;
            } else if (logoPosition === "bottom-left") {
              lx = margin;
              ly = height - logoH - margin;
            } else if (logoPosition === "bottom-center") {
              lx = (width - logoW) / 2;
              ly = height - logoH - margin;
            } else if (logoPosition === "bottom-right") {
              lx = width - logoW - margin;
              ly = height - logoH - margin;
            }

            if (showLogoBackdrop) {
              const pad = 14;
              ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
              drawRoundedRect(ctx, lx - pad, ly - pad, logoW + pad * 2, logoH + pad * 2, 14);
              ctx.fill();
            }

            ctx.drawImage(logoImg, lx, ly, logoW, logoH);
            ctx.restore();
            resolve();
          };
          logoImg.onerror = () => resolve();
        });
      }

      try {
        setCanvasDataUrl(canvas.toDataURL("image/png"));
      } catch {}
    }

    render();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedRatio,
    currentRatioConfig,
    backgroundType,
    backgroundGradient,
    backgroundUrl,
    overlayOpacity,
    textElements,
    logoUrl,
    logoPosition,
    logoSize,
    logoOpacity,
    showLogoBackdrop,
  ]);

  // Helper to draw CSS-like gradient on canvas
  function drawGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    gradString: string
  ) {
    const isLinear = gradString.includes("linear-gradient");
    if (!isLinear) {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Default 135deg diagonal gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    if (gradString.includes("#1c1917")) {
      gradient.addColorStop(0, "#1c1917");
      gradient.addColorStop(0.5, "#291a0c");
      gradient.addColorStop(1, "#78350f");
    } else if (gradString.includes("#022c22")) {
      gradient.addColorStop(0, "#022c22");
      gradient.addColorStop(0.5, "#064e3b");
      gradient.addColorStop(1, "#047857");
    } else if (gradString.includes("#f43f5e") || gradString.includes("#4c0519")) {
      gradient.addColorStop(0, "#1e1b4b");
      gradient.addColorStop(0.5, "#311042");
      gradient.addColorStop(1, "#4c0519");
    } else if (gradString.includes("#0369a1")) {
      gradient.addColorStop(0, "#09090b");
      gradient.addColorStop(0.5, "#1e293b");
      gradient.addColorStop(1, "#0369a1");
    } else if (gradString.includes("#f8fafc")) {
      gradient.addColorStop(0, "#f8fafc");
      gradient.addColorStop(1, "#e2e8f0");
    } else if (gradString.includes("#2e1065")) {
      gradient.addColorStop(0, "#0f172a");
      gradient.addColorStop(0.5, "#1e1b4b");
      gradient.addColorStop(1, "#2e1065");
    } else {
      gradient.addColorStop(0, "#090d16");
      gradient.addColorStop(0.5, "#111a2e");
      gradient.addColorStop(1, "#062b24");
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Word wrap helper
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = words[0] || "";

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  // Rounded rectangle helper
  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Handle template image upload (supports multiple files and drag-drop)
  async function handleTemplateFiles(files: FileList | File[]) {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
      setError("Please select valid image files (JPG, PNG, WebP).");
      return;
    }

    setIsUploadingTemplate(true);
    setError(null);
    setSuccess(null);

    const newItems: UploadedTemplateItem[] = [];

    for (const file of validFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let finalUrl = dataUrl;
        try {
          const res = await fetch("/api/upload/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.url) finalUrl = data.url;
          }
        } catch {
          // Fallback to dataUrl
        }

        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        newItems.push({
          id: `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
          url: finalUrl,
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      } catch (err) {
        console.error("Failed to read image file:", err);
      }
    }

    if (newItems.length > 0) {
      setUploadedTemplates((prev) => {
        const updated = [...newItems, ...prev];
        try {
          localStorage.setItem("facebook_bot_uploaded_templates", JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // Automatically select the newest uploaded template
      const newest = newItems[0];
      setSelectedTemplateId(newest.id);
      setBackgroundUrl(newest.url);
      setBackgroundType("image");
      setSuccess(`Uploaded ${newItems.length} template image${newItems.length > 1 ? "s" : ""}! Selected "${newest.name}".`);
    }

    setIsUploadingTemplate(false);
  }

  function handleSelectTemplate(tpl: UploadedTemplateItem) {
    setSelectedTemplateId(tpl.id);
    setBackgroundUrl(tpl.url);
    setBackgroundType("image");
    setSuccess(`Selected template "${tpl.name}".`);
  }

  function handleDeleteUploadedTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setUploadedTemplates((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      try {
        localStorage.setItem("facebook_bot_uploaded_templates", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (selectedTemplateId === id) {
      setSelectedTemplateId(null);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleTemplateFiles(e.target.files);
    }
  }

  // Handle brand logo upload
  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG with transparency recommended).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setLogoUrl(url);
      try {
        localStorage.setItem("facebook_bot_brand_logo", url);
      } catch {}
      setSuccess("Brand logo uploaded and applied!");
    };
    reader.readAsDataURL(file);
  }

  // Load a preset template
  function applyTemplate(tpl: PostTemplate) {
    setSelectedRatio(tpl.ratio);
    setTemplateName(tpl.name);
    setBackgroundType(tpl.backgroundType === "image" ? "image" : "gradient");
    if (tpl.backgroundUrl) setBackgroundUrl(tpl.backgroundUrl);
    if (tpl.backgroundGradient) setBackgroundGradient(tpl.backgroundGradient);
    setOverlayOpacity(tpl.overlayOpacity);
    if (tpl.logoUrl !== undefined) setLogoUrl(tpl.logoUrl);
    if (tpl.logoPosition) setLogoPosition(tpl.logoPosition);
    if (tpl.logoSize) setLogoSize(tpl.logoSize);
    if (tpl.logoOpacity !== undefined) setLogoOpacity(tpl.logoOpacity);
    if (tpl.showLogoBackdrop !== undefined) setShowLogoBackdrop(tpl.showLogoBackdrop);
    setTextElements(tpl.textElements.map((el) => ({ ...el })));
    setSuccess(`Loaded "${tpl.name}" template.`);
  }

  // Update a text element property
  function updateTextElement(id: string, updates: Partial<TemplateTextElement>) {
    setTextElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
    );
  }

  // Delete a text element
  function removeTextElement(id: string) {
    setTextElements((prev) => prev.filter((el) => el.id !== id));
  }

  // Add a new text layer with type-specific defaults
  function addTextElement(type: "headline" | "subtext" | "badge" | "footer" | "custom" = "custom") {
    let defaults: Partial<TemplateTextElement> = {
      text: "New Text Layer",
      fontSize: 36,
      fontWeight: "600",
      fontFamily: "Inter",
      color: "#ffffff",
      align: "center",
      yOffset: 50,
      showBackgroundPill: false,
    };

    if (type === "headline") {
      defaults = {
        text: "Main Attention Headline",
        fontSize: 64,
        fontWeight: "800",
        fontFamily: "Outfit",
        color: "#ffffff",
        align: "center",
        yOffset: 28,
        showBackgroundPill: false,
      };
    } else if (type === "subtext") {
      defaults = {
        text: "Engaging subtext explaining key value and actionable insights.",
        fontSize: 32,
        fontWeight: "normal",
        fontFamily: "Inter",
        color: "#e2e8f0",
        align: "center",
        yOffset: 52,
        showBackgroundPill: false,
      };
    } else if (type === "badge") {
      defaults = {
        text: "DAILY TIPS • 2026",
        fontSize: 20,
        fontWeight: "bold",
        fontFamily: "Montserrat",
        color: "#facc15",
        align: "center",
        yOffset: 14,
        showBackgroundPill: true,
        pillColor: "rgba(0, 0, 0, 0.65)",
      };
    } else if (type === "footer") {
      defaults = {
        text: "@YourPageName • Follow for more daily tips",
        fontSize: 22,
        fontWeight: "600",
        fontFamily: "Inter",
        color: "#cbd5e1",
        align: "center",
        yOffset: 88,
        showBackgroundPill: false,
      };
    }

    const newEl: TemplateTextElement = {
      id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      ...defaults,
    } as TemplateTextElement;

    setTextElements((prev) => [...prev, newEl]);
    setSuccess(`Added ${type} text layer.`);
  }

  function duplicateTextElement(id: string) {
    const el = textElements.find((t) => t.id === id);
    if (!el) return;
    const duplicated: TemplateTextElement = {
      ...el,
      id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      yOffset: Math.min(92, el.yOffset + 6),
    };
    setTextElements((prev) => [...prev, duplicated]);
    setSuccess("Duplicated text layer.");
  }

  function moveTextElement(id: string, direction: "up" | "down") {
    const idx = textElements.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (direction === "up" && idx > 0) {
      const copy = [...textElements];
      const temp = copy[idx];
      copy[idx] = copy[idx - 1];
      copy[idx - 1] = temp;
      setTextElements(copy);
    } else if (direction === "down" && idx < textElements.length - 1) {
      const copy = [...textElements];
      const temp = copy[idx];
      copy[idx] = copy[idx + 1];
      copy[idx + 1] = temp;
      setTextElements(copy);
    }
  }

  // Save template to library
  async function handleSaveTemplate() {
    setError(null);
    setSuccess(null);
    const templateData: Omit<PostTemplate, "id"> = {
      name: templateName.trim() || "Untitled Template",
      ratio: selectedRatio,
      width: currentRatioConfig.width,
      height: currentRatioConfig.height,
      backgroundType,
      backgroundUrl: backgroundType === "image" ? backgroundUrl : undefined,
      backgroundGradient: backgroundType === "gradient" ? backgroundGradient : undefined,
      overlayOpacity,
      logoUrl: logoUrl || undefined,
      logoPosition,
      logoSize,
      logoOpacity,
      showLogoBackdrop,
      textElements,
      category: "My Templates",
    };

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateData),
      });

      if (!res.ok) throw new Error("Could not save to database");
      const data = await res.json();
      setSavedTemplates((prev) => [data.template, ...prev]);
      setSuccess("Template saved to your studio library!");
    } catch {
      // Local fallback
      const localTpl: PostTemplate = {
        ...templateData,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      const updated = [localTpl, ...savedTemplates];
      setSavedTemplates(updated);
      try {
        localStorage.setItem("facebook_bot_saved_templates", JSON.stringify(updated));
      } catch {}
      setSuccess("Template saved to browser storage!");
    }
  }

  // Download high-res PNG to device
  function handleDownload() {
    if (!canvasDataUrl) return;
    const a = document.createElement("a");
    a.href = canvasDataUrl;
    a.download = `${templateName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${selectedRatio}.png`;
    a.click();
    setSuccess("High-resolution PNG downloaded!");
  }

  // Open the Publish to Facebook modal
  function openPublishDrawer() {
    // Extract default post title from headline element
    const headline = textElements.find((el) => el.type === "headline")?.text || templateName;
    const subtext = textElements.find((el) => el.type === "subtext")?.text || "";

    setPostTitle(headline);
    setPostDescription(subtext || "Check out today's key insights and let us know your thoughts!");
    setLivePublishedUrl(null);
    setPublishModalOpen(true);
  }

  // AI Assistant: auto-generate caption for this template
  async function handleAIGenerateCaption() {
    if (!postTitle.trim()) return;
    setGeneratingCaption(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: postTitle }),
      });
      if (!res.ok) throw new Error("AI caption generation failed");
      const data = await res.json();
      if (data.title) setPostTitle(data.title);
      if (data.description) setPostDescription(data.description);
      if (data.hashtags?.length) setPostHashtags(data.hashtags);
      setSuccess("AI generated an engaging Facebook caption!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI caption.");
    } finally {
      setGeneratingCaption(false);
    }
  }

  // Execute Facebook publishing / scheduling / draft save
  async function handlePublishAction(action: "now" | "schedule" | "draft") {
    if (action !== "draft" && !selectedPageId) {
      setError("Please select a target Facebook Page.");
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      setError("Please pick a scheduled date and time.");
      return;
    }

    setIsPublishing(action);
    setError(null);

    try {
      // 1. Upload high-res canvas image to Supabase Storage
      const uploadRes = await fetch("/api/upload/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: canvasDataUrl }),
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => null);
        throw new Error(errData?.error || "Image upload failed.");
      }

      const { url: finalImageUrl } = await uploadRes.json();

      // 2. Submit post to /api/posts
      const targetPage = pages.find((p) => p.page_id === selectedPageId);
      const postRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: templateName,
          title: postTitle,
          description: postDescription,
          hashtags: postHashtags,
          imageUrl: finalImageUrl,
          imageSource: "ai",
          pageId: selectedPageId || "unset",
          pageName: targetPage?.name ?? "Facebook Page",
          action: action === "now" ? "post_now" : action === "schedule" ? "schedule" : "draft",
          scheduledAt: action === "schedule" ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });

      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error || "Failed to create post.");

      if (action === "now") {
        if (postData.post?.status === "failed") {
          throw new Error(postData.post?.error_message || "Facebook rejected the post.");
        }
        setSuccess("Successfully published to Facebook 🎉");
        if (postData.post?.facebook_post_id) {
          setLivePublishedUrl(facebookPostUrl(postData.post.facebook_post_id));
        }
      } else if (action === "schedule") {
        setSuccess("Post scheduled in queue successfully!");
        setPublishModalOpen(false);
      } else {
        setSuccess("Saved as draft post!");
        setPublishModalOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setIsPublishing(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header Card */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ImageSquare size={20} weight="fill" />
            </span>
            <h1 className="font-heading text-xl font-bold tracking-tight">
              Facebook Post Template Studio
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Create, upload, and customize graphics in verified Facebook aspect ratios ready for 1-click publishing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={!canvasDataUrl}
            className="gap-1.5 text-xs"
          >
            <DownloadSimple size={15} />
            Download PNG
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSaveTemplate}
            className="gap-1.5 text-xs"
          >
            <FloppyDisk size={15} />
            Save Template
          </Button>

          <Button
            onClick={openPublishDrawer}
            disabled={!canvasDataUrl}
            className="gap-1.5 text-xs shadow-md shadow-primary/20"
          >
            <Rocket size={15} weight="fill" />
            Publish to Facebook
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
          <WarningCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="shrink-0" />
            <span>{success}</span>
          </div>
          {livePublishedUrl && (
            <a
              href={livePublishedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              View on Facebook <ArrowSquareOut size={13} />
            </a>
          )}
        </div>
      )}

      {/* Aspect Ratio Selector Bar */}
      <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Facebook Ratio:
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {(Object.keys(FACEBOOK_ASPECT_RATIOS) as FacebookAspectRatio[]).map((r) => {
              const cfg = FACEBOOK_ASPECT_RATIOS[r];
              const isSelected = selectedRatio === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRatio(r)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-xs font-medium transition",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary shadow-xs"
                      : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Crop size={15} weight={isSelected ? "bold" : "regular"} />
                    <span>{cfg.label}</span>
                  </div>
                  <span className="text-[11px] opacity-75">{cfg.sublabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Main Studio Grid: Canvas Workspace (Left) & Controls (Right) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* LEFT: Live Preview & Canvas View */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {currentRatioConfig.label} ({currentRatioConfig.width} × {currentRatioConfig.height}px)
              </span>
              <Badge>{currentRatioConfig.description}</Badge>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("canvas")}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 font-medium transition",
                  viewMode === "canvas"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Canvas
              </button>
              <button
                type="button"
                onClick={() => setViewMode("feed")}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 font-medium transition",
                  viewMode === "feed"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Facebook Feed View
              </button>
            </div>
          </div>

          {/* Canvas Render Display */}
          <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-border bg-surface-2/40 p-6">
            {viewMode === "canvas" ? (
              <div
                className="relative overflow-hidden rounded-xl border border-border/80 bg-black shadow-2xl transition-all"
                style={{
                  aspectRatio:
                    selectedRatio === "1:1"
                      ? "1/1"
                      : selectedRatio === "4:5"
                        ? "4/5"
                        : selectedRatio === "1.91:1"
                          ? "1.91/1"
                          : "9/16",
                  maxHeight: "560px",
                  maxWidth: "100%",
                }}
              >
                {canvasDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={canvasDataUrl}
                    alt="Template Canvas"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center text-xs text-muted-foreground">
                    Rendering preview…
                  </div>
                )}
              </div>
            ) : (
              /* Facebook Feed Mockup View */
              <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-xl">
                {/* FB Post Header */}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-xs">
                    <FacebookLogo size={22} weight="fill" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold leading-tight">
                      {pages.find((p) => p.page_id === selectedPageId)?.name || "Your Facebook Page"}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">Just now • 🌐</p>
                  </div>
                </div>

                {/* FB Post Caption text */}
                <div className="mt-3 text-xs leading-relaxed text-foreground">
                  <p className="font-semibold">{textElements.find((e) => e.type === "headline")?.text}</p>
                  <p className="mt-1 text-muted-foreground">
                    {textElements.find((e) => e.type === "subtext")?.text}
                  </p>
                  <p className="mt-2 text-primary font-medium">#facebook #daily #growth</p>
                </div>

                {/* Composed Template Image in Feed */}
                <div
                  className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-black"
                  style={{
                    aspectRatio:
                      selectedRatio === "1:1"
                        ? "1/1"
                        : selectedRatio === "4:5"
                          ? "4/5"
                          : selectedRatio === "1.91:1"
                            ? "1.91/1"
                            : "9/16",
                  }}
                >
                  {canvasDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={canvasDataUrl}
                      alt="Post Feed Graphic"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                {/* FB Action bar */}
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <button className="flex items-center gap-1.5 hover:text-foreground">
                    <ThumbsUp size={15} /> Like
                  </button>
                  <button className="flex items-center gap-1.5 hover:text-foreground">
                    <ChatCircle size={15} /> Comment
                  </button>
                  <button className="flex items-center gap-1.5 hover:text-foreground">
                    <ShareFat size={15} /> Share
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Uploaded Template Chooser Strip */}
          {uploadedTemplates.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ImageSquare size={15} className="text-primary" />
                  Uploaded Templates Gallery ({uploadedTemplates.length})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Click any template to apply immediately
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 pt-0.5">
                {uploadedTemplates.map((tpl) => {
                  const isChosen = selectedTemplateId === tpl.id || backgroundUrl === tpl.url;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      className={cn(
                        "group relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 text-left transition",
                        isChosen
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/60"
                      )}
                      style={{ width: "100px", height: "72px" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tpl.url} alt={tpl.name} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1">
                        <p className="truncate text-[9px] font-medium text-white">{tpl.name}</p>
                      </div>
                      {isChosen && (
                        <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-white shadow-xs">
                          <CheckCircle size={12} weight="fill" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Inspector & Customization Controls */}
        <div className="space-y-4">
          <Card className="p-4">
            {/* Tab switchers */}
            <div className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface-2/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("templates")}
                className={cn(
                  "cursor-pointer rounded-lg py-1.5 font-medium transition",
                  activeTab === "templates"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Templates
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={cn(
                  "cursor-pointer rounded-lg py-1.5 font-medium transition",
                  activeTab === "text"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("background")}
                className={cn(
                  "cursor-pointer rounded-lg py-1.5 font-medium transition",
                  activeTab === "background"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Style
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("logo")}
                className={cn(
                  "cursor-pointer rounded-lg py-1.5 font-medium transition",
                  activeTab === "logo"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Logo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("saved")}
                className={cn(
                  "cursor-pointer rounded-lg py-1.5 font-medium transition",
                  activeTab === "saved"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Saved
              </button>
            </div>

            {/* TAB: TEMPLATES (UPLOAD & CHOOSE) */}
            {activeTab === "templates" && (
              <div className="mt-4 space-y-4">
                {/* Switcher between Uploaded & Presets */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTemplateViewSection("uploaded")}
                    className={cn(
                      "flex-1 cursor-pointer rounded-md py-1 font-medium transition text-center",
                      templateViewSection === "uploaded"
                        ? "bg-surface text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    My Uploaded ({uploadedTemplates.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateViewSection("presets")}
                    className={cn(
                      "flex-1 cursor-pointer rounded-md py-1 font-medium transition text-center",
                      templateViewSection === "presets"
                        ? "bg-surface text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Presets ({TEMPLATE_PRESETS.length})
                  </button>
                </div>

                {templateViewSection === "uploaded" ? (
                  <div className="space-y-4">
                    {/* Upload Box */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Upload Template Images
                        </label>
                        <span className="text-[10px] text-muted-foreground">PNG, JPG, WebP</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Upload background images for your posts. Select multiple at once.
                      </p>

                      <input
                        type="file"
                        ref={templateFileInputRef}
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) handleTemplateFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                          if (e.dataTransfer.files) handleTemplateFiles(e.dataTransfer.files);
                        }}
                        onClick={() => templateFileInputRef.current?.click()}
                        className={cn(
                          "mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition",
                          isDragOver
                            ? "border-primary bg-primary/10"
                            : "border-border bg-surface-2/40 hover:border-primary hover:bg-surface-2"
                        )}
                      >
                        {isUploadingTemplate ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <ArrowClockwise size={22} className="animate-spin text-primary" />
                            <span className="text-xs font-medium text-foreground">
                              Uploading &amp; processing templates…
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UploadSimple size={20} />
                            </div>
                            <span className="mt-2 text-xs font-semibold text-foreground">
                              Click to choose template images
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              or drag and drop them here (supports multiple)
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Gallery: Choose from uploaded templates */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Choose From Templates
                        </label>
                        {uploadedTemplates.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Click to select template
                          </span>
                        )}
                      </div>

                      {uploadedTemplates.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface-2/20 p-6 text-center">
                          <ImageSquare size={28} className="mx-auto text-muted-foreground/60" />
                          <p className="mt-2 text-xs font-medium text-foreground">No templates uploaded yet</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Upload your template graphics above to choose from them here.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
                          {uploadedTemplates.map((tpl) => {
                            const isChosen =
                              selectedTemplateId === tpl.id || backgroundUrl === tpl.url;
                            return (
                              <div
                                key={tpl.id}
                                onClick={() => handleSelectTemplate(tpl)}
                                className={cn(
                                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition",
                                  isChosen
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-xs"
                                    : "border-border bg-surface hover:border-primary/60 hover:bg-surface-2"
                                )}
                              >
                                {/* Thumbnail */}
                                <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={tpl.url}
                                    alt={tpl.name}
                                    className="h-full w-full object-cover transition group-hover:scale-105"
                                  />
                                  {isChosen && (
                                    <div className="absolute left-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-xs flex items-center gap-1">
                                      <CheckCircle size={10} weight="fill" /> Selected
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteUploadedTemplate(tpl.id, e)}
                                    title="Delete template"
                                    className="absolute right-1.5 top-1.5 rounded-md bg-black/70 p-1 text-white opacity-0 transition hover:bg-destructive group-hover:opacity-100"
                                  >
                                    <Trash size={12} />
                                  </button>
                                </div>

                                {/* Label & Action */}
                                <div className="p-2">
                                  <p className="truncate text-xs font-semibold text-foreground">
                                    {tpl.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{tpl.createdAt}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Designer Presets section */
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Click any layout to load its pre-configured typography, gradient &amp; structure.
                    </p>
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {TEMPLATE_PRESETS.map((tpl) => (
                        <div
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface p-3 transition hover:border-primary hover:bg-surface-2"
                        >
                          <div>
                            <h4 className="text-xs font-semibold">{tpl.name}</h4>
                            <p className="text-[11px] text-muted-foreground">{tpl.category}</p>
                          </div>
                          <Badge>{tpl.ratio}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: TEXT LAYERS & TYPOGRAPHY */}
            {activeTab === "text" && (
              <div className="mt-4 space-y-4">
                {/* Header & Quick Add buttons */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Text Layers ({textElements.length})
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      Customize fonts &amp; sizes
                    </span>
                  </div>

                  {/* Add Text Presets Row */}
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addTextElement("headline")}
                      className="h-7 text-[11px] gap-1 font-semibold"
                    >
                      <Plus size={12} /> + Headline
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addTextElement("subtext")}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Plus size={12} /> + Subtitle
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addTextElement("badge")}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Plus size={12} /> + Badge
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addTextElement("footer")}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Plus size={12} /> + CTA / Footer
                    </Button>
                  </div>
                </div>

                {/* Template Name input */}
                <div className="space-y-1 rounded-xl border border-border bg-surface-2/40 p-2.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Template Title
                  </label>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
                    placeholder="e.g. 5 Productivity Hacks"
                  />
                </div>

                {/* Empty State */}
                {textElements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface-2/20 p-6 text-center">
                    <TextT size={28} className="mx-auto text-muted-foreground/60" />
                    <p className="mt-2 text-xs font-medium text-foreground">No text layers yet</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Click any &quot;+ Add&quot; button above to place text on your template.
                    </p>
                  </div>
                ) : (
                  /* List of Individual Text Layers */
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {textElements.map((el, idx) => (
                      <div
                        key={el.id}
                        className="rounded-xl border border-border bg-surface-2/50 p-3 text-xs space-y-3 shadow-xs"
                      >
                        {/* Layer Top Bar */}
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-xs text-foreground">
                              {el.type === "headline"
                                ? "Headline"
                                : el.type === "badge"
                                  ? "Category Badge"
                                  : el.type === "subtext"
                                    ? "Subtitle"
                                    : el.type === "footer"
                                      ? "CTA / Footer"
                                      : `Text Layer #${idx + 1}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveTextElement(el.id, "up")}
                              disabled={idx === 0}
                              title="Move Layer Up"
                              className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <CaretUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTextElement(el.id, "down")}
                              disabled={idx === textElements.length - 1}
                              title="Move Layer Down"
                              className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <CaretDown size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateTextElement(el.id)}
                              title="Duplicate Layer"
                              className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTextElement(el.id)}
                              title="Delete Layer"
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Text Content Field */}
                        <textarea
                          value={el.text}
                          rows={el.type === "headline" ? 2 : 1}
                          onChange={(e) => updateTextElement(el.id, { text: e.target.value })}
                          placeholder="Type your text here..."
                          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium focus:border-primary focus:outline-none"
                        />

                        {/* FONT FAMILY & WEIGHT */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Font Style
                            </label>
                            <select
                              value={el.fontFamily}
                              onChange={(e) =>
                                updateTextElement(el.id, {
                                  fontFamily: e.target.value as TemplateFontFamily,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
                            >
                              {AVAILABLE_FONTS.map((f) => (
                                <option key={f.id} value={f.id} style={{ fontFamily: f.fontCss }}>
                                  {f.label} ({f.category})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Weight
                            </label>
                            <div className="mt-1 grid grid-cols-4 gap-1 text-[11px]">
                              {[
                                { id: "normal", label: "Reg" },
                                { id: "600", label: "Med" },
                                { id: "bold", label: "Bold" },
                                { id: "800", label: "Hvy" },
                              ].map((w) => (
                                <button
                                  key={w.id}
                                  type="button"
                                  onClick={() =>
                                    updateTextElement(el.id, {
                                      fontWeight: w.id as TemplateTextElement["fontWeight"],
                                    })
                                  }
                                  className={cn(
                                    "rounded-md border py-1 font-medium transition text-center",
                                    el.fontWeight === w.id
                                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  {w.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* FONT SIZE CONTROLS */}
                        <div className="space-y-1.5 rounded-lg border border-border/80 bg-surface/70 p-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Font Size
                            </span>
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <input
                                type="number"
                                min="12"
                                max="140"
                                value={el.fontSize}
                                onChange={(e) =>
                                  updateTextElement(el.id, {
                                    fontSize: Math.max(12, Math.min(140, Number(e.target.value) || 24)),
                                  })
                                }
                                className="w-12 rounded border border-border bg-surface px-1.5 py-0.5 text-right font-mono text-xs focus:border-primary focus:outline-none"
                              />
                              <span className="text-muted-foreground">px</span>
                            </div>
                          </div>

                          {/* Range Slider */}
                          <input
                            type="range"
                            min="14"
                            max="120"
                            value={el.fontSize}
                            onChange={(e) =>
                              updateTextElement(el.id, { fontSize: Number(e.target.value) })
                            }
                            className="w-full accent-primary"
                          />

                          {/* Quick Size Preset Chips */}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="text-[9px] text-muted-foreground">Presets:</span>
                            {FONT_SIZE_PRESETS.map((p) => (
                              <button
                                key={p.size}
                                type="button"
                                onClick={() => updateTextElement(el.id, { fontSize: p.size })}
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition",
                                  el.fontSize === p.size
                                    ? "bg-primary text-primary-foreground font-semibold"
                                    : "bg-surface-2 text-muted-foreground hover:bg-surface hover:text-foreground"
                                )}
                              >
                                {p.size}px
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ALIGNMENT & COLOR ROW */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* Alignment buttons */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Alignment
                            </label>
                            <div className="mt-1 flex items-center rounded-lg border border-border bg-surface p-0.5">
                              {[
                                { id: "left", label: "Left", icon: TextAlignLeft },
                                { id: "center", label: "Center", icon: TextAlignCenter },
                                { id: "right", label: "Right", icon: TextAlignRight },
                              ].map((al) => {
                                const Icon = al.icon;
                                return (
                                  <button
                                    key={al.id}
                                    type="button"
                                    onClick={() => updateTextElement(el.id, { align: al.id as TemplateTextElement["align"] })}
                                    className={cn(
                                      "flex flex-1 items-center justify-center rounded-md py-1 transition",
                                      el.align === al.id
                                        ? "bg-primary text-primary-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    title={al.label}
                                  >
                                    <Icon size={14} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Color Palette & Custom Picker */}
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Color
                              </label>
                              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                {el.color}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                type="color"
                                value={el.color.startsWith("#") ? el.color : "#ffffff"}
                                onChange={(e) => updateTextElement(el.id, { color: e.target.value })}
                                className="h-7 w-7 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                              />
                              <div className="flex flex-wrap gap-1">
                                {COLOR_PALETTE.slice(0, 5).map((c) => (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => updateTextElement(el.id, { color: c.value })}
                                    title={c.name}
                                    className={cn(
                                      "h-5 w-5 rounded-full border transition",
                                      el.color.toLowerCase() === c.value.toLowerCase()
                                        ? "ring-2 ring-primary ring-offset-1 border-white"
                                        : "border-black/20 hover:scale-110"
                                    )}
                                    style={{ backgroundColor: c.value }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* VERTICAL POSITION */}
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="text-[10px] font-semibold uppercase tracking-wider">
                              Vertical Placement
                            </span>
                            <span className="font-mono">{el.yOffset}%</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="95"
                            value={el.yOffset}
                            onChange={(e) =>
                              updateTextElement(el.id, { yOffset: Number(e.target.value) })
                            }
                            className="w-full accent-primary"
                          />
                        </div>

                        {/* CONTRAST PILL TOGGLE */}
                        <div className="rounded-lg border border-border/80 bg-surface/50 p-2 space-y-2">
                          <label className="flex cursor-pointer items-center justify-between text-xs font-medium">
                            <span className="text-[11px] text-foreground">
                              Contrast Background Pill
                            </span>
                            <input
                              type="checkbox"
                              checked={Boolean(el.showBackgroundPill)}
                              onChange={(e) =>
                                updateTextElement(el.id, { showBackgroundPill: e.target.checked })
                              }
                              className="h-3.5 w-3.5 accent-primary cursor-pointer"
                            />
                          </label>

                          {el.showBackgroundPill && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[10px] text-muted-foreground">Pill Color:</span>
                              <div className="flex items-center gap-1.5">
                                {[
                                  { label: "Dark", val: "rgba(0, 0, 0, 0.65)" },
                                  { label: "White", val: "rgba(255, 255, 255, 0.9)" },
                                  { label: "Primary", val: "rgba(44, 95, 212, 0.85)" },
                                  { label: "Emerald", val: "rgba(16, 185, 129, 0.85)" },
                                ].map((pill) => (
                                  <button
                                    key={pill.label}
                                    type="button"
                                    onClick={() => updateTextElement(el.id, { pillColor: pill.val })}
                                    className={cn(
                                      "rounded px-2 py-0.5 text-[10px] font-medium transition",
                                      el.pillColor === pill.val
                                        ? "bg-primary text-white"
                                        : "bg-surface-2 text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    {pill.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BACKGROUND & STYLING */}
            {activeTab === "background" && (
              <div className="mt-4 space-y-4">
                {/* Upload Image Section */}
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Upload Custom Template Graphic
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Upload an image or custom backdrop from your computer.
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/40 p-4 transition hover:border-primary hover:bg-surface-2"
                  >
                    <UploadSimple size={24} className="text-muted-foreground" />
                    <span className="mt-1 text-xs font-medium text-foreground">
                      Click to choose image or drag &amp; drop
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Supports JPG, PNG, WebP
                    </span>
                  </div>
                </div>

                {/* Dark Overlay Tint Slider */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Overlay Dimmer (Contrast)</span>
                    <span className="font-mono text-muted-foreground">
                      {Math.round(overlayOpacity * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dimmers increase text legibility against complex background photos.
                  </p>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Gradient Presets */}
                <div className="pt-2">
                  <label className="text-xs font-semibold text-foreground">
                    Curated Gradient Palettes
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {GRADIENT_PRESETS.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => {
                          setBackgroundType("gradient");
                          setBackgroundGradient(g.value);
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-left text-xs transition",
                          backgroundType === "gradient" && backgroundGradient === g.value
                            ? "border-primary ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/40"
                        )}
                      >
                        <span
                          className="h-6 w-6 shrink-0 rounded-lg border border-white/20 shadow-xs"
                          style={{ background: g.value }}
                        />
                        <span className="truncate text-[11px] font-medium">{g.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BRAND LOGO */}
            {activeTab === "logo" && (
              <div className="mt-4 space-y-4">
                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />

                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Upload Brand Logo
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Add your company or brand logo as a watermark on your post graphics.
                  </p>

                  {logoUrl ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface-2/40 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-black/40 p-1.5 shadow-inner">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoUrl}
                            alt="Brand Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold">Active Logo</h4>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Placed on canvas
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          className="h-7 text-[11px]"
                        >
                          Change
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setLogoUrl("");
                            try {
                              localStorage.removeItem("facebook_bot_brand_logo");
                            } catch {}
                            setSuccess("Logo removed.");
                          }}
                          className="h-7 px-2 text-[11px]"
                        >
                          <Trash size={13} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => logoInputRef.current?.click()}
                      className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/40 p-5 transition hover:border-primary hover:bg-surface-2"
                    >
                      <UploadSimple size={24} className="text-muted-foreground" />
                      <span className="mt-1 text-xs font-medium text-foreground">
                        Click to upload brand logo
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Recommended: PNG with transparent background
                      </span>
                    </div>
                  )}
                </div>

                {logoUrl && (
                  <div className="space-y-4 pt-2">
                    {/* Logo Position */}
                    <div>
                      <label className="text-xs font-semibold text-foreground">
                        Logo Position
                      </label>
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs">
                        {[
                          { id: "top-left", label: "Top Left" },
                          { id: "top-center", label: "Top Center" },
                          { id: "top-right", label: "Top Right" },
                          { id: "bottom-left", label: "Bottom Left" },
                          { id: "bottom-center", label: "Bottom Center" },
                          { id: "bottom-right", label: "Bottom Right" },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setLogoPosition(pos.id as typeof logoPosition)}
                            className={cn(
                              "cursor-pointer rounded-lg border py-2 text-center text-[11px] font-medium transition",
                              logoPosition === pos.id
                                ? "border-primary bg-primary/10 text-primary shadow-xs"
                                : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                            )}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Logo Size */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">Logo Size</span>
                        <span className="font-mono text-muted-foreground">{logoSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="260"
                        value={logoSize}
                        onChange={(e) => setLogoSize(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>

                    {/* Logo Opacity */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">Logo Opacity</span>
                        <span className="font-mono text-muted-foreground">
                          {Math.round(logoOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="1.0"
                        step="0.05"
                        value={logoOpacity}
                        onChange={(e) => setLogoOpacity(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>

                    {/* Contrast Backdrop Card */}
                    <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2/40 p-3">
                      <div>
                        <h4 className="text-xs font-semibold">Contrast Backdrop</h4>
                        <p className="text-[10px] text-muted-foreground">
                          Subtle dark card behind the logo for clarity on bright images.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={showLogoBackdrop}
                        onChange={(e) => setShowLogoBackdrop(e.target.checked)}
                        className="h-4 w-4 accent-primary cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* TAB 4: SAVED CUSTOM TEMPLATES */}
            {activeTab === "saved" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Your Saved Templates
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadTemplates}
                    disabled={loadingTemplates}
                    className="h-7 gap-1 text-[11px]"
                  >
                    <ArrowClockwise size={13} className={loadingTemplates ? "animate-spin" : ""} />
                    Refresh
                  </Button>
                </div>

                {savedTemplates.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No custom templates saved yet. Click &quot;Save Template&quot; on top to store your custom designs.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 transition hover:border-primary"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => applyTemplate(tpl)}
                        >
                          <h4 className="text-xs font-semibold">{tpl.name}</h4>
                          <p className="text-[10px] text-muted-foreground">Ratio: {tpl.ratio}</p>
                        </div>
                        <Badge>{tpl.ratio}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* PUBLISH TO FACEBOOK MODAL / DRAWER */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FacebookLogo size={24} weight="fill" className="text-blue-600" />
                <h3 className="font-heading text-lg font-bold">Publish Template to Facebook</h3>
              </div>
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Target Page selection */}
            <div>
              <label className="text-xs font-semibold text-foreground">Select Target Page</label>
              <select
                value={selectedPageId}
                onChange={(e) => setSelectedPageId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs focus:border-primary focus:outline-none"
              >
                <option value="">Select a connected Page…</option>
                {pages.map((p) => (
                  <option key={p.page_id} value={p.page_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Post Title & Description */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Post Headline / Hook</label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAIGenerateCaption}
                    disabled={generatingCaption}
                    className="h-6 gap-1 text-[11px]"
                  >
                    <Sparkle size={12} weight="fill" />
                    {generatingCaption ? "Writing..." : "AI Generate Copy"}
                  </Button>
                </div>
                <input
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium focus:border-primary focus:outline-none"
                  placeholder="Enter hook for Facebook caption..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Post Caption &amp; Description</label>
                <textarea
                  rows={3}
                  value={postDescription}
                  onChange={(e) => setPostDescription(e.target.value)}
                  className="mt-1 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-relaxed focus:border-primary focus:outline-none"
                  placeholder="Tell your audience what this post is about..."
                />
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-xs font-semibold text-foreground">Hashtags</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {postHashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() =>
                          setPostHashtags(postHashtags.filter((t) => t !== tag))
                        }
                        className="cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <input
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newHashtag.trim()) {
                        e.preventDefault();
                        const tag = newHashtag.trim().replace(/^#/, "");
                        if (!postHashtags.includes(tag)) {
                          setPostHashtags([...postHashtags, tag]);
                        }
                        setNewHashtag("");
                      }
                    }}
                    placeholder="add tag + enter..."
                    className="w-28 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Schedule Option */}
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <label className="text-[11px] font-semibold text-foreground">
                Optional: Schedule for Future
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePublishAction("draft")}
                disabled={isPublishing !== null}
              >
                Save Draft
              </Button>

              {scheduledAt ? (
                <Button
                  size="sm"
                  onClick={() => handlePublishAction("schedule")}
                  disabled={isPublishing !== null}
                >
                  {isPublishing === "schedule" ? "Scheduling…" : "Confirm Schedule"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handlePublishAction("now")}
                  disabled={isPublishing !== null}
                  className="gap-1.5"
                >
                  <Rocket size={15} weight="fill" />
                  {isPublishing === "now" ? "Publishing to Facebook…" : "Publish Now to Facebook"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
