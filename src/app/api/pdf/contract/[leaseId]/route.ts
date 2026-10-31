import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { buildContractPdf } from "@/lib/pdf";

/** Contrat de location PDF — réservé aux parties du bail. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ leaseId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { leaseId } = await ctx.params;
    const lease = await db.lease.findUnique({
      where: { id: leaseId },
      include: {
        listing: { include: { depositOptions: true, area: { include: { commune: true } } } },
        owner: true, tenant: true,
      },
    });
    if (!lease) return fail(404, "Bail introuvable.");
    if (lease.ownerId !== user.id && lease.tenantId !== user.id && !user.isAdmin) {
      throw new ApiError(403, "Document réservé aux parties du bail.");
    }
    const pdf = await buildContractPdf({
      leaseRef: lease.reference, kind: lease.kind,
      ownerName: lease.owner.fullName, ownerPhone: lease.owner.phone ?? "—",
      tenantName: lease.tenant.fullName, tenantPhone: lease.tenant.phone ?? "—",
      listingTitle: lease.listing.title, listingType: lease.listing.type,
      listingAddress: `${lease.listing.addressText ?? ""}, ${lease.listing.area?.commune?.name ?? "Bénin"}`,
      rentAmount: lease.rentAmount, rentPeriod: lease.rentPeriod,
      depositAmount: lease.depositAmount, advanceMonths: lease.advanceMonths,
      depositOptions: lease.listing.depositOptions.map((d) => ({ label: d.label, amount: d.amount })),
      commissionNote: lease.commissionTotal > 0
        ? `Service de mise en relation par démarcheur partenaire : commission totale de ${lease.commissionTotal} FCFA (½ mois de loyer), dont ${lease.commissionTenantShare} FCFA à la charge du locataire et ${lease.commissionOwnerShare} FCFA à la charge du propriétaire.`
        : null,
      startDate: lease.startDate, endDate: lease.endDate,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="contrat-${lease.reference}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
