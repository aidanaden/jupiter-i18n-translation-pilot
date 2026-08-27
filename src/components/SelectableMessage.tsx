import type { ReactNode } from "react";

import type { SandboxMessageId } from "../message-metadata";

import { cn } from "./ui";

type SelectableMessageProps = {
  children: ReactNode;
  className?: string;
  messageId: SandboxMessageId;
  onSelect: (messageId: SandboxMessageId) => void;
  selected: boolean;
  translationMode: boolean;
};

export const SelectableMessage: React.FC<SelectableMessageProps> = ({
  children,
  className,
  messageId,
  onSelect,
  selected,
  translationMode,
}) => {
  if (!translationMode) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "hover:bg-primary/5 rounded-sm text-left outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-primary",
        selected && "bg-primary/5 ring-primary/60 ring-1",
        className,
      )}
      onClick={() => onSelect(messageId)}
      type="button"
    >
      {children}
    </button>
  );
};
