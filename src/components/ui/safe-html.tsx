"use client";

import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

interface SafeHtmlProps {
  html: string;
  className?: string;
}

/**
 * SafeHtml Component
 *
 * Renders HTML content safely by sanitizing it with DOMPurify.
 * This prevents XSS attacks while allowing rich text content to be displayed.
 *
 * Uses Tailwind Typography (prose) classes for consistent styling.
 */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  // Configure DOMPurify to allow safe HTML elements
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "a", "img",
      "hr", "span", "div",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "class",
      "width", "height", "style",
    ],
    // Force all links to open in new tab with security attributes
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  // Add security attributes to all links
  const secureHtml = cleanHtml.replace(
    /<a\s+/g,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  return (
    <div
      className={cn(
        "prose prose-sm sm:prose-base max-w-none",
        "prose-headings:font-semibold",
        "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
        "prose-p:my-2",
        "prose-ul:my-2 prose-ol:my-2",
        "prose-li:my-0",
        "prose-a:text-primary prose-a:underline hover:prose-a:text-primary/80",
        "prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic",
        "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-md",
        "prose-img:rounded-md prose-img:max-w-full",
        className
      )}
      dangerouslySetInnerHTML={{ __html: secureHtml }}
      role="article"
    />
  );
}

export default SafeHtml;
