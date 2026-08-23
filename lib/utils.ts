import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number, options?: { compact?: boolean; signed?: boolean }) {
  const sign = options?.signed && cents > 0 ? '+' : '';
  const value = cents / 100;
  return `${sign}${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: options?.compact ? 0 : 2,
    minimumFractionDigits: options?.compact ? 0 : 2,
    notation: options?.compact && Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)}`;
}

export function formatPercent(partsPerMillion: number) {
  return `${(partsPerMillion / 10_000).toFixed(partsPerMillion % 10_000 === 0 ? 0 : 1)}%`;
}

export function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function safeJson<T>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' ? (value as T) : fallback;
}
