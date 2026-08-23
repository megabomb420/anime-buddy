import { cn } from "@/lib/utils";

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function PosterSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("shrink-0", className)}>
      <Shimmer className="aspect-[2/3] w-full rounded-lg" />
      <Shimmer className="mt-2 h-3 w-4/5" />
    </div>
  );
}

export function HeroSkeleton() {
  return <Shimmer className="h-[min(78dvh,640px)] min-h-[460px] w-full rounded-none" />;
}
