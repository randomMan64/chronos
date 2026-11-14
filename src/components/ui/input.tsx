"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldContext } from "./field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, isInvalid: propInvalid, ...props }, ref) => {
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
      <input
        type={type}
        id={inputId}
        aria-invalid={isInvalid ? "true" : undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex h-8 w-full rounded-md border border-border bg-input px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
          isInvalid &&
            "border-destructive/80 text-foreground focus-visible:border-destructive focus-visible:ring-destructive/30",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
