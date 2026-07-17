import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	FIXTURE_ARCHIVES,
	FIXTURE_CHANNELS,
	FIXTURE_DEVICES,
	FIXTURE_LATEST_FIRMWARE,
} from "../dist/testing/index.js";

const target = join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	".github",
	"extensions",
	"thermoworks",
	"test",
	"shared-fixtures.json",
);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
	target,
	`${JSON.stringify(
		{
			archives: FIXTURE_ARCHIVES,
			channels: FIXTURE_CHANNELS,
			devices: FIXTURE_DEVICES,
			latestFirmware: FIXTURE_LATEST_FIRMWARE,
		},
		null,
		2,
	)}\n`,
);
