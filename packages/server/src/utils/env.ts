export function envInt(key: string, def: number): number {
  const val = process.env[key];
  if (val === undefined) return def;
  const parsed = Number(val);
  if (!Number.isInteger(parsed) || parsed <= 0) return def;
  return parsed;
}

export function envWindow(key: string, def: number): number {
  return envInt(key, def) * 1000;
}

export function envCsv(key: string, def: string[] = []): string[] {
  const val = process.env[key];
  if (!val) return def;
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
