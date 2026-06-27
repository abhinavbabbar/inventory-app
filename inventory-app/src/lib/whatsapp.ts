// Build a wa.me deep link. WhatsApp can't take a file via URL, so the message
// is text — the operator can attach the downloaded PDF in the chat if needed.
export function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null; // not a usable number
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
