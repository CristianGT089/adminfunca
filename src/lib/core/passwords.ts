import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const BCRYPT_COST = 12;

export function generatePassword(length = 12): string {
  let result = "";
  for (let i = 0; i < length; i++) result += ALPHABET[randomInt(ALPHABET.length)];
  return result;
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Minimum rules for passwords chosen by people. Returns the (user-facing) error or null. */
export function validatePassword(password: string): string | null {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "La contraseña debe combinar letras y números";
  return null;
}
