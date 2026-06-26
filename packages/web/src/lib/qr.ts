const QR_L_BLOCKS: Record<number, { dataCodewords: number[]; eccCodewords: number }> = {
	1: { dataCodewords: [19], eccCodewords: 7 },
	2: { dataCodewords: [34], eccCodewords: 10 },
	3: { dataCodewords: [55], eccCodewords: 15 },
	4: { dataCodewords: [80], eccCodewords: 20 },
	5: { dataCodewords: [108], eccCodewords: 26 },
	6: { dataCodewords: [68, 68], eccCodewords: 18 },
	7: { dataCodewords: [78, 78], eccCodewords: 20 },
	8: { dataCodewords: [97, 97], eccCodewords: 24 },
	9: { dataCodewords: [116, 116], eccCodewords: 30 },
};

const ALIGNMENT_POSITIONS: Record<number, number[]> = {
	1: [],
	2: [6, 18],
	3: [6, 22],
	4: [6, 26],
	5: [6, 30],
	6: [6, 34],
	7: [6, 22, 38],
	8: [6, 24, 42],
	9: [6, 26, 46],
};

const FORMAT_POLY = 0x537;
const FORMAT_MASK = 0x5412;
const LOW_ERROR_CORRECTION_BITS = 1;
const MASK_PATTERN = 0;

class BitBuffer {
	readonly bits: number[] = [];

	append(value: number, length: number): void {
		for (let i = length - 1; i >= 0; i--) {
			this.bits.push((value >>> i) & 1);
		}
	}

	toBytes(): number[] {
		const bytes: number[] = [];
		for (let i = 0; i < this.bits.length; i += 8) {
			let value = 0;
			for (let j = 0; j < 8; j++) {
				value = (value << 1) | (this.bits[i + j] ?? 0);
			}
			bytes.push(value);
		}
		return bytes;
	}
}

function makeGaloisTables(): { exp: number[]; log: number[] } {
	const exp = Array<number>(512).fill(0);
	const log = Array<number>(256).fill(0);
	let value = 1;
	for (let i = 0; i < 255; i++) {
		exp[i] = value;
		log[value] = i;
		value <<= 1;
		if (value & 0x100) value ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) {
		exp[i] = exp[i - 255] ?? 0;
	}
	return { exp, log };
}

const GF = makeGaloisTables();

function gfMultiply(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF.exp[(GF.log[a] ?? 0) + (GF.log[b] ?? 0)] ?? 0;
}

function reedSolomonGenerator(degree: number): number[] {
	let generator = [1];
	for (let i = 0; i < degree; i++) {
		const next = Array<number>(generator.length + 1).fill(0);
		for (let j = 0; j < generator.length; j++) {
			next[j] = (next[j] ?? 0) ^ (generator[j] ?? 0);
			next[j + 1] = (next[j + 1] ?? 0) ^ gfMultiply(generator[j] ?? 0, GF.exp[i] ?? 0);
		}
		generator = next;
	}
	return generator;
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
	const generator = reedSolomonGenerator(degree);
	const remainder = Array<number>(degree).fill(0);
	for (const byte of data) {
		const factor = byte ^ (remainder.shift() ?? 0);
		remainder.push(0);
		for (let i = 0; i < degree; i++) {
			remainder[i] = (remainder[i] ?? 0) ^ gfMultiply(generator[i + 1] ?? 0, factor);
		}
	}
	return remainder;
}

function chooseVersion(byteLength: number): number {
	for (const [versionText, config] of Object.entries(QR_L_BLOCKS)) {
		const capacity = config.dataCodewords.reduce((sum, block) => sum + block, 0);
		const charCountBits = 8;
		const requiredBits = 4 + charCountBits + byteLength * 8;
		if (requiredBits <= capacity * 8) return Number(versionText);
	}
	throw new Error("Share link is too long for the built-in QR code generator");
}

function makeDataCodewords(bytes: Uint8Array, version: number): number[] {
	const config = QR_L_BLOCKS[version];
	if (!config) throw new Error(`Unsupported QR version: ${version}`);

	const totalDataCodewords = config.dataCodewords.reduce((sum, block) => sum + block, 0);
	const buffer = new BitBuffer();
	buffer.append(0b0100, 4);
	buffer.append(bytes.length, 8);
	for (const byte of bytes) buffer.append(byte, 8);

	const capacityBits = totalDataCodewords * 8;
	buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
	while (buffer.bits.length % 8 !== 0) buffer.append(0, 1);

	const data = buffer.toBytes();
	for (let pad = 0; data.length < totalDataCodewords; pad++) {
		data.push(pad % 2 === 0 ? 0xec : 0x11);
	}
	return data;
}

function addErrorCorrection(data: number[], version: number): number[] {
	const config = QR_L_BLOCKS[version];
	if (!config) throw new Error(`Unsupported QR version: ${version}`);

	const blocks: Array<{ data: number[]; ecc: number[] }> = [];
	let offset = 0;
	for (const blockSize of config.dataCodewords) {
		const block = data.slice(offset, offset + blockSize);
		blocks.push({ data: block, ecc: reedSolomonRemainder(block, config.eccCodewords) });
		offset += blockSize;
	}

	const result: number[] = [];
	const maxData = Math.max(...blocks.map((block) => block.data.length));
	for (let i = 0; i < maxData; i++) {
		for (const block of blocks) {
			if (i < block.data.length) result.push(block.data[i] ?? 0);
		}
	}
	for (let i = 0; i < config.eccCodewords; i++) {
		for (const block of blocks) {
			result.push(block.ecc[i] ?? 0);
		}
	}
	return result;
}

function createMatrix(size: number): { modules: boolean[][]; reserved: boolean[][] } {
	return {
		modules: Array.from({ length: size }, () => Array<boolean>(size).fill(false)),
		reserved: Array.from({ length: size }, () => Array<boolean>(size).fill(false)),
	};
}

function setModule(
	modules: boolean[][],
	reserved: boolean[][],
	x: number,
	y: number,
	value: boolean,
	isReserved = true,
): void {
	if (y < 0 || y >= modules.length || x < 0 || x >= modules.length) return;
	const moduleRow = modules[y];
	const reservedRow = reserved[y];
	if (!moduleRow || !reservedRow) return;
	moduleRow[x] = value;
	if (isReserved) reservedRow[x] = true;
}

function drawFinder(modules: boolean[][], reserved: boolean[][], x: number, y: number): void {
	for (let dy = -1; dy <= 7; dy++) {
		for (let dx = -1; dx <= 7; dx++) {
			const xx = x + dx;
			const yy = y + dy;
			if (yy < 0 || yy >= modules.length || xx < 0 || xx >= modules.length) continue;
			const dark =
				dx >= 0 &&
				dx <= 6 &&
				dy >= 0 &&
				dy <= 6 &&
				(dx === 0 ||
					dx === 6 ||
					dy === 0 ||
					dy === 6 ||
					(dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
			setModule(modules, reserved, xx, yy, dark);
		}
	}
}

function drawAlignment(
	modules: boolean[][],
	reserved: boolean[][],
	centerX: number,
	centerY: number,
): void {
	for (let dy = -2; dy <= 2; dy++) {
		for (let dx = -2; dx <= 2; dx++) {
			setModule(
				modules,
				reserved,
				centerX + dx,
				centerY + dy,
				Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
			);
		}
	}
}

function drawFunctionPatterns(modules: boolean[][], reserved: boolean[][], version: number): void {
	const size = modules.length;
	drawFinder(modules, reserved, 0, 0);
	drawFinder(modules, reserved, size - 7, 0);
	drawFinder(modules, reserved, 0, size - 7);

	for (let i = 8; i < size - 8; i++) {
		setModule(modules, reserved, i, 6, i % 2 === 0);
		setModule(modules, reserved, 6, i, i % 2 === 0);
	}

	const positions = ALIGNMENT_POSITIONS[version] ?? [];
	for (const y of positions) {
		for (const x of positions) {
			const overlapsFinder =
				(x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
			if (!overlapsFinder) drawAlignment(modules, reserved, x, y);
		}
	}

	for (let i = 0; i < 9; i++) {
		setModule(modules, reserved, 8, i, false);
		setModule(modules, reserved, i, 8, false);
		setModule(modules, reserved, size - 1 - i, 8, false);
		setModule(modules, reserved, 8, size - 1 - i, false);
	}
	setModule(modules, reserved, 8, size - 8, true);
}

function shouldMask(x: number, y: number): boolean {
	return (x + y) % 2 === 0;
}

function placeData(modules: boolean[][], reserved: boolean[][], codewords: number[]): void {
	const bits = codewords.flatMap((byte) =>
		Array.from({ length: 8 }, (_, index) => ((byte >>> (7 - index)) & 1) === 1),
	);
	let bitIndex = 0;
	let upward = true;

	for (let right = modules.length - 1; right >= 1; right -= 2) {
		if (right === 6) right--;
		for (let vertical = 0; vertical < modules.length; vertical++) {
			const y = upward ? modules.length - 1 - vertical : vertical;
			for (let column = 0; column < 2; column++) {
				const x = right - column;
				const reservedRow = reserved[y];
				const moduleRow = modules[y];
				if (!reservedRow || !moduleRow || reservedRow[x]) continue;
				const bit = bits[bitIndex++] ?? false;
				moduleRow[x] = bit !== shouldMask(x, y);
			}
		}
		upward = !upward;
	}
}

function formatBits(): number {
	const data = (LOW_ERROR_CORRECTION_BITS << 3) | MASK_PATTERN;
	let bits = data << 10;
	for (let i = 14; i >= 10; i--) {
		if (((bits >>> i) & 1) !== 0) bits ^= FORMAT_POLY << (i - 10);
	}
	return ((data << 10) | bits) ^ FORMAT_MASK;
}

function drawFormatBits(modules: boolean[][], reserved: boolean[][]): void {
	const size = modules.length;
	const bits = formatBits();
	const bit = (index: number) => ((bits >>> index) & 1) !== 0;

	for (let i = 0; i <= 5; i++) setModule(modules, reserved, 8, i, bit(i));
	setModule(modules, reserved, 8, 7, bit(6));
	setModule(modules, reserved, 8, 8, bit(7));
	setModule(modules, reserved, 7, 8, bit(8));
	for (let i = 9; i < 15; i++) setModule(modules, reserved, 14 - i, 8, bit(i));

	for (let i = 0; i < 8; i++) setModule(modules, reserved, size - 1 - i, 8, bit(i));
	for (let i = 8; i < 15; i++) setModule(modules, reserved, 8, size - 15 + i, bit(i));
	setModule(modules, reserved, 8, size - 8, true);
}

function makeQrMatrix(value: string): boolean[][] {
	const bytes = new TextEncoder().encode(value);
	const version = chooseVersion(bytes.length);
	const size = 17 + version * 4;
	const { modules, reserved } = createMatrix(size);
	drawFunctionPatterns(modules, reserved, version);
	const data = makeDataCodewords(bytes, version);
	placeData(modules, reserved, addErrorCorrection(data, version));
	drawFormatBits(modules, reserved);
	return modules;
}

function matrixToSvgDataUrl(matrix: boolean[][]): string {
	const quietZone = 4;
	const size = matrix.length + quietZone * 2;
	const path = matrix
		.flatMap((row, y) =>
			row.map((dark, x) => (dark ? `M${x + quietZone} ${y + quietZone}h1v1h-1z` : "")),
		)
		.filter(Boolean)
		.join("");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function generateQrCodeSvgDataUrl(value: string): string {
	return matrixToSvgDataUrl(makeQrMatrix(value));
}
