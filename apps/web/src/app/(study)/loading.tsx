import { Skeleton } from "@sibol-cse/ui/components/skeleton";
export default function Loading() {
  return (
    <div role="status" aria-label="Loading study space" className="space-y-6">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-5 w-full max-w-96" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
