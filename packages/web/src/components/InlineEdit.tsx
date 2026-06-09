import { Check, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils.ts";

interface InlineEditProps {
	value: string;
	onSave: (value: string) => Promise<{ success: boolean }>;
	placeholder?: string;
	maxLength?: number;
	className?: string;
}

/**
 * Click-to-edit inline text component.
 *
 * Display mode: shows text with a subtle pencil icon on hover.
 * Edit mode: input field with confirm/cancel. Enter saves, Escape cancels.
 * Shows loading state during save and error feedback on failure.
 */
export function InlineEdit({
	value,
	onSave,
	placeholder = "Enter name",
	maxLength = 50,
	className,
}: InlineEditProps) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Sync draft when value prop changes externally
	useEffect(() => {
		if (!editing) {
			setDraft(value);
		}
	}, [value, editing]);

	// Focus input on entering edit mode
	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const enterEdit = useCallback(() => {
		setEditing(true);
		setError(null);
	}, []);

	const cancel = useCallback(() => {
		setEditing(false);
		setDraft(value);
		setError(null);
	}, [value]);

	const validate = useCallback(
		(text: string): string | null => {
			const trimmed = text.trim();
			if (trimmed.length === 0) return "Name cannot be empty";
			if (trimmed.length > maxLength) return `Name must be ${maxLength} characters or fewer`;
			return null;
		},
		[maxLength],
	);

	const save = useCallback(async () => {
		const trimmed = draft.trim();
		const validationError = validate(trimmed);
		if (validationError) {
			setError(validationError);
			return;
		}

		// No change - just exit edit mode
		if (trimmed === value) {
			setEditing(false);
			setError(null);
			return;
		}

		setSaving(true);
		setError(null);
		try {
			const result = await onSave(trimmed);
			if (result.success) {
				setEditing(false);
				setDraft(trimmed);
			} else {
				setError("Failed to save");
			}
		} catch {
			setError("Failed to save");
		} finally {
			setSaving(false);
		}
	}, [draft, value, validate, onSave]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault();
				save();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cancel();
			}
		},
		[save, cancel],
	);

	if (editing) {
		return (
			<div className={cn("inline-flex items-center gap-1.5", className)}>
				<input
					ref={inputRef}
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={() => {
						// Allow button clicks to register before closing
						setTimeout(() => {
							if (inputRef.current && !inputRef.current.contains(document.activeElement)) {
								cancel();
							}
						}, 150);
					}}
					maxLength={maxLength}
					placeholder={placeholder}
					disabled={saving}
					aria-label="Device name"
					aria-invalid={error ? "true" : undefined}
					aria-describedby={error ? "inline-edit-error" : undefined}
					className={cn(
						"rounded-md border px-2 py-1 text-2xl font-bold tracking-tight",
						"bg-background text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50",
						error ? "border-destructive" : "border-input",
					)}
				/>
				<button
					type="button"
					onClick={save}
					disabled={saving}
					aria-label="Save name"
					className={cn(
						"rounded-md p-1.5 text-muted-foreground hover:text-foreground",
						"hover:bg-muted transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50",
					)}
				>
					<Check className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={cancel}
					disabled={saving}
					aria-label="Cancel editing"
					className={cn(
						"rounded-md p-1.5 text-muted-foreground hover:text-foreground",
						"hover:bg-muted transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50",
					)}
				>
					<X className="h-4 w-4" />
				</button>
				{error && (
					<span id="inline-edit-error" className="text-xs text-destructive" role="alert">
						{error}
					</span>
				)}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={enterEdit}
			title="Click to rename"
			aria-label={`Rename ${value}`}
			className={cn(
				"group inline-flex items-center gap-2 rounded-md",
				"hover:bg-muted/50 transition-colors -ml-1 px-1",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
		>
			<span className="text-2xl font-bold tracking-tight truncate">{value}</span>
			<Pencil
				className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
				aria-hidden="true"
			/>
		</button>
	);
}
