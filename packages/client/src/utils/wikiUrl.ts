export function getWikiBaseUrl(apiUrl: string): string | null {
  try {
    const url = new URL(apiUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function getWikiBaseUrlOrFallback(apiUrl: string): string {
  return getWikiBaseUrl(apiUrl) ?? apiUrl.replace(/\/api\.php$/, '');
}
