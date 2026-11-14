"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldContext } from "./field";

export interface PasswordInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
  isInvalid?: boolean;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, wrapperClassName, id, isInvalid: propInvalid, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const context = useFieldContext();
    const isInvalid =
      propInvalid ??
      (props["aria-invalid"] === true ||
        props["aria-invalid"] === "true" ||
        Boolean(context?.isInvalid));

    const inputId = id || context?.id;
    const describedBy =
      props["aria-describedby"] ||
      (context?.isInvalid ? context.errorId : context?.descriptionId);

    return (
      <div className={cn("relative flex items-center w-full", wrapperClassName)}>
        <input
          type={showPassword ? "text" : "password"}
          id={inputId}
          aria-invalid={isInvalid ? "true" : undefined}
          aria-describedby={describedBy}
          className={cn(
            "flex h-8 w-full rounded-md border border-border bg-input px-2.5 pr-8 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
            isInvalid &&
              "border-destructive/80 text-foreground focus-visible:border-destructive focus-visible:ring-destructive/30",
            className
          )}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none p-1 focus:outline-none"
          title={showPassword ? "Hide password" : "Show password"}
          aria-label={showPassword ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
