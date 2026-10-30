// ============================================================
// LocaBénin — GET /api/admin/users/[id]
// Détail d'un utilisateur : rôles, KYC, counts (offres, baux,
// paiements, signalements) + dernières notifications.
// ============================================================

import { NextRequest } from "next/server";
import { handle, ok, requireAdmin, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;

    const user = await db.user.findUnique({
      where: { id },
      include: {
        userRoles: { select: { role: true, adminSubRole: true, isDefault: true, createdAt: true } },
        _count: {
          select: {
            listings: true,
            leasesAsOwner: true,
            leasesAsTenant: true,
            payments: true,
            reportsFiled: true,
            commissions: true,
            payouts: true,
            kycDocuments: true,
          },
        },
      },
    });
    if (!user) throw new ApiError(404, "Utilisateur introuvable.");

    return ok({
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      whatsapp: user.whatsapp,
      avatarUrl: user.avatarUrl,
      status: user.status,
      kycStatus: user.kycStatus,
      phoneVerified: user.phoneVerified,
      createdAt: user.createdAt,
      roles: user.userRoles.map((r) => ({ role: r.role, adminSubRole: r.adminSubRole, isDefault: r.isDefault })),
      counts: {
        listings: user._count.listings,
        leasesAsOwner: user._count.leasesAsOwner,
        leasesAsTenant: user._count.leasesAsTenant,
        payments: user._count.payments,
        reportsFiled: user._count.reportsFiled,
        commissions: user._count.commissions,
        payouts: user._count.payouts,
        kycDocuments: user._count.kycDocuments,
      },
    });
  });
}
