import { FolderPlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { DeviceGroup, DeviceWithChannels } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface DeviceGroupsProps {
	groups: DeviceGroup[];
	devices: DeviceWithChannels[];
	activeGroupId: string | null;
	onSelectGroup: (groupId: string | null) => void;
	onCreateGroup: (name: string, devices: string[]) => Promise<void>;
	onDeleteGroup: (groupId: string) => Promise<void>;
}

export function DeviceGroups({
	groups,
	devices,
	activeGroupId,
	onSelectGroup,
	onCreateGroup,
	onDeleteGroup,
}: DeviceGroupsProps) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2 flex-wrap">
				<button
					type="button"
					onClick={() => onSelectGroup(null)}
					className={cn(
						"inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium",
						"border transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						activeGroupId === null
							? "bg-primary text-primary-foreground border-primary"
							: "bg-background text-foreground border-border hover:bg-muted",
					)}
				>
					All Devices
				</button>

				{groups.map((group) => (
					<div key={group.id} className="inline-flex items-center gap-0.5">
						<button
							type="button"
							onClick={() => onSelectGroup(group.id)}
							className={cn(
								"inline-flex items-center rounded-l-md px-3 py-1.5 text-sm font-medium",
								"border border-r-0 transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								activeGroupId === group.id
									? "bg-primary text-primary-foreground border-primary"
									: "bg-background text-foreground border-border hover:bg-muted",
							)}
						>
							{group.name}
							<span className="ml-1.5 text-xs opacity-70">({group.devices.length})</span>
						</button>
						<button
							type="button"
							onClick={() => onDeleteGroup(group.id)}
							title={`Delete group "${group.name}"`}
							className={cn(
								"inline-flex items-center rounded-r-md px-1.5 py-1.5",
								"border transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								activeGroupId === group.id
									? "bg-primary text-primary-foreground border-primary hover:bg-primary/80"
									: "bg-background text-muted-foreground border-border hover:bg-destructive/10 hover:text-destructive",
							)}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
				))}

				<button
					type="button"
					onClick={() => setShowCreateDialog(true)}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
						"border border-dashed border-border text-muted-foreground",
						"hover:bg-muted hover:text-foreground transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					<FolderPlus className="h-3.5 w-3.5" />
					New Group
				</button>
			</div>

			{showCreateDialog && (
				<CreateGroupDialog
					devices={devices}
					onSubmit={async (name, selectedDevices) => {
						await onCreateGroup(name, selectedDevices);
						setShowCreateDialog(false);
					}}
					onClose={() => setShowCreateDialog(false)}
				/>
			)}
		</div>
	);
}

// ─── Create Group Dialog ─────────────────────────────────────────────────────

interface CreateGroupDialogProps {
	devices: DeviceWithChannels[];
	onSubmit: (name: string, devices: string[]) => Promise<void>;
	onClose: () => void;
}

function CreateGroupDialog({ devices, onSubmit, onClose }: CreateGroupDialogProps) {
	const [name, setName] = useState("");
	const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
	const [isSubmitting, setIsSubmitting] = useState(false);

	const toggleDevice = (serial: string) => {
		setSelectedDevices((prev) => {
			const next = new Set(prev);
			if (next.has(serial)) {
				next.delete(serial);
			} else {
				next.add(serial);
			}
			return next;
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || selectedDevices.size === 0) return;

		setIsSubmitting(true);
		try {
			await onSubmit(name.trim(), Array.from(selectedDevices));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium">Create Device Group</h3>
				<button
					type="button"
					onClick={onClose}
					className="text-muted-foreground hover:text-foreground"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<form onSubmit={handleSubmit} className="space-y-3">
				<div>
					<label htmlFor="group-name" className="block text-sm text-muted-foreground mb-1">
						Group Name
					</label>
					<input
						id="group-name"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Kitchen, Smoker, Outdoor"
						className={cn(
							"w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm",
							"focus:outline-none focus:ring-2 focus:ring-ring",
							"placeholder:text-muted-foreground/50",
						)}
						autoFocus
					/>
				</div>

				<div>
					<p className="text-sm text-muted-foreground mb-1">
						Select Devices ({selectedDevices.size} selected)
					</p>
					<div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-border p-2">
						{devices.length === 0 && (
							<p className="text-xs text-muted-foreground py-1">No devices available</p>
						)}
						{devices.map((item) => (
							<label
								key={item.device.serial}
								className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted cursor-pointer text-sm"
							>
								<input
									type="checkbox"
									checked={selectedDevices.has(item.device.serial)}
									onChange={() => toggleDevice(item.device.serial)}
									className="rounded border-border"
								/>
								<span>{item.device.label ?? item.device.serial}</span>
								<span className="text-xs text-muted-foreground ml-auto">
									{item.device.serial}
								</span>
							</label>
						))}
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!name.trim() || selectedDevices.size === 0 || isSubmitting}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium",
							"bg-primary text-primary-foreground",
							"hover:bg-primary/90 transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:opacity-50 disabled:pointer-events-none",
						)}
					>
						{isSubmitting ? "Creating..." : "Create Group"}
					</button>
				</div>
			</form>
		</div>
	);
}
