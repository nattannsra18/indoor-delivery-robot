import type { PasswordPolicy } from "@/types";

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minimumLength: 8,
  requireLetter: true,
  requireNumber: true,
};

export function passwordPolicyError(
  password: string,
  policy: PasswordPolicy,
  messages: { length: string; letter: string; number: string },
): string | undefined {
  if (password.length < policy.minimumLength) {
    return messages.length.replace("{count}", String(policy.minimumLength));
  }
  if (policy.requireLetter && !/\p{L}/u.test(password)) return messages.letter;
  if (policy.requireNumber && !/\d/.test(password)) return messages.number;
  return undefined;
}
