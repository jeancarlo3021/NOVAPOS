// UUID validation utility
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value);
}

export function validateUUID(value: unknown, fieldName: string = 'ID'): string {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid ${fieldName}: ${value} is not a valid UUID`);
  }
  return value as string;
}
