import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium font-mono uppercase tracking-wider transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/30 bg-destructive/15 text-destructive",
        outline:
          "border-border text-foreground",
        success:
          "border-[#34D399]/30 bg-[#34D399]/15 text-[#34D399]",
        warning:
          "border-[#FBBF24]/30 bg-[#FBBF24]/15 text-[#FBBF24]",
        info:
          "border-[#60A5FA]/30 bg-[#60A5FA]/15 text-[#60A5FA]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

