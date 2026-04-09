export function extractUrls(text: string): string[] {
  const withProtocol = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const withoutProtocol = /(?<![./\w])(?:www\.)?[\w-]+\.(?:com|org|net|io|dev|app|co|ai|me|tv|gg|xyz|info|edu|gov)\b(?:\/[^\s<>"{}|\\^`[\]]*)?/g;

  const results = new Set<string>();

  for (const url of text.match(withProtocol) ?? []) {
    results.add(url);
  }

  for (const raw of text.match(withoutProtocol) ?? []) {
    const normalized = `https://${raw}`;
    if (!text.includes(`://${raw}`)) {
      results.add(normalized);
    }
  }

  return [...results];
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
