// ============================================================
// LocaBénin — Mini-service temps réel (socket.io, port 3003)
// Rôle : relais des notifications et messages en temps réel.
//  • Le serveur Next émet des événements via le bridge (client socket.io
//    interne, connexion 127.0.0.1:3003) : event "bridge" { room, event, data }.
//  • Le navigateur se connecte via la passerelle Caddy : io("/?XTransformPort=3003")
//    et rejoint des rooms (user:{id}, conv:{id}) puis reçoit "bridge-event".
// La persistance reste côté Next/Prisma : ce service est un pur bus temps réel.
// ============================================================

import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  // NE PAS changer le path : utilisé par Caddy pour router vers ce port
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

io.on("connection", (socket) => {
  console.log(`[chat-service] connexion ${socket.id}`);

  // Le navigateur ou le bridge serveur rejoint une room métier
  socket.on("join-room", (data: { room: string }) => {
    if (typeof data?.room !== "string" || data.room.length > 128) return;
    socket.join(data.room);
  });

  socket.on("leave-room", (data: { room: string }) => {
    if (typeof data?.room !== "string" || data.room.length > 128) return;
    socket.leave(data.room);
  });

  // Bridge serveur→serveur : diffuse l'événement à la room cible
  socket.on("bridge", (payload: { room: string; event: string; data: unknown }) => {
    if (typeof payload?.room !== "string" || typeof payload?.event !== "string") return;
    if (payload.room.length > 128 || payload.event.length > 64) return;
    io.to(payload.room).emit("bridge-event", { room: payload.room, event: payload.event, data: payload.data });
  });

  // Ping applicatif (supervision)
  socket.on("ping-app", (cb: (t: number) => void) => {
    if (typeof cb === "function") cb(Date.now());
  });

  socket.on("disconnect", () => {
    console.log(`[chat-service] déconnexion ${socket.id}`);
  });

  socket.on("error", (error) => {
    console.error(`[chat-service] erreur socket ${socket.id}`, error);
  });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[chat-service] serveur temps réel sur le port ${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
