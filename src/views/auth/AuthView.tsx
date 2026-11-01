"use client";

// ============================================================
// LocaBénin — Connexion / Inscription
// Inscription 100 % gratuite par téléphone (OTP 6 chiffres, TTL 5 min,
// 3 envois / 10 min). Google OAuth : branchement production (désactivé ici,
// voir docs/DECISIONS.md). Bannière démo : le code OTP s'affiche à l'écran.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Phone, ShieldCheck, Home, BriefcaseBusiness, UserRoundSearch, Loader2, ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { apiSend, ApiClientError } from "@/lib/client/session";
import { toast } from "sonner";
import { Logo } from "@/components/layout/chrome";
import { cn, normalizePhone } from "@/lib/utils";

type Step = "phone" | "otp" | "register";
type RegisterRole = "OWNER" | "TENANT" | "AGENT";

const ROLE_CHOICES: Array<{ role: RegisterRole; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { role: "OWNER", label: "Propriétaire", desc: "Publier mes biens et encaisser mes loyers", icon: Home },
  { role: "TENANT", label: "Locataire", desc: "Chercher un logement et payer en ligne", icon: UserRoundSearch },
  { role: "AGENT", label: "Démarcheur", desc: "Partager des offres et gagner des commissions", icon: BriefcaseBusiness },
];

export default function AuthView() {
  const { user, refresh } = useSession();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+229");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RegisterRole>("TENANT");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      const map: Record<string, string> = { OWNER: "#/proprietaire", TENANT: "#/locataire", AGENT: "#/demarcheur", ADMIN: "#/admin" };
      navigate(map[user.activeRole] ?? "/", { replace: true });
    }
  }, [user]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (step === "otp") otpRef.current?.querySelector("input")?.focus();
  }, [step]);

  async function sendOtp() {
    setLoading(true);
    const cleanPhone = normalizePhone(phone);
    setPhone(cleanPhone);
    try {
      const data = await apiSend<{ devCode: string | null; destination: string }>("/api/auth/send-otp", "POST", { phone: cleanPhone });
      setDevCode(data.devCode);
      setStep("otp");
      setCountdown(45);
      toast.success("Code envoyé par SMS");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Envoi impossible");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const data = await apiSend<{ isNew: boolean }>("/api/auth/verify-otp", "POST", { phone, code });
      if (data.isNew) {
        setStep("register");
      } else {
        await refresh();
        toast.success("Connexion réussie");
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Code invalide");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function completeRegistration() {
    if (fullName.trim().length < 2) {
      toast.error("Indiquez votre nom complet.");
      return;
    }
    setLoading(true);
    try {
      await apiSend("/api/auth/verify-otp", "POST", { phone, code, fullName: fullName.trim(), role });
      await refresh();
      toast.success("Bienvenue sur LocaBénin !");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Inscription impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="mb-8 text-center">
          <div className="flex justify-center"><Logo /></div>
          <h1 className="mt-6 font-display text-2xl font-bold">Bienvenue sur LocaBénin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La plateforme de référence de la location immobilière au Bénin. Inscription gratuite.
          </p>
        </div>

        {devCode && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong>Mode démonstration</strong> — le SMS n&apos;est pas envoyé : votre code est <strong className="font-mono text-base tracking-widest">{devCode}</strong>
            </p>
          </div>
        )}

        {step === "phone" && (
          <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft">
            <div className="space-y-2">
              <Label htmlFor="phone">Numéro de téléphone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="phone" type="tel" inputMode="tel" dir="ltr"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+229 01 97 00 00 01"
                  className="pl-9 text-base" aria-describedby="phone-help"
                  onKeyDown={(e) => { if (e.key === "Enter" && phone.length >= 8) void sendOtp(); }}
                />
              </div>
              <p id="phone-help" className="text-xs text-muted-foreground">
                Format international, ex. +2290197000001. Nous vous envoyons un code à 6 chiffres.
              </p>
            </div>
            <Button className="w-full" onClick={sendOtp} disabled={loading || phone.length < 8}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Recevoir mon code"}
            </Button>
            <div className="relative py-1 text-center">
              <span className="relative z-10 bg-card px-3 text-xs text-muted-foreground">ou</span>
              <span className="absolute left-0 top-1/2 h-px w-full bg-border" aria-hidden />
            </div>
            <Button variant="outline" className="w-full" disabled title="Connexion Google disponible en production">
              <svg className="size-4" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
              Continuer avec Google
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">PROD</span>
            </Button>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft" ref={otpRef}>
            <button onClick={() => setStep("phone")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Modifier le numéro
            </button>
            <p className="text-sm text-muted-foreground">
              Code envoyé au <strong className="text-foreground">{phone}</strong>. Il expire dans 5 minutes.
            </p>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button className="w-full" onClick={verifyOtp} disabled={loading || code.length !== 6}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Vérifier le code"}
            </Button>
            <button
              className="w-full text-center text-sm text-primary disabled:text-muted-foreground"
              disabled={countdown > 0}
              onClick={sendOtp}
            >
              {countdown > 0 ? `Renvoyer un code dans ${countdown} s` : "Renvoyer un code"}
            </button>
          </div>
        )}

        {step === "register" && (
          <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-soft">
            <div className="space-y-2">
              <Label htmlFor="fullName">Votre nom complet</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex. Aïcha Gounongbé" />
            </div>
            <div className="space-y-2">
              <Label>Je suis…</Label>
              <div className="grid gap-2">
                {ROLE_CHOICES.map((c) => (
                  <button
                    key={c.role}
                    onClick={() => setRole(c.role)}
                    aria-pressed={role === c.role}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                      role === c.role ? "border-primary bg-primary/5 shadow-glow" : "hover:bg-secondary/60",
                    )}
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", role === c.role ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                      <c.icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">{c.desc}</span>
                    </span>
                    {role === c.role && <ShieldCheck className="ml-auto size-5 text-primary" aria-hidden />}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Vous pourrez cumuler plusieurs rôles plus tard (ex. propriétaire ET démarcheur) depuis votre profil.
              </p>
            </div>
            <Button className="w-full" onClick={completeRegistration} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Créer mon compte gratuit"}
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En continuant, vous acceptez les{" "}
          <button className="underline hover:text-foreground" onClick={() => navigate("/a-propos")}>conditions générales</button>{" "}
          et la politique de confidentialité de LocaBénin.
        </p>
      </motion.div>
    </div>
  );
}
