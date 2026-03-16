import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format bigint with decimals to readable string (max 4 decimals, no long trailing zeros). */
export function formatToken(amount: bigint, decimals: number): string {
  const s = formatUnits(amount, decimals);
  const n = parseFloat(s);
  if (n === 0) return "0";
  if (n >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 0 });
  const fixed = n.toFixed(8).replace(/\.?0+$/, "");
  return parseFloat(fixed).toString();
}

/** Compact form for large numbers: 1.23M, 4.56K, 0.001 */
export function formatCompact(amount: bigint, decimals: number): string {
  const n = Number(formatUnits(amount, decimals));
  if (n === 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
