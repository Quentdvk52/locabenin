import { handle, ok } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateVisitorId } from "@/lib/auth";

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    await getOrCreateVisitorId(); // garantit le cookie visiteur (affiliation)
    return ok(user);
  });
}
