import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalise une saisie de téléphone : supprime espaces (y compris insécables),
 * tirets, points et parenthèses — « +229 01 97 00 00 04 » devient « +2290197000004 ».
 * Utilisé côté client (avant envoi) ET côté serveur (Zod preprocess) pour que
 * l'utilisateur puisse saisir son numéro dans n'importe quel format courant.
 */
export function normalizePhone(input: string): string {
  return input.replace(/[\s\u00A0\u202F\-.()]/g, "");
}
