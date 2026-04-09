/**
 * Data export utilities — CSV and JSON export for clinical data.
 * Addresses analysis item 7.5 (no export beyond JSON).
 */

import { downloadBlob } from "./browser-file";

/**
 * Convert an array of objects to a CSV string.
 */
export function objectsToCsv<T extends Record<string, unknown>>(data: T[], columns?: string[]): string {
  if (data.length === 0) return "";

  const keys = columns ?? Object.keys(data[0]);
  const header = keys.join(",");

  const rows = data.map((item) =>
    keys
      .map((key) => {
        const value = item[key];
        if (value === null || value === undefined) return "";
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma/newline/quote
        if (str.includes(",") || str.includes("\n") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [header, ...rows].join("\n");
}

/**
 * Download data as a CSV file.
 */
export function downloadCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: string[]
): void {
  const csv = objectsToCsv(data, columns);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/**
 * Download data as a JSON file.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}
