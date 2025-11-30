import Decimal from "decimal.js";
import { UserXpTotal } from "../types/supabase";

export function sanitizeHandle(raw: string): string | undefined {
  const trimmed = raw.trim();
  const withoutWrappers = trimmed.replace(/^[[(<{]+/, "").replace(/[\])}>]+$/, "");
  const normalized = withoutWrappers.replace(/^@+/, "");
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

export function formatHandle(login: string): string {
  const normalized = login.startsWith("@") ? login.slice(1) : login;
  return `@${normalized}`;
}

export function shouldReturnNoData(total: UserXpTotal): boolean {
  return total.permitCount === 0 || !Number.isFinite(total.total);
}

export function formatXp(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "0";
  }
  const decimal = new Decimal(amount);
  const places = decimal.decimalPlaces();
  if (places <= 2) {
    return decimal.toFixed(places);
  }
  if (decimal.abs().lessThan(1)) {
    const precision = Math.min(places, 6);
    return decimal.toFixed(precision);
  }
  return decimal.toFixed(2);
}
