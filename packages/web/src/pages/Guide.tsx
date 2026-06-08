import { BookOpen } from "lucide-react";

export function Guide() {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-lg font-semibold tracking-tight">Guide</h1>
			</div>
			<p className="text-sm text-muted-foreground">
				Setup guides, FAQ, and documentation will be available here in a future update.
			</p>
		</div>
	);
}
