export function envInt(key: string, def: number): number {
  const val = process.env[key];
  if (val === undefined) return def;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? def : parsed;
}

export function envWindow(key: string, def: number): number {
  return envInt(key, def) * 1000;
}
