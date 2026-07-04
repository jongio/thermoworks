import type { Account, BillingPlan } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;
const dim = (text: string): string => `\x1b[2m${text}\x1b[0m`;

/** Format a monthly billing amount as a currency-style string. */
function formatAmount(amount: number): string {
	if (amount === 0) {
		return "Free";
	}
	return `$${amount.toFixed(2)}/mo`;
}

function formatAccount(account: Account, plan: BillingPlan | null): string {
	const lines = [bold("Account")];
	lines.push(`  Name:       ${account.name ?? dim("N/A")}`);
	lines.push(`  Account ID: ${account.accountId}`);
	lines.push(`  Type:       ${account.type ?? dim("N/A")}`);
	lines.push(
		`  Created:    ${
			account.createdOn
				? account.createdOn.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					})
				: dim("N/A")
		}`,
	);

	lines.push("");
	lines.push(bold("Billing plan"));
	if (plan) {
		lines.push(`  Plan:       ${plan.name}`);
		if (plan.description) {
			lines.push(`  Details:    ${plan.description}`);
		}
		lines.push(`  Price:      ${formatAmount(plan.monthlyAmount)}`);
		lines.push(`  Devices:    ${plan.deviceCount}`);
	} else {
		lines.push(`  ${dim("No billing plan on file.")}`);
	}

	return lines.join("\n");
}

/** Show account details and the current billing plan. */
export async function account(options: OutputOptions = { json: false }): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const [acct, plan] = await Promise.all([client.getAccount(), client.getBillingPlan()]);

		if (options.json) {
			outputJson({ account: acct, billingPlan: plan });
			return;
		}

		console.log(formatAccount(acct, plan));
	} finally {
		client.close();
	}
}
