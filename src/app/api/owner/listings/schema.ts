import "server-only";
import { z } from "zod";

/** Schéma de validation d'une offre — partagé entre création et mise à jour. */
export const LISTING_TYPES = ["APARTMENT", "HOUSE", "VILLA", "OFFICE", "GARAGE", "LAND", "FIELD", "ESTATE", "SHOP"] as const;
export const RENT_PERIODS = ["DAY", "WEEK", "MONTH", "QUARTER", "SEMESTER", "LEASE"] as const;

export const depositOptionSchema = z.object({
  label: z.string().trim().min(2, "Libellé trop court.").max(80, "Libellé trop long."),
  amount: z.number().int("Montant entier requis.").min(1, "Montant requis.").max(99_999_999),
});

export const mediaSchema = z.object({
  url: z.string().min(4).max(600),
  kind: z.enum(["IMAGE", "VIDEO"]),
  position: z.number().int().min(0).max(60).default(0),
  isCover: z.boolean().default(false),
});

/** Corps complet d'une offre (création / mise à jour complète). */
export const listingInputSchema = z
  .object({
    title: z.string().trim().min(8, "Titre : au moins 8 caractères.").max(120, "Titre trop long."),
    description: z.string().trim().min(30, "Description : au moins 30 caractères.").max(5000, "Description trop longue."),
    type: z.enum(LISTING_TYPES),
    genre: z.enum(["SIMPLE", "FURNISHED"]),
    bedrooms: z.number().int().min(-1, "Chambre-salon : -1.").max(20),
    bathrooms: z.number().int().min(0).max(20),
    livingRooms: z.number().int().min(0).max(10).default(0),
    surfaceM2: z.number().int().min(5, "Surface trop petite.").max(1_000_000).nullable(),
    addressText: z.string().trim().min(6, "Adresse trop courte.").max(300),
    areaId: z.string().min(1, "Choisissez un quartier."),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    propertyId: z.string().nullable(),
    // Tarification — location simple
    rentAmount: z.number().int().min(0),
    rentPeriod: z.enum(RENT_PERIODS),
    depositAmount: z.number().int().min(0),
    advanceMonths: z.number().int().min(0).max(12),
    depositOptions: z.array(depositOptionSchema).max(10),
    // Tarification — meublé
    dailyPrice: z.number().int().min(0).nullable(),
    weeklyPrice: z.number().int().min(0).nullable(),
    monthlyPrice: z.number().int().min(0).nullable(),
    minStayDays: z.number().int().min(0).max(365).nullable(),
    rulesText: z.string().trim().max(2000).nullable(),
    affiliateEnabled: z.boolean(),
    amenities: z.array(z.string().min(1).max(40)).max(30),
    media: z.array(mediaSchema).max(15, "15 médias maximum."),
  })
  .superRefine((v, ctx) => {
    if (v.genre === "SIMPLE") {
      if (v.rentAmount <= 0) {
        ctx.addIssue({ code: "custom", path: ["rentAmount"], message: "Le loyer est requis." });
      }
      if (v.advanceMonths > 12) {
        ctx.addIssue({ code: "custom", path: ["advanceMonths"], message: "12 mois d'avance maximum." });
      }
    } else {
      if (!v.dailyPrice || v.dailyPrice <= 0) {
        ctx.addIssue({ code: "custom", path: ["dailyPrice"], message: "Le tarif journalier est requis pour un meublé." });
      }
    }
    if (!v.media.some((m) => m.kind === "IMAGE")) {
      ctx.addIssue({ code: "custom", path: ["media"], message: "Ajoutez au moins une photo." });
    }
  });

export type ListingInput = z.infer<typeof listingInputSchema>;
export type ListingMediaInput = z.infer<typeof mediaSchema>;
