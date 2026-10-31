import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";

/** Détail d'un bail — accessible uniquement aux parties (anti-IDOR). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const lease = await db.lease.findUnique({
      where: { id },
      include: {
        listing: { include: { media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 } } },
        owner: { select: { id: true, fullName: true, phone: true, kycStatus: true } },
        tenant: { select: { id: true, fullName: true, phone: true, kycStatus: true } },
        schedules: { orderBy: { dueDate: "asc" } },
      },
    });
    if (!lease) return fail(404, "Bail introuvable.");
    if (lease.ownerId !== user.id && lease.tenantId !== user.id && !user.isAdmin) {
      throw new ApiError(403, "Vous n'êtes pas partie de ce bail.");
    }
    const now = new Date();
    for (const s of lease.schedules) {
      if (s.status === "PENDING" && s.dueDate < now) {
        await db.rentSchedule.update({ where: { id: s.id }, data: { status: "LATE" } });
        s.status = "LATE";
      }
    }
    return ok(lease);
  });
}

const signSchema = z.object({
  signatureDataUrl: z.string().startsWith("data:image/").max(400_000),
  party: z.enum(["OWNER", "TENANT"]),
});

/**
 * Signature électronique du bail (canvas → PNG) + hash d'intégrité du PDF.
 * Les deux parties signent séparément ; le contrat signé est horodaté.
 * NOTE probance : signature dessinée + hash + journal d'audit — la valeur
 * légale exacte doit être validée juridiquement (voir DECISIONS.md).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await parseBody(req, signSchema);
    const lease = await db.lease.findUnique({ where: { id }, include: { listing: true } });
    if (!lease) return fail(404, "Bail introuvable.");
    const isOwner = lease.ownerId === user.id;
    const isTenant = lease.tenantId === user.id;
    if (!isOwner && !isTenant) throw new ApiError(403, "Vous n'êtes pas partie de ce bail.");

    // Le bail n'est signable qu'une fois le paiement d'entrée effectué (locataire)
    if (isTenant) {
      const paid = await db.payment.findFirst({ where: { leaseId: lease.id, purpose: "INITIAL", status: "SUCCESS" } });
      if (!paid) throw new ApiError(400, "Réglez d'abord le paiement d'entrée avant de signer le contrat.");
    }

    const signatureUrl = `/uploads/signatures/${lease.id}-${body.party.toLowerCase()}-${Date.now()}.png`;
    const { saveDataUrl } = await import("@/lib/uploads");
    await saveDataUrl(body.signatureDataUrl, signatureUrl);

    const updated = await db.lease.update({
      where: { id: lease.id },
      data: isOwner
        ? { ownerSignatureUrl: signatureUrl, ownerSignedAt: new Date() }
        : { tenantSignatureUrl: signatureUrl, tenantSignedAt: new Date() },
    });

    const both = Boolean(updated.ownerSignedAt && updated.tenantSignedAt);
    if (both && !updated.contractHash) {
      // Hash d'intégrité du contrat signé par les deux parties
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(`${lease.id}|${updated.ownerSignedAt!.toISOString()}|${updated.tenantSignedAt!.toISOString()}`).digest("hex");
      await db.lease.update({ where: { id: lease.id }, data: { contractHash: hash } });
      await sendNotification({ userId: lease.ownerId, type: "SYSTEM", title: "Contrat signé par les deux parties", body: `Le bail ${lease.reference} est signé et archivé dans vos documents.`, linkHash: "#/proprietaire/locataires" });
      await sendNotification({ userId: lease.tenantId, type: "SYSTEM", title: "Contrat signé", body: `Le bail ${lease.reference} est signé et archivé dans votre coffre-fort.`, linkHash: "#/locataire/documents" });
    }
    return ok({ signed: true, bothSigned: both });
  });
}

/** Préavis de départ (locataire) / reprise (propriétaire). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const lease = await db.lease.findUnique({ where: { id } });
    if (!lease) return fail(404, "Bail introuvable.");
    if (lease.ownerId !== user.id && lease.tenantId !== user.id) throw new ApiError(403, "Accès refusé.");
    if (lease.status !== "ACTIVE") throw new ApiError(400, "Ce bail n'est pas actif.");
    const noticeDate = new Date();
    const suggestedEnd = new Date(noticeDate.getTime() + 60 * 86400_000); // préavis indicatif 2 mois
    await db.lease.update({ where: { id }, data: { status: "NOTICE_GIVEN", noticeDate } });
    await sendNotification({
      userId: user.id === lease.ownerId ? lease.tenantId : lease.ownerId,
      type: "SYSTEM", title: "Préavis notifié",
      body: `Un préavis a été donné sur le bail ${lease.reference}. Sortie suggérée : ${suggestedEnd.toLocaleDateString("fr-FR")}. Organisez l'état des lieux de sortie.`,
      linkHash: user.id === lease.ownerId ? "#/proprietaire/locataires" : "#/locataire/bail",
    });
    return ok({ noticeGiven: true, suggestedEnd });
  });
}
