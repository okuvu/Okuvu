export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `\u2022\u2022\u2022 \u2022\u2022\u2022 ${digits.slice(-4)}`;
}
