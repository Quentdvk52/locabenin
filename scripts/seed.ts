/**
 * LocaBénin — Jeu de données de démonstration
 * Exécution : bun scripts/seed.ts
 * Contenu : géographie complète du Bénin (12 départements, 77 communes,
 * quartiers des grandes villes), équipements, tarifs d'abonnement,
 * comptes de démonstration (4 rôles), 22 offres réalistes avec photos,
 * bail locatif avec échéancier + paiements écrits dans le ledger,
 * réservation de meublé, conversation, avis.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ---------- Géographie officielle du Bénin (12 départements / 77 communes) ----------
const GEO: Array<{ code: string; name: string; communes: string[] }> = [
  { code: "AL", name: "Alibori", communes: ["Banikoara", "Gogounou", "Kandi", "Karimama", "Malanville", "Ségbana"] },
  { code: "AT", name: "Atacora", communes: ["Boukoumbé", "Cobly", "Kérou", "Kouandé", "Matéri", "Natitingou", "Ouassa-Péhunco", "Tanguiéta", "Toukountouna"] },
  { code: "AE", name: "Atlantique", communes: ["Abomey-Calavi", "Allada", "Kpomassè", "Ouidah", "So-Ava", "Toffo", "Tori-Bossito", "Zê"] },
  { code: "BO", name: "Borgou", communes: ["Bembèrèkè", "Kalalé", "N'Dali", "Nikki", "Parakou", "Pèrèrè", "Sinendé", "Tchaourou"] },
  { code: "CO", name: "Collines", communes: ["Bantè", "Dassa-Zoumè", "Glazoué", "Ouèssè", "Savalou", "Savè"] },
  { code: "KF", name: "Couffo", communes: ["Aplahoué", "Djakotomey", "Dogbo", "Klouékanmè", "Lalo", "Toviklin"] },
  { code: "DO", name: "Donga", communes: ["Bassila", "Copargo", "Djougou", "Ouaké"] },
  { code: "LI", name: "Littoral", communes: ["Cotonou"] },
  { code: "MO", name: "Mono", communes: ["Athiémè", "Bopa", "Comè", "Grand-Popo", "Houéyogbé", "Lokossa"] },
  { code: "OE", name: "Ouémé", communes: ["Adjarra", "Adjohoun", "Aguégués", "Akpro-Missérété", "Avrankou", "Bonou", "Dangbo", "Porto-Novo", "Sèmè-Podji"] },
  { code: "PL", name: "Plateau", communes: ["Adja-Ouèrè", "Ifangni", "Kétou", "Pobè", "Sakété"] },
  { code: "ZO", name: "Zou", communes: ["Abomey", "Agbangnizoun", "Bohicon", "Covè", "Djidja", "Ouinhi", "Za-Kpota", "Zagnanado", "Zogbodomey"] },
];

// Quartiers (échantillon préchargé des grandes villes — enrichissable par l'admin)
const QUARTIERS: Record<string, string[]> = {
  "Cotonou": ["Cadjèhoun", "Fidjrossè", "Ganhi", "Akpakpa", "Haie Vive", "Gbégamey", "Vèdoko", "Ste Rita", "Agla", "Jéricho", "Sikècodji", "Ayélawadjè", "Zongo", "Ménontin", "Tokpa-Hoho"],
  "Abomey-Calavi": ["Calavi centre", "Godomey", "Akassato", "Tankpè", "Zinvié", "Ouèdo", "Glo-Djigbé", "Togba", "Kpota"],
  "Porto-Novo": ["Ouando", "Djègan-Daho", "Tokpota", "Houinmè", "Gbéconyédji", "Djèzou", "Jéricho PN", "Akpakpa Dodomè"],
  "Parakou": ["Banikani", "Guèma", "Albarika", "Wénou", "Sonsoro", "Kokouesso", "Bakary-Wari", "Zone de l'aéroport"],
  "Sèmè-Podji": ["Agblangandan", "Epe", "Tohouè", "Aholouyèmè", "Sèmè-Kraké", "Centre Sèmè-Podji"],
  "Ouidah": ["Centre Ouidah", "Pahou", "Fidjrossè-Kpoundjo", "Djègbadji", "Savi"],
  "Bohicon": ["Centre Bohicon", "Sacré-Cœur", "Zakpo", "Passagon"],
  "Abomey": ["Centre Abomey", "Djègbé", "Sodohomè", "Zounzonmè"],
  "Lokossa": ["Centre Lokossa", "Ouèdèmè", "Agamè", "Koudji"],
  "Natitingou": ["Centre Natitingou", "Perma", "Kotopounga"],
  "Djougou": ["Centre Djougou", "Barei", "Patago"],
  "Malanville": ["Centre Malanville", "Goron", "Madécali"],
  "Dangbo": ["Dangbo centre", "Zoungoudo", "Kessounhouè"],
  "Calavi centre": [],
};

const AMENITIES = [
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
];

// Photos réelles (recherche web, re-hébergées OSS)
const P = {
  aptExt: [
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/628a3468a16b.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b23a33443868.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4b7b2137e46d.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/5c0fcfabf599.jpg",
  ],
  bedroom: [
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/0cc9ec8a946d.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/aabc3f238cba.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/caf7b03db28d.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/7b6526375bb2.jpg",
  ],
  living: [
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/7ab5b5e64dbe.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/a51de672e6d8.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/e062a2c93a5e.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/6bc367b1252b.png",
  ],
  office: [
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/aa82be37d9b7.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/67440b596343.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/44997088ca1f.jpg",
  ],
  villa: [
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b59bd074a257.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/6cf1fe3bede5.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/53e5e5f05b8b.jpg",
    "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/ecd95e018428.jpg",
  ],
};

function pick(...groups: string[][]): string[] {
  return groups.flat();
}

/** Écrit une transaction équilibrée (miroir de lib/ledger.ts pour le seed). */
async function ensureAccountsAndEntries(
  lines: Array<{ code: string; kind: string; ownerType: string; ownerId?: string; label: string; direction: string; amount: number }>,
  idempotencyKey: string, memo: string, paymentId: string,
) {
  const ids: Record<string, string> = {};
  for (const line of lines) {
    const acc = await db.ledgerAccount.upsert({
      where: { code: line.code },
      create: { code: line.code, kind: line.kind, ownerType: line.ownerType, ownerId: line.ownerId ?? null, label: line.label },
      update: {},
    });
    ids[line.code] = acc.id;
  }
  for (const line of lines) {
    await db.ledgerEntry.create({
      data: {
        accountId: ids[line.code], direction: line.direction, amount: line.amount,
        memo, paymentId, idempotencyKey: `${idempotencyKey}:${line.code}:${line.direction}`,
      },
    });
  }
}

async function main() {
  console.log("🧹 Nettoyage…");
  // Ordre respectant les FK
  await db.ledgerEntry.deleteMany();
  await db.ledgerAccount.deleteMany();
  await db.paymentEvent.deleteMany();
  await db.payment.deleteMany();
  await db.commission.deleteMany();
  await db.payout.deleteMany();
  await db.subscriptionInvoice.deleteMany();
  await db.rentSchedule.deleteMany();
  await db.ticketUpdate.deleteMany();
  await db.maintenanceTicket.deleteMany();
  await db.message.deleteMany();
  await db.conversationParticipant.deleteMany();
  await db.conversation.deleteMany();
  await db.announcement.deleteMany();
  await db.notification.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.review.deleteMany();
  await db.report.deleteMany();
  await db.auditLog.deleteMany();
  await db.booking.deleteMany();
  await db.lease.deleteMany();
  await db.visit.deleteMany();
  await db.application.deleteMany();
  await db.savedSearch.deleteMany();
  await db.favorite.deleteMany();
  await db.affiliateAttribution.deleteMany();
  await db.affiliateClick.deleteMany();
  await db.affiliateLink.deleteMany();
  await db.calendarBlock.deleteMany();
  await db.listingAmenity.deleteMany();
  await db.depositOption.deleteMany();
  await db.listingMedia.deleteMany();
  await db.listing.deleteMany();
  await db.property.deleteMany();
  await db.area.deleteMany();
  await db.commune.deleteMany();
  await db.department.deleteMany();
  await db.kycDocument.deleteMany();
  await db.otpCode.deleteMany();
  await db.userRole.deleteMany();
  await db.user.deleteMany();
  await db.categoryPricing.deleteMany();
  await db.adminSetting.deleteMany();
  await db.amenity.deleteMany();

  console.log("🗺️ Géographie du Bénin…");
  for (const dept of GEO) {
    await db.department.create({
      data: { code: dept.code, name: dept.name, communes: { create: dept.communes.map((name) => ({ name })) } },
    });
  }
  // Quartiers des grandes villes
  for (const [communeName, quartiers] of Object.entries(QUARTIERS)) {
    const commune = await db.commune.findFirst({ where: { name: communeName } });
    if (!commune) continue;
    await db.area.createMany({ data: quartiers.map((name) => ({ communeId: commune.id, name, kind: "QUARTIER" })) });
  }

  console.log("⚙️ Équipements, tarifs et paramètres…");
  const amenityIdByCode: Record<string, string> = {};
  for (const a of AMENITIES) {
    const created = await db.amenity.create({ data: a });
    amenityIdByCode[a.code] = created.id;
  }
  await db.categoryPricing.createMany({
    data: [
      { category: "EMPTY_HOUSING", monthlyPrice: 5000, label: "Logements vides (location simple)" },
      { category: "FURNISHED", monthlyPrice: 10000, label: "Appartements meublés" },
      { category: "OFFICE", monthlyPrice: 10000, label: "Bureaux" },
    ],
  });
  await db.adminSetting.create({
    data: {
      key: "app_settings",
      valueJson: JSON.stringify({
        commissionTenantSharePct: 25, commissionOwnerSharePct: 25,
        affiliateWindowDays: 30, affiliateAttribution: "last_click",
        commissionValidationDays: 7, commissionMinDurationMonths: 1,
        subscriptionGraceDays: 5, payoutAutoApprovalThreshold: 50000, payoutMinAmount: 2000,
        autoPublishListings: false,
        typeCategoryMapping: {
          APARTMENT: "EMPTY_HOUSING", HOUSE: "EMPTY_HOUSING", VILLA: "EMPTY_HOUSING",
          OFFICE: "OFFICE", GARAGE: "EMPTY_HOUSING", LAND: "EMPTY_HOUSING",
          FIELD: "EMPTY_HOUSING", ESTATE: "EMPTY_HOUSING", SHOP: "EMPTY_HOUSING",
        },
      }),
      label: "Paramètres généraux", group: "FINANCE",
    },
  });

  console.log("👤 Comptes de démonstration…");
  const admin = await db.user.create({ data: { phone: "+2290190000001", fullName: "Admin LocaBénin", kycStatus: "VERIFIED", phoneVerified: true, userRoles: { create: [{ role: "ADMIN", adminSubRole: "SUPER_ADMIN", isDefault: true }] } } });
  const owner1 = await db.user.create({ data: { phone: "+2290197000001", fullName: "Kossi Adjovi", kycStatus: "VERIFIED", phoneVerified: true, whatsapp: "+2290197000001", userRoles: { create: [{ role: "OWNER", isDefault: true }] } } });
  const owner2 = await db.user.create({ data: { phone: "+2290197000002", fullName: "Rosine Ahouansou", kycStatus: "VERIFIED", phoneVerified: true, userRoles: { create: [{ role: "OWNER", isDefault: true }] } } });
  const tenant1 = await db.user.create({ data: { phone: "+2290197000003", fullName: "Rachid Bio Tchané", kycStatus: "NONE", phoneVerified: true, userRoles: { create: [{ role: "TENANT", isDefault: true }] } } });
  const tenant2 = await db.user.create({ data: { phone: "+2290197000004", fullName: "Aïcha Gounongbé", kycStatus: "VERIFIED", phoneVerified: true, userRoles: { create: [{ role: "TENANT", isDefault: true }] } } });
  const agent = await db.user.create({ data: { phone: "+2290197000005", fullName: "Sètondji Ahouandjinou", kycStatus: "VERIFIED", phoneVerified: true, userRoles: { create: [{ role: "AGENT", isDefault: true }] } } });
  // Multi-rôles : owner1 est aussi démarcheur (démonstration du sélecteur de rôle)
  await db.userRole.create({ data: { userId: owner1.id, role: "AGENT" } });

  const areaBy = async (commune: string, quartier: string) =>
    (await db.area.findFirst({ where: { name: quartier, commune: { name: commune } } }))!;

  console.log("🏠 Offres…");
  type L = {
    owner: string; title: string; type: string; genre: "SIMPLE" | "FURNISHED"; category: string;
    status?: string; bedrooms: number; bathrooms: number; livingRooms?: number; surfaceM2?: number;
    commune: string; quartier: string; address: string; lat: number; lng: number;
    rentAmount: number; rentPeriod: string; depositAmount?: number; advanceMonths?: number;
    dailyPrice?: number; weeklyPrice?: number; monthlyPrice?: number; minStayDays?: number;
    depositOptions?: Array<{ label: string; amount: number }>;
    amenities: string[]; affiliateEnabled?: boolean; isFeatured?: boolean; photos: string[];
    description: string; rules?: string;
  };

  const listings: L[] = [
    { owner: owner1.id, title: "Appartement 3 chambres duplex — Cadjèhoun", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 3, bathrooms: 2, livingRooms: 1, surfaceM2: 120, commune: "Cotonou", quartier: "Cadjèhoun", address: "Rue 12.089, près de la pharmacie Carrefour", lat: 6.3565, lng: 2.4285, rentAmount: 250000, rentPeriod: "MONTH", depositAmount: 500000, advanceMonths: 6, depositOptions: [{ label: "Caution eau (SONEB)", amount: 25000 }, { label: "Caution électricité (SBEE)", amount: 30000 }], amenities: ["PARKING", "WATER", "POWER", "TANK", "BALCONY", "SECURITY_DOOR", "YARD"], affiliateEnabled: true, isFeatured: true, photos: pick([P.aptExt[0]], P.living.slice(0, 2), P.bedroom.slice(0, 2)), description: "Superbe duplex de 3 chambres au 1er étage d'une résidence calme de Cadjèhoun. Salon spacieux, cuisine américaine équipée, 2 salles d'eau modernes, balcon donnant sur cour intérieure. Eau et électricité individuelles (compteurs SONEB/SBEE). Parking privatif pour 2 voitures. Quartier sécurisé, à 10 minutes de l'aéroport cardinal Bernardin Gantin et de la plage de Fidjrossè." },
    { owner: owner1.id, title: "Villa 4 chambres avec jardin — Fidjrossè plage", type: "VILLA", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 4, bathrooms: 3, livingRooms: 1, surfaceM2: 210, commune: "Cotonou", quartier: "Fidjrossè", address: "Route de la plage, villa F2", lat: 6.3522, lng: 2.4041, rentAmount: 450000, rentPeriod: "MONTH", depositAmount: 900000, advanceMonths: 6, depositOptions: [{ label: "Caution eau (SONEB)", amount: 30000 }], amenities: ["PARKING", "WATER", "POWER", "BOREHOLE", "GARDEN", "GUARD", "YARD", "CCTV"], isFeatured: true, photos: pick(P.villa.slice(0, 2), P.living.slice(1, 3), P.bedroom.slice(1, 3)), description: "Grande villa familiale à 200 m de la plage de Fidjrossè. 4 chambres dont une suite parentale, séjour double de 45 m², cuisine indépendante, dépendance pour le personnel. Jardin arboré de 300 m² avec forage et réservoir. Gardien 24h/24, portail électrique, caméras. Idéal famille ou expatriés." },
    { owner: owner1.id, title: "Studio moderne meublé — Haie Vive", type: "APARTMENT", genre: "FURNISHED", category: "FURNISHED", bedrooms: 0, bathrooms: 1, surfaceM2: 32, commune: "Cotonou", quartier: "Haie Vive", address: "Immeuble Les Palmiers, 2e étage", lat: 6.3612, lng: 2.4332, rentAmount: 250000, rentPeriod: "MONTH", dailyPrice: 15000, weeklyPrice: 85000, monthlyPrice: 250000, minStayDays: 2, amenities: ["CLIM", "WIFI", "FURNITURE", "HOTWATER", "WATER", "POWER", "ELEVATOR", "GUARD"], affiliateEnabled: true, isFeatured: true, photos: pick(P.bedroom.slice(0, 2), P.living.slice(0, 2)), description: "Studio entièrement meublé et équipé dans le quartier diplomatique de la Haie Vive. Lit queen size, climatisation silencieuse, wifi fibre, TV avec chaînes internationales, kitchenette équipée (frigo, plaques, micro-ondes), eau chaude. Ménage hebdomadaire inclus. Arrivée autonome possible. Idéal missions et séjours professionnels." },
    { owner: owner1.id, title: "Appartement meublé 2 chambres vue lagune — Akpakpa", type: "APARTMENT", genre: "FURNISHED", category: "FURNISHED", bedrooms: 2, bathrooms: 1, livingRooms: 1, surfaceM2: 75, commune: "Cotonou", quartier: "Akpakpa", address: "Résidence Lagune Bleue, 3e étage", lat: 6.3688, lng: 2.4456, rentAmount: 400000, rentPeriod: "MONTH", dailyPrice: 30000, weeklyPrice: 170000, monthlyPrice: 400000, minStayDays: 3, amenities: ["CLIM", "WIFI", "FURNITURE", "ELEVATOR", "GUARD", "PARKING", "WATER", "POWER", "GENERATOR"], isFeatured: true, photos: pick(P.living.slice(0, 3), P.bedroom.slice(2, 4), [P.aptExt[2]]), description: "Bel appartement meublé de 2 chambres avec vue sur la lagune. Climatisation dans toutes les pièces, mobilier contemporain, cuisine équipée, groupe électrogène de l'immeuble, ascenseur, parking sécurisé. À 5 minutes du marché Dantokpa et du centre-ville." },
    { owner: owner1.id, title: "Maison 2 chambres + chambre-salon — Vèdoko", type: "HOUSE", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 2, bathrooms: 1, livingRooms: 1, surfaceM2: 80, commune: "Cotonou", quartier: "Vèdoko", address: "Rue 3.255, maison simple", lat: 6.3761, lng: 2.4165, rentAmount: 90000, rentPeriod: "MONTH", depositAmount: 180000, advanceMonths: 3, amenities: ["WATER", "POWER", "YARD"], photos: pick([P.aptExt[3]], P.living.slice(2, 4), P.bedroom.slice(3, 4)), description: "Maison simple et propre dans une cour familiale calme de Vèdoko. 2 chambres, salon, cuisine séparée, salle d'eau moderne, cour partagée avec forage. À proximité du marché Vèdoko et des écoles." },
    { owner: owner1.id, title: "Chambre-salon meublé — Ste Rita", type: "APARTMENT", genre: "FURNISHED", category: "FURNISHED", bedrooms: 1, bathrooms: 1, surfaceM2: 40, commune: "Cotonou", quartier: "Ste Rita", address: "À côté de la paroisse Sainte Rita", lat: 6.3689, lng: 2.4203, rentAmount: 180000, rentPeriod: "MONTH", dailyPrice: 12000, weeklyPrice: 70000, monthlyPrice: 180000, minStayDays: 2, amenities: ["CLIM", "WIFI", "FURNITURE", "WATER", "POWER"], photos: pick(P.bedroom.slice(1, 3), [P.living[0]]), description: "Chambre-salon meublé lumineux à Ste Rita, parfait pour jeunes actifs ou étudiants. Climatisation, wifi, literie neuve, kitchenette équipée. Commerces et zémidjans au pied de l'immeuble." },
    { owner: owner2.id, title: "Bureau open-space 120 m² — Ganhi (centre d'affaires)", type: "OFFICE", genre: "SIMPLE", category: "OFFICE", bedrooms: 0, bathrooms: 2, surfaceM2: 120, commune: "Cotonou", quartier: "Ganhi", address: "Immeuble CCIB, 4e étage", lat: 6.3723, lng: 2.4268, rentAmount: 800000, rentPeriod: "MONTH", depositAmount: 1600000, advanceMonths: 3, depositOptions: [{ label: "Caution entretien parties communes", amount: 100000 }], amenities: ["CLIM", "WIFI", "ELEVATOR", "GUARD", "PARKING", "GENERATOR", "CCTV"], affiliateEnabled: true, isFeatured: true, photos: pick(P.office.slice(0, 3), [P.aptExt[1]]), description: "Plateau de bureaux open-space de 120 m² au cœur du quartier d'affaires de Ganhi. Faux plafond, climatisation centralisée, fibre optique, salle de réunion vitrée, 2 sanitaires. Ascenseur, parking sous-sol, sécurité 24/7. Adresse prestigieuse pour votre entreprise." },
    { owner: owner2.id, title: "Bureau 3 pièces équipé — Porto-Novo centre", type: "OFFICE", genre: "SIMPLE", category: "OFFICE", bedrooms: 0, bathrooms: 1, surfaceM2: 65, commune: "Porto-Novo", quartier: "Ouando", address: "Avenue Steinmetz, face BNDE", lat: 6.4969, lng: 2.6061, rentAmount: 250000, rentPeriod: "MONTH", depositAmount: 500000, advanceMonths: 3, amenities: ["CLIM", "WIFI", "WATER", "POWER", "GUARD"], photos: pick([P.office[2]], [P.aptExt[0]]), description: "Bureau de 3 pièces au centre administratif de Porto-Novo. Adapté cabinet, ONG ou représentation commerciale. Pré-équipé en réseau, climatisé, parking fermé." },
    { owner: owner2.id, title: "Appartement 2 chambres — Godomey (Abomey-Calavi)", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 2, bathrooms: 1, livingRooms: 1, surfaceM2: 70, commune: "Abomey-Calavi", quartier: "Godomey", address: "Carrefour Tanwé-Hessou", lat: 6.4489, lng: 2.3564, rentAmount: 70000, rentPeriod: "MONTH", depositAmount: 140000, advanceMonths: 3, depositOptions: [{ label: "Caution forage", amount: 10000 }], amenities: ["WATER", "POWER", "BOREHOLE", "YARD"], isFeatured: true, photos: pick([P.aptExt[2]], P.living.slice(1, 3), P.bedroom.slice(0, 1)), description: "Appartement neuf de 2 chambres à Godomey, quartier dynamique proche de Cotonou. Salon + 2 chambres, cuisine carrelée, salle d'eau moderne, cour commune avec forage. Transport facile vers Cotonou (tokpa-akpakpa, zémidjans)." },
    { owner: owner2.id, title: "Villa duplex 5 chambres — Calavi centre", type: "VILLA", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 5, bathrooms: 4, livingRooms: 2, surfaceM2: 260, commune: "Abomey-Calavi", quartier: "Calavi centre", address: "Lot 45, quartier Zogba", lat: 6.4488, lng: 2.3552, rentAmount: 350000, rentPeriod: "MONTH", depositAmount: 700000, advanceMonths: 6, amenities: ["PARKING", "WATER", "POWER", "BOREHOLE", "TANK", "GARDEN", "GUARD", "CCTV", "AC_UNIT_EACH"], photos: pick(P.villa.slice(1, 4), P.living.slice(0, 2), P.bedroom.slice(0, 2)), description: "Somptueux duplex de 5 chambres à Calavi centre. Double séjour de 60 m², suite parentale avec dressing, cuisine américaine équipée, chambre au rez-de-chaussée. Jardin paysager, forage, réservoir 5000 L, gardien. Cadre résidentiel haut de gamme." },
    { owner: owner2.id, title: "Maison meublée 2 chambres — Ouidah (bord de mer)", type: "HOUSE", genre: "FURNISHED", category: "FURNISHED", bedrooms: 2, bathrooms: 2, livingRooms: 1, surfaceM2: 90, commune: "Ouidah", quartier: "Fidjrossè-Kpoundjo", address: "Route des pêches", lat: 6.3618, lng: 2.3920, rentAmount: 320000, rentPeriod: "MONTH", dailyPrice: 25000, weeklyPrice: 140000, monthlyPrice: 320000, minStayDays: 2, amenities: ["CLIM", "WIFI", "FURNITURE", "WATER", "POWER", "YARD", "GUARD"], photos: pick(P.villa.slice(2, 4), P.living.slice(2, 4), P.bedroom.slice(1, 3)), description: "Maison de ville meublée à 300 m de la plage de la route des pêches. 2 chambres climatisées, séjour ouvert, terrasse avec salon de jardin, cour fermée. Parfait week-ends en bord de mer et séjours touristiques (Porte du Non-Retour à 10 min)." },
    { owner: owner2.id, title: "Boutique 25 m² — Porto-Novo marché Ouando", type: "SHOP", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 0, bathrooms: 0, surfaceM2: 25, commune: "Porto-Novo", quartier: "Ouando", address: "Allée commerciale du marché", lat: 6.4985, lng: 2.6045, rentAmount: 60000, rentPeriod: "MONTH", depositAmount: 120000, advanceMonths: 3, amenities: ["POWER", "WATER"], photos: pick([P.aptExt[3], P.office[1]]), description: "Boutique de 25 m² sur l'allée marchande du marché Ouando, fort passage quotidien. Vitrine, arrière-boutique, compteur électrique indépendant." },
    { owner: owner2.id, title: "Terrain constructible 500 m² — Tankpè (Calavi)", type: "LAND", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 0, bathrooms: 0, commune: "Abomey-Calavi", quartier: "Tankpè", address: "Zone résidentielle Tankpè", lat: 6.4602, lng: 2.3418, rentAmount: 40000, rentPeriod: "MONTH", depositAmount: 0, advanceMonths: 0, amenities: [], photos: pick([P.villa[0]]), description: "Terrain clôturé de 500 m² à louer (usage long terme) dans la zone résidentielle de Tankpè. Titre foncier en cours, accès carrossable, environnement calme." },
    { owner: owner1.id, title: "Appartement 2 chambres rénové — Jéricho", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 2, bathrooms: 1, livingRooms: 1, surfaceM2: 78, commune: "Cotonou", quartier: "Jéricho", address: "Rue Jéricho, immeuble tranquille", lat: 6.3758, lng: 2.4389, rentAmount: 150000, rentPeriod: "MONTH", depositAmount: 300000, advanceMonths: 4, depositOptions: [{ label: "Caution eau (SONEB)", amount: 20000 }], amenities: ["WATER", "POWER", "BALCONY", "PARKING", "SECURITY_DOOR"], status: "RESERVED", photos: pick([P.aptExt[1]], P.living.slice(0, 2), P.bedroom.slice(0, 1)), description: "Appartement 2 chambres entièrement rénové dans le quartier calme de Jéricho. Peinture neuve, carrelage moderne, cuisine équipée, balcon. Proche du boulevard de la Marina et des écoles internationales." },
    { owner: owner1.id, title: "Chambre-salon — Agla", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 1, bathrooms: 1, surfaceM2: 38, commune: "Cotonou", quartier: "Agla", address: "Rue 8.012, cour propre", lat: 6.3622, lng: 2.3998, rentAmount: 55000, rentPeriod: "MONTH", depositAmount: 110000, advanceMonths: 3, amenities: ["WATER", "POWER", "YARD"], status: "RENTED", photos: pick([P.living[3], P.bedroom[3]]), description: "Chambre-salon bien aérée à Agla dans une cour propre de 3 logements. Location simple, petites attentions du propriétaire, quartier vivant avec tous commerces." },
    { owner: owner2.id, title: "Studio meublé étudiant — Abomey centre", type: "APARTMENT", genre: "FURNISHED", category: "FURNISHED", bedrooms: 0, bathrooms: 1, surfaceM2: 28, commune: "Abomey", quartier: "Centre Abomey", address: "Près de l'université", lat: 7.1795, lng: 1.9916, rentAmount: 90000, rentPeriod: "MONTH", dailyPrice: 6000, weeklyPrice: 35000, monthlyPrice: 90000, minStayDays: 1, amenities: ["CLIM", "WIFI", "FURNITURE", "WATER", "POWER"], photos: pick(P.bedroom.slice(2, 4), [P.living[0]]), description: "Studio meublé pensé pour les étudiants et jeunes professionnels : lit, bureau, armoire, wifi, eau et électricité incluses dans le tarif mensuel. À deux pas du campus." },
    { owner: owner1.id, title: "Maison 3 chambres — Parakou Banikani", type: "HOUSE", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 3, bathrooms: 2, livingRooms: 1, surfaceM2: 110, commune: "Parakou", quartier: "Banikani", address: "Quartier Banikani, villa clôturée", lat: 9.3376, lng: 2.6203, rentAmount: 120000, rentPeriod: "MONTH", depositAmount: 240000, advanceMonths: 3, depositOptions: [{ label: "Caution forage", amount: 15000 }], amenities: ["WATER", "POWER", "BOREHOLE", "PARKING", "YARD", "GUARD"], isFeatured: true, photos: pick([P.aptExt[0]], P.living.slice(1, 3), P.bedroom.slice(0, 2)), description: "Villa de 3 chambres à Parakou Banikani, la capitale du Borgou. Grand salon, chambres spacieuses avec placards, cour clôturée avec forage et mangoiers. Climat du Nord agréable, quartier familial réputé." },
    { owner: owner2.id, title: "Bureau 2 pièces — Parakou centre", type: "OFFICE", genre: "SIMPLE", category: "OFFICE", bedrooms: 0, bathrooms: 1, surfaceM2: 45, commune: "Parakou", quartier: "Guèma", address: "Avenue Bourguiba", lat: 9.3393, lng: 2.6113, rentAmount: 150000, rentPeriod: "MONTH", depositAmount: 300000, advanceMonths: 3, amenities: ["CLIM", "WATER", "POWER", "GUARD"], photos: pick([P.office[0], P.office[2]]), description: "Bureau moderne de 2 pièces sur l'artère principale de Parakou. Climatisé, salle de réunion, réception. Idéal notaire, assurance, microfinance." },
    { owner: owner1.id, title: "Appartement meublé haut standing — Marina Cotonou", type: "APARTMENT", genre: "FURNISHED", category: "FURNISHED", bedrooms: 3, bathrooms: 2, livingRooms: 1, surfaceM2: 140, commune: "Cotonou", quartier: "Ganhi", address: "Résidence du Marina, 5e étage", lat: 6.3702, lng: 2.4247, rentAmount: 850000, rentPeriod: "MONTH", dailyPrice: 55000, weeklyPrice: 320000, monthlyPrice: 850000, minStayDays: 3, amenities: ["CLIM", "WIFI", "FURNITURE", "ELEVATOR", "GUARD", "PARKING", "GENERATOR", "HOTWATER", "AC_UNIT_EACH", "CCTV", "MAID"], status: "PENDING_REVIEW", photos: pick(P.living.slice(0, 3), P.bedroom.slice(0, 3), [P.aptExt[2]]), description: "Penthouse meublé haut de gamme face à la Marina. Vue mer partielle, 3 chambres climatisées avec salles d'eau privatives, grande terrasse, service d'entretien 2×/semaine, salle de sport de la résidence. Le nec plus ultra pour séjours d'affaires longue durée." },
    { owner: owner2.id, title: "Cour de 3 logements 2 chambres — Sèmè-Podji", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 2, bathrooms: 1, surfaceM2: 62, commune: "Sèmè-Podji", quartier: "Agblangandan", address: "Route d'Agblangandan", lat: 6.4109, lng: 2.5586, rentAmount: 60000, rentPeriod: "MONTH", depositAmount: 120000, advanceMonths: 3, amenities: ["WATER", "POWER", "YARD", "BOREHOLE"], status: "PENDING_REVIEW", photos: pick([P.aptExt[3]], P.living.slice(2, 4)), description: "Logement de 2 chambres dans une cour de 3 unités récemment construites à Agblangandan. Pourage, cour pavée, proximité immédiate de la route inter-étatique Cotonou-Porto-Novo." },
    { owner: owner1.id, title: "Champ 2 ha en location saisonnière — Dangbo", type: "FIELD", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 0, bathrooms: 0, commune: "Dangbo", quartier: "Dangbo centre", address: "Bas-fond de Dangbo", lat: 6.5364, lng: 2.5180, rentAmount: 250000, rentPeriod: "QUARTER", depositAmount: 0, advanceMonths: 1, amenities: [], photos: pick([P.villa[1]]), description: "Parcelle agricole de 2 hectares en bas-fond, location saisonnière pour maraîchage ou riziculture. Terre fertile, accès à l'eau toute l'année, bord de piste carrossable." },
    { owner: owner2.id, title: "Immeuble 4 unités à louer — Tokpa-Hoho", type: "APARTMENT", genre: "SIMPLE", category: "EMPTY_HOUSING", bedrooms: 2, bathrooms: 1, surfaceM2: 58, commune: "Cotonou", quartier: "Tokpa-Hoho", address: "Rue 10.234, immeuble R+1", lat: 6.3800, lng: 2.4350, rentAmount: 80000, rentPeriod: "MONTH", depositAmount: 160000, advanceMonths: 3, amenities: ["WATER", "POWER", "YARD"], photos: pick([P.aptExt[1], P.living[1], P.bedroom[0]]), description: "Une des 4 unités d'un immeuble propre à Tokpa-Hoho : 2 chambres, salon, cuisine, salle d'eau, compteurs séparés. Gestion rigoureuse, travaux suivis rapidement (ticket de réparation dans l'app)." },
  ];

  const createdListings: Array<{ id: string; l: L }> = [];
  for (const [i, l] of listings.entries()) {
    const area = await areaBy(l.commune, l.quartier);
    const listing = await db.listing.create({
      data: {
        reference: `LB-${String(100001 + i)}`,
        ownerId: l.owner, title: l.title, description: l.description,
        type: l.type, genre: l.genre, category: l.category, status: l.status ?? "PUBLISHED",
        bedrooms: l.bedrooms, bathrooms: l.bathrooms, livingRooms: l.livingRooms ?? 0, surfaceM2: l.surfaceM2,
        addressText: l.address, areaId: area.id, latitude: l.lat, longitude: l.lng,
        rentAmount: l.rentAmount, rentPeriod: l.rentPeriod,
        depositAmount: l.depositAmount ?? 0, advanceMonths: l.advanceMonths ?? 0,
        dailyPrice: l.dailyPrice, weeklyPrice: l.weeklyPrice, monthlyPrice: l.monthlyPrice, minStayDays: l.minStayDays,
        rulesText: l.rules ?? "Fumeurs extérieurs acceptés. Animaux à discuter. Factures eau/électricité à la charge du locataire (compteurs séparés) sauf mention contraire.",
        affiliateEnabled: l.affiliateEnabled ?? false, isFeatured: l.isFeatured ?? false,
        allowPartial: false,
        publishedAt: l.status === "PUBLISHED" || !l.status ? new Date(Date.now() - i * 86400_000) : null,
        media: { create: l.photos.map((url, idx) => ({ kind: "IMAGE", url, position: idx, isCover: idx === 0 })) },
        depositOptions: { create: l.depositOptions ?? [] },
        amenities: { create: l.amenities.map((code) => ({ amenityId: amenityIdByCode[code] })) },
      },
    });
    createdListings.push({ id: listing.id, l });
  }
  console.log(`   ${createdListings.length} offres créées`);

  console.log("🔗 Lien d'affiliation de démonstration…");
  const duplex = createdListings.find((x) => x.l.affiliateEnabled)!;
  await db.affiliateLink.create({ data: { code: "DEMO1", listingId: duplex.id, agentId: agent.id, clicks: 37 } });

  console.log("⭐ Favoris, avis, recherche sauvegardée…");
  await db.favorite.createMany({ data: [{ userId: tenant2.id, listingId: createdListings[1].id }, { userId: tenant2.id, listingId: createdListings[2].id }, { userId: tenant1.id, listingId: createdListings[0].id }] });
  await db.savedSearch.create({ data: { userId: tenant2.id, name: "Meublés Cotonou < 300k", filtersJson: JSON.stringify({ genre: "FURNISHED", commune: "", max: 300000, sort: "recent" }) } });

  console.log("📄 Bail de démonstration + paiements (ledger)…");
  const rented = createdListings.find((x) => x.l.title.includes("Agla"))!;
  const monthly = rented.l.rentAmount;
  const lease = await db.lease.create({
    data: {
      reference: "BAIL-DEMO001", listingId: rented.id, ownerId: rented.l.owner, tenantId: tenant2.id,
      kind: "SIMPLE", startDate: new Date(Date.now() - 75 * 86400_000), endDate: new Date(Date.now() + 290 * 86400_000),
      rentAmount: monthly, rentPeriod: "MONTH", depositAmount: rented.l.depositAmount ?? 0, advanceMonths: rented.l.advanceMonths ?? 0,
      depositOptionsJson: "[]", status: "ACTIVE", allowPartial: false,
      contractPdfUrl: `/api/pdf/contract/LEASE_PLACEHOLDER`,
      commissionTotal: 0, commissionTenantShare: 0, commissionOwnerShare: 0,
    },
  });
  await db.lease.update({ where: { id: lease.id }, data: { contractPdfUrl: `/api/pdf/contract/${lease.id}` } });
  // Échéancier : 3 mois passés + courant + suivants
  const schedulesData = Array.from({ length: 6 }).map((_, idx) => ({
    leaseId: lease.id,
    dueDate: new Date(new Date(lease.startDate).getTime() + idx * 30 * 86400_000),
    amount: monthly,
  }));
  await db.rentSchedule.createMany({ data: schedulesData });

  const allSchedules = await db.rentSchedule.findMany({ where: { leaseId: lease.id }, orderBy: { dueDate: "asc" } });
  // 1er mois payé, 2e payé, 3e en retard, reste en attente
  for (const [idx, s] of allSchedules.entries()) {
    if (idx === 0 || idx === 1) {
      const payment = await db.payment.create({
        data: {
          reference: `PAY-SEED${idx + 1}`, payerId: tenant2.id, purpose: "RENT", amount: monthly,
          method: idx === 0 ? "MTN_MOMO" : "MOOV_MONEY", status: "SUCCESS", provider: "mock",
          providerRef: `MOCK-PAY-SEED${idx + 1}`, leaseId: lease.id, scheduleId: s.id,
          breakdownJson: JSON.stringify([{ label: "Loyer mensuel", amount: monthly }]),
          createdAt: s.dueDate, confirmedAt: s.dueDate,
        },
      });
      await db.rentSchedule.update({
        where: { id: s.id },
        data: { status: "PAID", paidAmount: monthly, paidAt: s.dueDate, paymentId: payment.id, quittanceUrl: `/api/pdf/quittance/${payment.id}` },
      });
      // Écritures ledger (partie double équilibrée) — format identique à lib/ledger.ts
      await ensureAccountsAndEntries([
        { code: "PLATFORM:CASH", kind: "ASSET_CASH", ownerType: "PLATFORM", label: "Encaissements plateforme", direction: "DEBIT", amount: monthly },
        { code: `WALLET:OWNER:${rented.l.owner}`, kind: "LIABILITY_WALLET", ownerType: "OWNER", ownerId: rented.l.owner, label: "Portefeuille propriétaire", direction: "CREDIT", amount: monthly },
      ], `pay:${payment.reference}`, `Loyer ${lease.reference}`, payment.id);
    } else if (idx === 2) {
      await db.rentSchedule.update({ where: { id: s.id }, data: { status: "LATE" } });
    }
  }
  // Paiement d'entrée (caution + avances) réglé à l'entrée
  const depositAmount = rented.l.depositAmount ?? 0;
  const advanceAmount = monthly * (rented.l.advanceMonths ?? 0);
  const initialTotal = depositAmount + advanceAmount;
  const initialPayment = await db.payment.create({
    data: {
      reference: "PAY-SEEDINIT", payerId: tenant2.id, purpose: "INITIAL", amount: initialTotal,
      method: "MTN_MOMO", status: "SUCCESS", provider: "mock", providerRef: "MOCK-PAY-SEEDINIT",
      leaseId: lease.id,
      breakdownJson: JSON.stringify([{ label: "Caution", amount: depositAmount }, { label: `Avances ${rented.l.advanceMonths} mois`, amount: advanceAmount }]),
      createdAt: lease.startDate, confirmedAt: lease.startDate,
    },
  });
  {
    await ensureAccountsAndEntries([
      { code: "PLATFORM:CASH", kind: "ASSET_CASH", ownerType: "PLATFORM", label: "Encaissements plateforme", direction: "DEBIT", amount: initialTotal },
      { code: `WALLET:OWNER:${rented.l.owner}`, kind: "LIABILITY_WALLET", ownerType: "OWNER", ownerId: rented.l.owner, label: "Portefeuille propriétaire", direction: "CREDIT", amount: initialTotal },
    ], `pay:${initialPayment.reference}`, `Paiement d'entrée ${lease.reference}`, initialPayment.id);
  }
  // Ticket de réparation de démonstration
  await db.maintenanceTicket.create({
    data: {
      leaseId: lease.id, tenantId: tenant2.id, ownerId: rented.l.owner, listingId: rented.id,
      title: "Robinetterie de cuisine qui goutte", description: "Le robinet de la cuisine goutte en permanence depuis deux jours, la vasque ne sèche plus.",
      photosJson: "[]", status: "IN_PROGRESS", priority: "NORMAL",
      updates: { create: [{ authorId: rented.l.owner, body: "Merci Aïcha, je passe demain avec le plombier du quartier.", statusAfter: "IN_PROGRESS" }] },
    },
  });

  console.log("📅 Réservation de meublé de démonstration…");
  const furnished = createdListings.find((x) => x.l.genre === "FURNISHED")!;
  const booking = await db.booking.create({
    data: {
      code: "RES-DEMO01", listingId: furnished.id, tenantId: tenant1.id,
      startDate: new Date(Date.now() + 5 * 86400_000), endDate: new Date(Date.now() + 8 * 86400_000),
      guests: 2, nights: 3, totalAmount: (furnished.l.dailyPrice ?? 0) * 3, status: "PENDING_PAYMENT",
    },
  });

  console.log("💬 Conversation de démonstration…");
  const conv = await db.conversation.create({
    data: {
      listingId: createdListings[0].id,
      participants: { create: [{ userId: tenant1.id }, { userId: owner1.id }] },
      messages: {
        create: [
          { senderId: tenant1.id, body: "Bonjour, le duplex de Cadjèhoun est-il toujours disponible ? Les 6 mois d'avance sont-ils négociables ?" },
          { senderId: owner1.id, body: "Bonjour ! Oui il est disponible. Pour l'avance, je peux accepter 4 mois + caution si vous emménagez ce mois-ci.", createdAt: new Date(Date.now() - 3600_000) },
        ],
      },
    },
  });
  void conv;

  console.log("🏅 Avis de démonstration…");
  await db.review.create({
    data: { leaseId: lease.id, listingId: rented.id, authorId: tenant2.id, rating: 5, comment: "Propriétaire très réactif, quartier calme, les réparations sont traitées vite via l'application. Je recommande." },
  });

  console.log("🔔 Notifications de bienvenue…");
  await db.notification.createMany({
    data: [
      { userId: owner1.id, type: "SYSTEM", title: "Bienvenue sur LocaBénin", body: "Créez votre première offre : la publication est gratuite pendant la période de démonstration.", linkHash: "#/proprietaire/biens" },
      { userId: tenant2.id, type: "RENT_DUE", title: "Loyer à venir", body: "Votre loyer arrive à échéance. Payez en 2 clics via Mobile Money.", linkHash: "#/locataire/bail" },
    ],
  });

  console.log("✅ Seed terminé.");
  console.log("   Comptes (connexion par OTP téléphone — le code s'affiche à l'écran en mode démo) :");
  console.log("   • Admin       : +2290190000001");
  console.log("   • Propriétaire: +2290197000001 (Kossi Adjovi)");
  console.log("   • Propriétaire: +2290197000002 (Rosine Ahouansou)");
  console.log("   • Locataire   : +2290197000003 / +2290197000004");
  console.log("   • Démarcheur  : +2290197000005");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
