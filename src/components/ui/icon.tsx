'use client';

import { Icon as IconifyIcon, addCollection, IconProps as IconifyIconProps } from '@iconify/react';
import ciData from '@iconify-json/ci/icons.json';
import { cn } from '@/lib/utils';

// Register all coolicons locally so no external API calls are made
try {
  addCollection(ciData as any);
} catch {
  // collection already registered
}

export interface IconProps extends Omit<IconifyIconProps, 'icon'> {
  name: string;
  className?: string;
  /**
   * Convenience alias for `width` + `height`, matching the `size` prop
   * lucide-react exposes. Call sites migrated from lucide pass `size={14}`
   * by habit; without this they would silently fail typecheck (Iconify
   * takes width/height separately) and need rewriting one by one.
   * An explicit `width`/`height` still wins.
   */
  size?: number | string;
}

/**
 * Coolicons Icon Component
 * Renders icons from the Figma coolicons icon set (715+ icons).
 * Usage: `<Icon name="star" className="w-4 h-4 text-amber-400" />`
 */
export function Icon({ name, className, size, width, height, ...props }: IconProps) {
  const iconName = name.startsWith('ci:') ? name : `ci:${name}`;
  return (
    <IconifyIcon
      icon={iconName}
      className={cn('inline-block shrink-0', className)}
      width={width ?? size}
      height={height ?? size}
      {...props}
    />
  );
}

export default Icon;
