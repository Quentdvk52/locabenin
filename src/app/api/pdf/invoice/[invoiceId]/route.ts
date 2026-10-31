import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { buildInvoicePdf } from "@/lib/pdf";
import { formatDate } from "@/lib/finance";

/** Facture d'abonnement PDF — propriétaire concerné ou admin. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { invoiceId } = await ctx.params;
    const invoice = await db.subscriptionInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return fail(404, "Facture introuvable.");
    if (invoice.ownerId !== user.id && !user.isAdmin) throw new ApiError(403, "Document réservé au propriétaire.");
    const owner = await db.user.findUnique({ where: { id: invoice.ownerId } });
    const lines = (JSON.parse(invoice.lineItemsJson) as Array<{ label: string; price: number; listingCount: number }>);
    const pdf = await buildInvoicePdf({
      invoiceRef: invoice.id.slice(-8).toUpperCase(),
      ownerName: owner?.fullName ?? "—", ownerPhone: owner?.phone ?? "—",
      periodLabel: `${formatDate(invoice.periodStart)} → ${formatDate(invoice.periodEnd)}`,
      lines, total: invoice.amount, status: invoice.status, dueDate: invoice.dueDate,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-abonnement.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
