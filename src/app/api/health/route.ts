import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Sondes de santé (monitoring production). */
export async function GET() {
  try {
    await db.user.count();
    return NextResponse.json({ ok: true, service: "locabenin", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, service: "locabenin", db: "down" }, { status: 503 });
  }
}
