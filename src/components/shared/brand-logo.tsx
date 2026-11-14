import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}

export function BrandLogo({
  width = 32,
  height = 32,
  className,
  priority = false,
  alt = "CHRONOS Logo",
}: BrandLogoProps) {
  return (
    <>
      {/* Dark mode logo */}
      <Image
        src="/logo.png"
        alt={alt}
        width={width}
        height={height}
        className={cn("chronos-logo-dark object-contain", className)}
        priority={priority}
      />
      {/* Light mode logo */}
      <Image
        src="/light-logo.png"
        alt={alt}
        width={width}
        height={height}
        className={cn("chronos-logo-light object-contain", className)}
        priority={priority}
      />
    </>
  );
}
