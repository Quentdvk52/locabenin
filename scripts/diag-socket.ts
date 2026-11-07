// Diagnostic pont temps réel : client socket.io → passerelle Caddy → chat-service
import { io } from "socket.io-client";

const GATEWAY = "http://localhost:3000/?XTransformPort=3003";
const DIRECT = "http://127.0.0.1:3003";

function probe(label: string, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = io(url, { transports: ["websocket", "polling"], reconnectionAttempts: 1, timeout: 6000 });
    let ok = false;
    s.on("connect", () => {
      ok = true;
      console.log(`✓ ${label}: CONNECTÉ (transport=${s.io.engine.transport.name})`);
      // Rejoindre une room de test puis écouter le relay
      s.emit("join-room", { room: "test-room" });
      s.emit("ping-app", (t: number) => console.log(`  ping-app → ${Date.now() - t} ms`));
      setTimeout(() => { s.disconnect(); resolve(true); }, 800);
    });
    s.on("connect_error", (e: Error) => console.log(`✗ ${label}: connect_error ${e.message}`));
    s.io.on("reconnect_failed", () => console.log(`✗ ${label}: reconnect_failed`));
    setTimeout(() => { if (!ok) { console.log(`✗ ${label}: timeout`); s.disconnect(); resolve(false); } }, 8000);
  });
}

// Test relay complet : A via passerelle, émission serveur → A doit recevoir
async function relayTest(): Promise<void> {
  const a = io(GATEWAY, { transports: ["websocket", "polling"], timeout: 8000 });
  const received = await new Promise<string>((resolve) => {
    a.on("connect", () => {
      console.log("✓ relay: A connecté via passerelle");
      a.emit("join-room", { room: "relay-test" });
      setTimeout(() => {
        // Comme le fait le serveur Next (notifications.ts)
        const srv = io(DIRECT, { transports: ["websocket"], timeout: 6000 });
        srv.on("connect", () => {
          console.log("✓ relay: émetteur serveur connecté à 3003");
          srv.emit("bridge", { room: "relay-test", event: "message", data: { hello: "world" } });
        });
        srv.on("connect_error", (e: Error) => console.log(`✗ relay: émetteur serveur KO: ${e.message}`));
      }, 500);
      a.on("bridge-event", (p: unknown) => { resolve(JSON.stringify(p)); });
    });
    a.on("connect_error", (e: Error) => resolve(`CONNECT_ERROR ${e.message}`));
    setTimeout(() => resolve("TIMEOUT_10S"), 10000);
  });
  console.log(`Relay bridge-event reçu par A: ${received}`);
  a.disconnect();
}

const g = await probe("Passerelle /?XTransformPort=3003", GATEWAY);
const d = await probe("Direct 127.0.0.1:3003", DIRECT);
if (g) await relayTest();
process.exit(0);
