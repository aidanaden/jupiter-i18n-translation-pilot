import { clsx, type ClassValue } from "clsx";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "md" | "sm";
  variant?: "default" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "md", variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center text-sm font-medium transition enabled:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 rounded-md px-3" : "h-9 rounded-lg px-4 py-2",
        variant === "secondary"
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-primary text-primary-foreground hover:opacity-90",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "size"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "md" | "sm";
};

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, className, onCheckedChange, size = "md", ...props }, ref) => (
    <button
      ref={ref}
      aria-checked={checked}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "border-primary/10 bg-primary/10" : "border-border-strong bg-background",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block rounded-full transition-transform",
          checked ? "translate-x-[105%] bg-primary" : "translate-x-0.5 bg-neutral-500",
          size === "sm" ? "size-3" : "size-4",
        )}
      />
    </button>
  ),
);
Switch.displayName = "Switch";
