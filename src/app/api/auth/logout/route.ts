import { handle, ok } from "@/lib/api";
import { clearSessionCookies } from "@/lib/auth";

export async function POST() {
  return handle(async () => {
    await clearSessionCookies();
    return ok({ loggedOut: true });
  });
}
