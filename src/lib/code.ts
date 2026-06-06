export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/[1L]/g, "I")
    .trim()
    .slice(0, 4);
}

export function pickRandomCode(codes: string[]): string {
  if (codes.length === 0) throw new Error("No endings registered");
  return codes[Math.floor(Math.random() * codes.length)];
}
