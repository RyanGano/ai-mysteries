// Share a link/text via the native share sheet when available, falling back to the clipboard.
// Returns a short status note to show the user when there's no native share sheet (so callers can
// surface "Link copied to clipboard"); returns "" when the native sheet handled it, since the OS
// gives its own feedback. On clipboard failure it returns the raw value so the user can copy it
// manually.
export async function shareOrCopy(data: {
  title: string;
  text?: string;
  url?: string;
}): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share(data);
    } catch {
      // Share sheet dismissed — nothing to do.
    }
    return "";
  }
  const toCopy = data.url ?? data.text ?? "";
  try {
    await navigator.clipboard.writeText(toCopy);
    return data.url ? "Link copied to clipboard" : "Copied to clipboard";
  } catch {
    return toCopy;
  }
}
