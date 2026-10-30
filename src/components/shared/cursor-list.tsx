"use client";

// ============================================================
// LocaBénin — Liste à défilement infini (pagination keyset/curseur)
// Aucun offset : le serveur renvoie nextCursor, on charge au scroll.
// Skeletons + aucune saccade (hauteurs stables).
// ============================================================

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ListingCard, ListingCardSkeleton, type ListingCardData } from "./listing-card";
import { EmptyState } from "./states";
import { apiGet } from "@/lib/client/session";

export interface CursorPage {
  items: ListingCardData[];
  nextCursor: string | null;
  total: number;
}

export function InfiniteListings({
  endpoint,
  emptyTitle = "Aucune offre trouvée",
  emptyDescription,
  emptyAction,
  renderItem,
  className,
}: {
  endpoint: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href: string };
  renderItem?: (l: ListingCardData) => React.ReactNode;
  className?: string;
}) {
  const q = useInfiniteQuery({
    queryKey: ["listings-infinite", endpoint],
    queryFn: ({ pageParam }) => apiGet<CursorPage>(pageParam ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${pageParam}` : endpoint),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [q]);

  if (q.isLoading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (q.isError) {
    return <EmptyState title="Impossible de charger les offres" description="Vérifiez votre connexion puis réessayez." className={className} />;
  }
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyAction?.label}
        actionHref={emptyAction?.href}
        className={className}
      />
    );
  }
  return (
    <div className={className}>
      {renderItem ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((l) => <div key={l.id}>{renderItem(l)}</div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
      <div ref={sentinel} aria-hidden className="h-1" />
      {q.isFetchingNextPage && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      )}
      {!q.hasNextPage && items.length > 8 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Vous avez vu toutes les offres ✓</p>
      )}
    </div>
  );
}
