import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClose = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		email: string;
		password: string;
		close = mockClose;
		constructor(config: { email: string; password: string }) {
			this.email = config.email;
			this.password = config.password;
		}
	},
}));

import { ClientManager } from "../src/client-manager";

describe("ClientManager", () => {
	let manager: ClientManager;

	beforeEach(() => {
		vi.clearAllMocks();
		manager = new ClientManager();
	});

	it("creates a new client on first call", () => {
		const client = manager.getClient({ email: "a@b.com", password: "pass" });
		expect(client).toBeDefined();
		expect((client as any).email).toBe("a@b.com");
	});

	it("reuses client when credentials are identical", () => {
		const creds = { email: "a@b.com", password: "pass" };
		const c1 = manager.getClient(creds);
		const c2 = manager.getClient(creds);
		expect(c1).toBe(c2);
		expect(mockClose).not.toHaveBeenCalled();
	});

	it("creates new client when email changes", () => {
		const c1 = manager.getClient({ email: "a@b.com", password: "pass" });
		const c2 = manager.getClient({ email: "x@y.com", password: "pass" });
		expect(c1).not.toBe(c2);
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it("creates new client when password changes", () => {
		const c1 = manager.getClient({ email: "a@b.com", password: "old" });
		const c2 = manager.getClient({ email: "a@b.com", password: "new" });
		expect(c1).not.toBe(c2);
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it("close() disposes the client", () => {
		manager.getClient({ email: "a@b.com", password: "pass" });
		manager.close();
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it("close() is idempotent", () => {
		manager.getClient({ email: "a@b.com", password: "pass" });
		manager.close();
		manager.close();
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it("creates fresh client after close", () => {
		const c1 = manager.getClient({ email: "a@b.com", password: "pass" });
		manager.close();
		const c2 = manager.getClient({ email: "a@b.com", password: "pass" });
		expect(c1).not.toBe(c2);
	});
});
