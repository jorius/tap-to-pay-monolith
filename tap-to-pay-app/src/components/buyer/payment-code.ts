// The code of a payment link out of whatever the buyer has: the shared web link (…/p/<code>, also the QR's content),
// the app link (<scheme>://pay/<code>) or the bare code.
export function paymentCode(text: string): string | null {
  const trimmed = text.trim();
  const inLink = trimmed.match(/\/(?:p|pay)\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/);
  if (inLink) return inLink[1];
  return /^[A-Za-z0-9_-]{6,64}$/.test(trimmed) ? trimmed : null;
}
