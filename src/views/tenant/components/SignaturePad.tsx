"use client";

// ============================================================
// LocaBénin — Espace Locataire : pad de signature tactile
// Canvas avec pointeurs (souris + tactile), effacement et export
// PNG (data URL) transmis au parent via onChange.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  /** Reçoit la signature exportée (PNG data URL) ou null après effacement. */
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

export function SignaturePad({ onChange, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const [touched, setTouched] = useState(false);

  const ctxOf = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1c1917";
    return ctx;
  }, []);

  // Dimensionnement net (devicePixelRatio) + fond blanc
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(300, Math.round(rect.width * dpr));
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
    };
    setup();
    const ro = new ResizeObserver(() => {
      // Le redimensionnement réinitialise la signature (surface vierge)
      hasInk.current = false;
      setTouched(false);
      onChange(null);
      setup();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const posOf = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = posOf(e);
    setTouched(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ctxOf();
    const from = lastPoint.current;
    if (!ctx || !from) return;
    const to = posOf(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    lastPoint.current = to;
    hasInk.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk.current) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = ctxOf();
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
    setTouched(false);
    onChange(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative rounded-xl border-2 border-dashed border-border bg-white p-1">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Zone de signature — dessinez votre signature au doigt ou à la souris"
          className="h-44 w-full touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!touched && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-stone-400">
            <PenLine className="size-4" aria-hidden />
            Signez ici au doigt ou à la souris
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Signature électronique — horodatée et archivée.</p>
        <Button type="button" variant="outline" size="sm" onClick={clear} aria-label="Effacer la signature">
          <Eraser className="size-4" aria-hidden /> Effacer
        </Button>
      </div>
    </div>
  );
}
