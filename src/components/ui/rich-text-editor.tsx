"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Quote,
  Code,
  Undo,
  Redo,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// URL validation schema — accepts URLs with or without a leading http(s):// prefix
// and rejects dangerous protocols (javascript:, data:, etc.). The consumer normalizes
// a bare hostname by prepending https://.
const urlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((raw) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      // Has explicit protocol — allow only http(s)
      return /^https?:\/\//i.test(raw);
    }
    // No protocol — accept, will be prefixed with https://
    return true;
  })
  .transform((raw) =>
    /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  );

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  icon,
  label,
  shortcut,
}: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "h-8 w-8 p-0",
              isActive && "bg-muted text-primary"
            )}
            aria-label={label}
            aria-pressed={isActive}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {label}
            {shortcut && (
              <span className="ml-2 text-muted-foreground text-xs">
                {shortcut}
              </span>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-border mx-1" aria-hidden="true" />;
}

interface UrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  urlLabel: string;
  urlPlaceholder: string;
  initialValue?: string;
  onSubmit: (url: string) => void;
}

function UrlDialog({
  open,
  onOpenChange,
  title,
  description,
  urlLabel,
  urlPlaceholder,
  initialValue = "",
  onSubmit,
}: UrlDialogProps) {
  const t = useTranslations("common.richTextEditor");
  const [url, setUrl] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setUrl(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  const handleSubmit = () => {
    const parsed = urlSchema.safeParse(url);
    if (!parsed.success) {
      setError(t("urlInvalid"));
      return;
    }
    onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rte-url-input">{urlLabel}</Label>
          <Input
            id="rte-url-input"
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            placeholder={urlPlaceholder}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "rte-url-error" : undefined}
          />
          {error && (
            <p id="rte-url-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditorToolbarProps {
  editor: Editor | null;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  const t = useTranslations("common.richTextEditor");
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState("");

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href ?? "";
    setLinkInitial(previousUrl);
    setLinkOpen(true);
  }, [editor]);

  const handleLinkSubmit = useCallback(
    (finalUrl: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: finalUrl })
        .run();
    },
    [editor]
  );

  const handleImageSubmit = useCallback(
    (finalUrl: string) => {
      if (!editor) return;
      editor.chain().focus().setImage({ src: finalUrl }).run();
    },
    [editor]
  );

  if (!editor) {
    return null;
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-0.5 border-b p-2 bg-muted/30"
        role="toolbar"
        aria-label={t("toolbarLabel")}
      >
        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          icon={<Undo className="h-4 w-4" />}
          label={t("undo")}
          shortcut="Ctrl+Z"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          icon={<Redo className="h-4 w-4" />}
          label={t("redo")}
          shortcut="Ctrl+Y"
        />

        <ToolbarDivider />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          icon={<Bold className="h-4 w-4" />}
          label={t("bold")}
          shortcut="Ctrl+B"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          icon={<Italic className="h-4 w-4" />}
          label={t("italic")}
          shortcut="Ctrl+I"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          icon={<UnderlineIcon className="h-4 w-4" />}
          label={t("underline")}
          shortcut="Ctrl+U"
        />

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          icon={<Heading1 className="h-4 w-4" />}
          label={t("heading1")}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          icon={<Heading2 className="h-4 w-4" />}
          label={t("heading2")}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          icon={<Heading3 className="h-4 w-4" />}
          label={t("heading3")}
        />

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          icon={<List className="h-4 w-4" />}
          label={t("bulletList")}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          icon={<ListOrdered className="h-4 w-4" />}
          label={t("orderedList")}
        />

        <ToolbarDivider />

        {/* Block elements */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          icon={<Quote className="h-4 w-4" />}
          label={t("blockquote")}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          icon={<Code className="h-4 w-4" />}
          label={t("codeBlock")}
        />

        <ToolbarDivider />

        {/* Links & Images */}
        <ToolbarButton
          onClick={openLinkDialog}
          isActive={editor.isActive("link")}
          icon={<LinkIcon className="h-4 w-4" />}
          label={t("insertLink")}
        />
        {editor.isActive("link") && (
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetLink().run()}
            icon={<Unlink className="h-4 w-4" />}
            label={t("removeLink")}
          />
        )}
        <ToolbarButton
          onClick={() => setImageOpen(true)}
          icon={<ImageIcon className="h-4 w-4" />}
          label={t("insertImage")}
        />
      </div>

      <UrlDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={t("linkDialogTitle")}
        description={t("linkDialogDescription")}
        urlLabel={t("linkUrlLabel")}
        urlPlaceholder={t("linkUrlPlaceholder")}
        initialValue={linkInitial}
        onSubmit={handleLinkSubmit}
      />
      <UrlDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        title={t("imageDialogTitle")}
        description={t("imageDialogDescription")}
        urlLabel={t("imageUrlLabel")}
        urlPlaceholder={t("imageUrlPlaceholder")}
        onSubmit={handleImageSubmit}
      />
    </>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: RichTextEditorProps) {
  const t = useTranslations("common.richTextEditor");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? t("placeholder"),
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none",
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm sm:prose-base max-w-none",
          "min-h-[200px] p-4 focus:outline-none",
          "prose-headings:font-semibold",
          "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
          "prose-p:my-2",
          "prose-ul:my-2 prose-ol:my-2",
          "prose-li:my-0",
          "prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic",
          "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
          "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-md"
        ),
        "aria-label": t("editorLabel"),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "rounded-md border bg-background",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextEditor;
