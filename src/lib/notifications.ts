// ============================================================
// LocaBénin — Notifications multi-canaux
// Interface `NotificationChannel` : IN_APP (toujours, en base),
// EMAIL (Resend si clé API, sinon log), SMS / WHATSAPP (log en sandbox,
// branchement Africa's Talking + WhatsApp Cloud API en production).
// Les notifications IN_APP sont aussi poussées en temps réel via le
// mini-service socket.io (bridge serveur→serveur en localhost).
// ============================================================

import "server-only";
import { db } from "./db";

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  linkHash?: string;
  data?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;
  send(payload: NotificationPayload): Promise<void>;
}

/** Canal in-app : écrit en base (toujours actif). */
export class InAppChannel implements NotificationChannel {
  readonly name = "IN_APP";
  async send(payload: NotificationPayload) {
    await db.notification.create({
      data: {
        userId: payload.userId, type: payload.type, title: payload.title,
        body: payload.body, linkHash: payload.linkHash ?? null,
        dataJson: payload.data ? JSON.stringify(payload.data) : null,
      },
    });
  }
}

/** Canal email : Resend en production (RESEND_API_KEY), log sinon. */
export class EmailChannel implements NotificationChannel {
  readonly name = "EMAIL";
  async send(payload: NotificationPayload) {
    const user = await db.user.findUnique({ where: { id: payload.userId }, select: { email: true } });
    if (!user?.email) return;
    if (!process.env.RESEND_API_KEY) {
      console.log(`[EMAIL→log] à ${user.email} : ${payload.title} — ${payload.body}`);
      return;
    }
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "LocaBénin <notifications@locabenin.bj>",
          to: user.email,
          subject: payload.title,
          html: `<div style="font-family:sans-serif"><h2>${payload.title}</h2><p>${payload.body}</p></div>`,
        }),
      });
    } catch (e) {
      console.error("[EMAIL] échec d'envoi Resend", e);
    }
  }
}

/** Canaux SMS / WhatsApp : logs en sandbox, agrégateurs en production. */
export class SmsChannel implements NotificationChannel {
  readonly name = "SMS";
  async send(payload: NotificationPayload) {
    const user = await db.user.findUnique({ where: { id: payload.userId }, select: { phone: true } });
    if (!user?.phone) return;
    console.log(`[SMS→log] à ${user.phone} : ${payload.title} — ${payload.body}`);
  }
}

export class WhatsAppChannel implements NotificationChannel {
  readonly name = "WHATSAPP";
  async send(payload: NotificationPayload) {
    const user = await db.user.findUnique({ where: { id: payload.userId }, select: { phone: true, whatsapp: true } });
    const to = user?.whatsapp ?? user?.phone;
    if (!to) return;
    console.log(`[WHATSAPP→log] à ${to} : ${payload.title} — ${payload.body}`);
  }
}

// ---------- Bridge temps réel vers le mini-service socket.io ----------

let bridgeSocket: import("socket.io-client").Socket | null = null;

async function getBridge() {
  if (bridgeSocket?.connected) return bridgeSocket;
  try {
    const { io } = await import("socket.io-client");
    bridgeSocket = io("http://127.0.0.1:3003", { transports: ["websocket"], reconnectionAttempts: 2, timeout: 3000 });
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1500);
      bridgeSocket!.on("connect", () => { clearTimeout(t); resolve(); });
      bridgeSocket!.on("connect_error", () => { clearTimeout(t); resolve(); });
    });
    return bridgeSocket;
  } catch {
    return null;
  }
}

/** Émet un événement temps réel vers un utilisateur connecté (room user:{id}). */
export async function emitRealtime(room: string, event: string, data: unknown) {
  const socket = await getBridge();
  socket?.emit("bridge", { room, event, data });
}

/** Crée une notification in-app + canaux additionnels + poussée temps réel. */
export async function sendNotification(payload: NotificationPayload, extraChannels: NotificationChannel[] = []) {
  await new InAppChannel().send(payload);
  for (const ch of extraChannels) {
    try { await ch.send(payload); } catch (e) { console.error(`[NOTIF:${ch.name}]`, e); }
  }
  await emitRealtime(`user:${payload.userId}`, "notification", { type: payload.type, title: payload.title, body: payload.body, linkHash: payload.linkHash });
}

export const channels = {
  inApp: new InAppChannel(),
  email: new EmailChannel(),
  sms: new SmsChannel(),
  whatsapp: new WhatsAppChannel(),
};
