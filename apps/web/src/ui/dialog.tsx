import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./primitives";

// A modal built on Radix Dialog: focus trap, Escape/outside-click to close, scroll lock, focus return
// to the opener, and aria wiring all come from Radix. This file only adds the look.
export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;

export function DialogContent({
  title,
  description,
  children,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40 dark:bg-black/65" />
      <Dialog.Content
        // Without a description, tell Radix so explicitly (it warns otherwise).
        {...(description ? {} : { "aria-describedby": undefined })}
        className={`dialog-content fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-2xl focus-visible:outline-none ${className}`}
      >
        <div className="mb-5 pr-8">
          <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
          {description && <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>}
        </div>
        {children}
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-3.5 right-3.5 size-8">
            <X size={16} />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
