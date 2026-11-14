"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export interface FieldContextValue {
  id: string;
  name?: string;
  error?: string;
  isInvalid: boolean;
  descriptionId: string;
  errorId: string;
}

export const FieldContext = React.createContext<FieldContextValue | null>(null);

export function useFieldContext() {
  return React.useContext(FieldContext);
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  error?: string;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, id: propId, name, error, children, ...props }, ref) => {
    const generatedId = React.useId();
    const id = propId || name || generatedId;
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    const isInvalid = Boolean(error);

    return (
      <FieldContext.Provider
        value={{
          id,
          name,
          error,
          isInvalid,
          descriptionId,
          errorId,
        }}
      >
        <div
          ref={ref}
          data-invalid={isInvalid ? "true" : undefined}
          className={cn("space-y-1.5", className)}
          {...props}
        >
          {children}
        </div>
      </FieldContext.Provider>
    );
  }
);
Field.displayName = "Field";

export interface FieldLabelProps
  extends React.ComponentPropsWithoutRef<typeof Label> {}

export const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  FieldLabelProps
>(({ className, htmlFor, ...props }, ref) => {
  const context = useFieldContext();
  const targetId = htmlFor || context?.id;

  return (
    <Label
      ref={ref}
      htmlFor={targetId}
      className={cn(
        context?.isInvalid && "text-destructive",
        className
      )}
      {...props}
    />
  );
});
FieldLabel.displayName = "FieldLabel";

export interface FieldDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  FieldDescriptionProps
>(({ className, id: propId, ...props }, ref) => {
  const context = useFieldContext();
  const id = propId || context?.descriptionId;

  return (
    <p
      ref={ref}
      id={id}
      className={cn("text-[11px] text-muted-foreground", className)}
      {...props}
    />
  );
});
FieldDescription.displayName = "FieldDescription";

export interface FieldErrorProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: string;
}

export const FieldError = React.forwardRef<
  HTMLParagraphElement,
  FieldErrorProps
>(({ className, children, error: propError, id: propId, ...props }, ref) => {
  const context = useFieldContext();
  const id = propId || context?.errorId;
  const message = propError || context?.error || (typeof children === "string" ? children : null);

  if (!message && !children) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={id}
      role="alert"
      aria-live="polite"
      className={cn(
        "text-[11px] font-medium text-destructive animate-in fade-in-0 duration-150",
        className
      )}
      {...props}
    >
      {message || children}
    </p>
  );
});
FieldError.displayName = "FieldError";

