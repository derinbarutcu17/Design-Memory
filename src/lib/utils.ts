import { createHash, randomUUID } from "node:crypto";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function toKebabCase(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function toPascalCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function toCamelCase(value: string) {
  const pascal = toPascalCase(value);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : "";
}

export function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

export function generateNameCandidates(value: string) {
  const kebab = toKebabCase(value);
  const pascal = toPascalCase(value);
  const camel = toCamelCase(value);
  const slashParts = value.split("/").map((part) => part.trim()).filter(Boolean);
  const base = slashParts[0] ?? value.trim();

  return uniqueStrings([
    value,
    value.trim(),
    base,
    base.replace(/,/g, " "),
    kebab,
    kebab.replace(/-/g, " "),
    kebab.replace(/-/g, "_"),
    pascal,
    camel,
    toPascalCase(base),
    toCamelCase(base),
  ]);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function makeId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function hashParts(parts: string[]) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
