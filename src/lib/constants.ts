// ============================================================
// LocaBénin — Constantes métier & libellés français
// Source de vérité des énumérations (SQLite : String + validation Zod).
// ============================================================

export const ROLES = ["OWNER", "TENANT", "AGENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_SUB_ROLES = ["SUPER_ADMIN", "MODERATOR", "SUPPORT", "ACCOUNTANT"] as const;
export type AdminSubRole = (typeof ADMIN_SUB_ROLES)[number];

export const USER_STATUS = ["ACTIVE", "SUSPENDED", "BANNED", "DELETED"] as const;
export const KYC_STATUS = ["NONE", "PENDING", "VERIFIED", "REJECTED"] as const;

// Types de biens
export const LISTING_TYPES = [
  "APARTMENT", "HOUSE", "VILLA", "OFFICE", "GARAGE", "LAND", "FIELD", "ESTATE", "SHOP",
] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

// Genres de location
export const LISTING_GENRES = ["SIMPLE", "FURNISHED"] as const;
export type ListingGenre = (typeof LISTING_GENRES)[number];

// Catégories d'abonnement (facturées par mois et par catégorie active)
export const LISTING_CATEGORIES = ["EMPTY_HOUSING", "FURNISHED", "OFFICE"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

// Rattachement par défaut type → catégorie d'abonnement.
// Hypothèse documentée dans docs/DECISIONS.md : garage, champ, terrain,
// propriété, terrain agricole et boutique → « Logements vides » (5 000 FCFA).
// Modifiable sans code dans le back-office (table CategoryPricing + setting type_mapping).
export const DEFAULT_TYPE_CATEGORY: Record<ListingType, ListingCategory> = {
  APARTMENT: "EMPTY_HOUSING",
  HOUSE: "EMPTY_HOUSING",
  VILLA: "EMPTY_HOUSING",
  OFFICE: "OFFICE",
  GARAGE: "EMPTY_HOUSING",
  LAND: "EMPTY_HOUSING",
  FIELD: "EMPTY_HOUSING",
  ESTATE: "EMPTY_HOUSING",
  SHOP: "EMPTY_HOUSING",
};

export const LISTING_STATUSES = [
  "DRAFT", "PENDING_REVIEW", "PUBLISHED", "RESERVED", "RENTED",
  "SUSPENDED_OWNER", "SUSPENDED_UNPAID", "ARCHIVED",
] as const;

// Statuts visibles publiquement
export const PUBLIC_LISTING_STATUSES = ["PUBLISHED", "RESERVED", "RENTED"];

export const RENT_PERIODS = ["DAY", "WEEK", "MONTH", "QUARTER", "SEMESTER", "LEASE"] as const;
export type RentPeriod = (typeof RENT_PERIODS)[number];

export const PAYMENT_METHODS = ["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PURPOSES = ["INITIAL", "RENT", "BOOKING", "SUBSCRIPTION", "DEPOSIT_RETURN"] as const;
export const PAYMENT_STATUSES = ["INITIATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED", "DISPUTED", "CANCELLED"] as const;

export const LEASE_STATUSES = ["ACTIVE", "NOTICE_GIVEN", "TERMINATED", "EXPIRED"] as const;
export const SCHEDULE_STATUSES = ["PENDING", "PARTIAL", "PAID", "LATE", "WAIVED"] as const;
export const VISIT_STATUSES = ["REQUESTED", "CONFIRMED", "REJECTED", "CANCELLED", "DONE"] as const;
export const APPLICATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const PAYOUT_STATUSES = ["OTP_PENDING", "REQUESTED", "APPROVED", "PROCESSING", "PAID", "REJECTED"] as const;

// Équipements proposés à la création (seedés en base également)
export const AMENITIES = [
  { code: "CLIM", label: "Climatisé", icon: "Wind", group: "CONFORT" },
  { code: "WIFI", label: "Wifi", icon: "Wifi", group: "CONFORT" },
  { code: "PARKING", label: "Parking", icon: "Car", group: "EXTERIEUR" },
  { code: "GUARD", label: "Gardien", icon: "ShieldCheck", group: "SECURITE" },
  { code: "WATER", label: "Eau courante (SONEB)", icon: "Droplets", group: "CONFORT" },
  { code: "POWER", label: "Électricité (SBEE)", icon: "Zap", group: "CONFORT" },
  { code: "BOREHOLE", label: "Forage", icon: "Waves", group: "CONFORT" },
  { code: "GENERATOR", label: "Groupe électrogène", icon: "Plug", group: "CONFORT" },
  { code: "TANK", label: "Réservoir d'eau", icon: "Cylinder", group: "CONFORT" },
  { code: "BALCONY", label: "Balcon", icon: "Building", group: "EXTERIEUR" },
  { code: "YARD", label: "Cour", icon: "Fence", group: "EXTERIEUR" },
  { code: "GARDEN", label: "Jardin", icon: "Flower2", group: "EXTERIEUR" },
  { code: "FURNITURE", label: "Meublé équipé", icon: "Sofa", group: "CONFORT" },
  { code: "HOTWATER", label: "Eau chaude", icon: "Flame", group: "CONFORT" },
  { code: "AC_UNIT_EACH", label: "Clim dans chaque chambre", icon: "AirVent", group: "CONFORT" },
  { code: "SECURITY_DOOR", label: "Porte blindée", icon: "DoorClosed", group: "SECURITE" },
  { code: "CCTV", label: "Caméras de surveillance", icon: "Cctv", group: "SECURITE" },
  { code: "TRASH", label: "Poubelles gérées", icon: "Trash2", group: "SERVICES" },
  { code: "MAID", label: "Personnel d'entretien", icon: "SprayCan", group: "SERVICES" },
  { code: "ELEVATOR", label: "Ascenseur", icon: "MoveVertical", group: "CONFORT" },
] as const;

export const REPORT_REASONS = ["SCAM", "FAKE", "INAPPROPRIATE", "DUPLICATE", "OTHER"] as const;

// Libellés français des énumérations (UI)
export const LABELS: Record<string, string> = {
  // Rôles
  OWNER: "Propriétaire", TENANT: "Locataire", AGENT: "Démarcheur", ADMIN: "Administrateur",
  SUPER_ADMIN: "Super admin", MODERATOR: "Modérateur", SUPPORT: "Support", ACCOUNTANT: "Comptable",
  // Types de biens
  APARTMENT: "Appartement", HOUSE: "Maison", VILLA: "Villa", OFFICE: "Bureau",
  GARAGE: "Garage", LAND: "Terrain", FIELD: "Champ", ESTATE: "Propriété", SHOP: "Boutique",
  // Genres
  SIMPLE: "Location simple", FURNISHED: "Meublé",
  // Catégories d'abonnement
  EMPTY_HOUSING: "Logements vides", FURNISHED: "Appartements meublés", OFFICE: "Bureaux",
  // Périodes
  DAY: "jour", WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre", SEMESTER: "semestre", LEASE: "bail",
  // Statuts d'offre
  DRAFT: "Brouillon", PENDING_REVIEW: "En validation", PUBLISHED: "Disponible",
  RESERVED: "Réservé", RENTED: "Loué", SUSPENDED_OWNER: "Suspendu", SUSPENDED_UNPAID: "Abonnement expiré", ARCHIVED: "Archivé",
  // Statuts divers
  ACTIVE: "Actif", NOTICE_GIVEN: "Préavis donné", TERMINATED: "Résilié", EXPIRED: "Expiré",
  PENDING: "En attente", PARTIAL: "Partiel", PAID: "Payé", LATE: "En retard", WAIVED: "Annulé",
  REQUESTED: "Demandée", CONFIRMED: "Confirmée", REJECTED: "Refusée", CANCELLED: "Annulée", DONE: "Effectuée",
  ACCEPTED: "Acceptée", WITHDRAWN: "Retirée",
  OPEN: "Ouvert", IN_PROGRESS: "En cours", RESOLVED: "Résolu", CLOSED: "Fermé",
  SUCCESS: "Réussi", FAILED: "Échoué", REFUNDED: "Remboursé", DISPUTED: "Litigieux", INITIATED: "Initié",
  OTP_PENDING: "OTP à confirmer", APPROVED: "Approuvé", PROCESSING: "En cours de paiement", REJECTED: "Rejeté",
  PENDING_PAYMENT: "Paiement en attente", COMPLETED: "Terminé",
  PENDING_VALIDATION: "En validation", VALIDATED: "Validée", PAID: "Payée",
  NONE: "Non vérifié", VERIFIED: "Vérifié", PENDING: "En attente",
  // Méthodes de paiement
  MTN_MOMO: "MTN MoMo", MOOV_MONEY: "Moov Money", CELTIS_CASH: "Celtiis Cash", CARD: "Carte bancaire",
  // Motifs de signalement
  SCAM: "Arnaque", FAKE: "Fausse annonce", INAPPROPRIATE: "Contenu inapproprié", DUPLICATE: "Doublon", OTHER: "Autre",
  // KYC
  ID_CARD: "CNI / carte d'identité", PASSPORT: "Passeport", DRIVER_LICENSE: "Permis de conduire", SELFIE: "Selfie",
  // Motifs de paiement
  INITIAL: "Paiement d'entrée", RENT: "Loyer", BOOKING: "Réservation", SUBSCRIPTION: "Abonnement", DEPOSIT_RETURN: "Restitution de caution",
};

export function label(key: string | null | undefined): string {
  if (!key) return "—";
  return LABELS[key] ?? key;
}

export const PERIOD_DAYS: Record<RentPeriod, number> = {
  DAY: 1, WEEK: 7, MONTH: 30, QUARTER: 91, SEMESTER: 182, LEASE: 365,
};

export const PERIOD_MONTHS: Record<RentPeriod, number> = {
  DAY: 1 / 30, WEEK: 7 / 30, MONTH: 1, QUARTER: 3, SEMESTER: 6, LEASE: 12,
};

// Chemins de l'application (routeur hash)
export const APP_NAME = "LocaBénin";
