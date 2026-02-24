import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}
/**
 * Format date in Australian format (DD/MM/YYYY)
 */
export function formatAusDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = date instanceof Date ? date : new Date(date)
    const day = d.getDate().toString().padStart(2, '0')
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return String(date)
  }
}

/**
 * Format date with time (DD/MM/YYYY HH:MM)
 */
export function formatAusDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = date instanceof Date ? date : new Date(date)
    const day = d.getDate().toString().padStart(2, '0')
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const year = d.getFullYear()
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${mins}`
  } catch {
    return String(date)
  }
}