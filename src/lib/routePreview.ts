export function routePreviewIsFresh(
  expiresAt: string,
  nowMilliseconds = Date.now()
): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && nowMilliseconds < expiry;
}

export function formatPreviewDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} sec`;
  return `about ${Math.ceil(seconds / 60)} min`;
}
