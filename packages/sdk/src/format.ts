/** Format a date as a human-readable relative time string. */
export function formatTimeAgo(date: Date | null): string {
	if (!date) return "Never";
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 0) return "Just now";
	if (seconds < 60) return "Just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
