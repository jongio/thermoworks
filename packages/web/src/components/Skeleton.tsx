import { cn } from "../lib/utils.ts";

interface SkeletonProps {
	className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
	return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
}

export function DeviceCardSkeleton() {
	return (
		<article className="rounded-lg border border-border bg-card p-4 shadow-sm">
			{/* Header */}
			<div className="flex items-start justify-between gap-2 mb-3">
				<div className="min-w-0 flex-1 space-y-2">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-3 w-48" />
				</div>
				<Skeleton className="h-4 w-16" />
			</div>
			{/* Badges */}
			<div className="flex gap-2 mb-3">
				<Skeleton className="h-4 w-14" />
				<Skeleton className="h-4 w-16" />
				<Skeleton className="h-4 w-12" />
			</div>
			{/* Channel readings */}
			<div className="space-y-2">
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
			</div>
			{/* History button */}
			<Skeleton className="mt-3 h-8 w-full rounded-md" />
		</article>
	);
}

export function DeviceListSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: count }, (_, i) => (
				<DeviceCardSkeleton key={i} />
			))}
		</div>
	);
}

export function ChartSkeleton() {
	return (
		<div className="space-y-2">
			<Skeleton className="h-48 w-full rounded-md" />
			<div className="flex gap-2 justify-center">
				<Skeleton className="h-3 w-12" />
				<Skeleton className="h-3 w-12" />
				<Skeleton className="h-3 w-12" />
			</div>
		</div>
	);
}

export function EventListSkeleton({ count = 5 }: { count?: number }) {
	return (
		<div className="space-y-2">
			{Array.from({ length: count }, (_, i) => (
				<div key={i} className="flex items-center gap-3 p-3 rounded-md border border-border">
					<Skeleton className="h-8 w-8 rounded-full" />
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-1/2" />
					</div>
					<Skeleton className="h-3 w-16" />
				</div>
			))}
		</div>
	);
}
