import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";

const schema = z.object({
  idKind: z.enum(["ID_CARD", "PASSPORT", "DRIVER_LICENSE"]),
  idUrl: z.string().min(4),
  selfieUrl: z.string().min(4),
});

/** Dépôt KYC : pièce d'identité + selfie → statut PENDING, validation admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const data = await parseBody(req, schema);
    const pending = await db.kycDocument.findFirst({ where: { userId: user.id, status: "PENDING" } });
    if (pending) throw new ApiError(400, "Vos documents sont déjà en cours de vérification.");
    await db.kycDocument.createMany({
      data: [
        { userId: user.id, kind: data.idKind, fileUrl: data.idUrl },
        { userId: user.id, kind: "SELFIE", fileUrl: data.selfieUrl },
      ],
    });
    await db.user.update({ where: { id: user.id }, data: { kycStatus: "PENDING" } });
    await sendNotification({
      userId: user.id, type: "KYC",
      title: "Documents reçus",
      body: "Vos documents sont en cours de vérification. Réponse sous 24 h ouvrées.",
      linkHash: "#/compte",
    });
    return ok({ kycStatus: "PENDING" });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const docs = await db.kycDocument.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return ok({ kycStatus: user.kycStatus, docs });
  });
}
