export const ALLOWED_NAMES = ["mira", "alp"];

export function isValidName(input: string): boolean {
  return ALLOWED_NAMES.includes(input.trim().toLowerCase());
}
