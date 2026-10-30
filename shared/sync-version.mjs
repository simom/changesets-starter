#!/usr/bin/env node
/**
 * Post-changeset version sync driven by release-kit.config.json at the repo root.
 *
 * Strategies:
 * - none: no-op (config may omit sync or set strategy "none")
 * - json-field: copy root package.json version into a string field in another JSON file
 * - max-semver: set root package.json version to the highest semver among listed packages
 *
 * Usage:
 *   node ./scripts/sync-version.mjs
 *   node ./scripts/sync-version.mjs --check
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const CONFIG_PATH = join(root, "release-kit.config.json");
const ROOT_PKG_PATH = join(root, "package.json");

const checkOnly = process.argv.includes("--check");

function fail(message) {
	console.error(`sync-version: ${message}`);
	process.exit(1);
}

function loadConfig() {
	if (!existsSync(CONFIG_PATH)) {
		fail(
			`missing release-kit.config.json at repo root. Re-run the changesets-starter init, or create the file.`,
		);
	}
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
	} catch (error) {
		fail(`could not parse release-kit.config.json: ${error.message}`);
	}
}

function readRootVersion() {
	const pkg = JSON.parse(readFileSync(ROOT_PKG_PATH, "utf8"));
	if (!pkg.version || typeof pkg.version !== "string") {
		fail("missing version in package.json");
	}
	return pkg.version;
}

/** @param {string} version */
function parseSemver(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
	if (!match) {
		fail(`invalid semver "${version}"`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ?? null,
		raw: version,
	};
}

/** @param {ReturnType<typeof parseSemver>} a @param {ReturnType<typeof parseSemver>} b */
function compareSemver(a, b) {
	if (a.major !== b.major) {
		return a.major - b.major;
	}
	if (a.minor !== b.minor) {
		return a.minor - b.minor;
	}
	if (a.patch !== b.patch) {
		return a.patch - b.patch;
	}
	if (a.prerelease === null && b.prerelease === null) {
		return 0;
	}
	if (a.prerelease === null) {
		return 1;
	}
	if (b.prerelease === null) {
		return -1;
	}
	return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
}

/** @param {string[]} versions */
function maxSemver(versions) {
	if (versions.length === 0) {
		fail("max-semver requires at least one packageJsonPaths entry");
	}
	let best = parseSemver(versions[0]);
	for (let i = 1; i < versions.length; i++) {
		const next = parseSemver(versions[i]);
		if (compareSemver(next, best) > 0) {
			best = next;
		}
	}
	return best.raw;
}

/**
 * @param {string} relativePath
 * @param {string} field
 * @param {string} targetVersion
 */
function syncJsonField(relativePath, field, targetVersion) {
	if (!relativePath || !field) {
		fail('json-field strategy requires sync.jsonField.file and sync.jsonField.field');
	}

	const fullPath = join(root, relativePath);
	if (!existsSync(fullPath)) {
		fail(`json-field target not found: ${relativePath}`);
	}

	const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`^(\\s*"${escapedField}"\\s*:\\s*)"([^"]*)"([,]?\\s*)$`,
		"m",
	);
	const raw = readFileSync(fullPath, "utf8");
	const match = pattern.exec(raw);
	if (!match) {
		fail(`could not find string field "${field}" in ${relativePath}`);
	}

	const current = match[2];
	if (current === targetVersion) {
		if (checkOnly) {
			console.log(
				`sync-version: ${field} in ${relativePath} is ${targetVersion} (aligned)`,
			);
			process.exit(0);
		}
		console.log(`sync-version: ${field} already at ${targetVersion}`);
		process.exit(0);
	}

	if (checkOnly) {
		console.error(
			`sync-version: ${field} is "${current}" but package.json is "${targetVersion}". Run: node ./scripts/sync-version.mjs`,
		);
		process.exit(1);
	}

	const updated = raw.replace(pattern, `$1"${targetVersion}"$3`);
	writeFileSync(fullPath, updated);
	console.log(
		`sync-version: updated ${relativePath} ${field} ${current} → ${targetVersion}`,
	);
}

/**
 * @param {string[]} packageJsonPaths
 */
function syncMaxSemver(packageJsonPaths) {
	if (!Array.isArray(packageJsonPaths) || packageJsonPaths.length === 0) {
		fail("max-semver strategy requires sync.packageJsonPaths");
	}

	const versions = packageJsonPaths.map((relativePath) => {
		const fullPath = join(root, relativePath);
		if (!existsSync(fullPath)) {
			fail(`package not found: ${relativePath}`);
		}
		const pkg = JSON.parse(readFileSync(fullPath, "utf8"));
		if (!pkg.version || typeof pkg.version !== "string") {
			fail(`missing version in ${relativePath}`);
		}
		return pkg.version;
	});

	const targetVersion = maxSemver(versions);
	const rootPkgRaw = readFileSync(ROOT_PKG_PATH, "utf8");
	const rootPkg = JSON.parse(rootPkgRaw);

	if (rootPkg.version === targetVersion) {
		if (checkOnly) {
			console.log(
				`sync-version: root package.json version is ${targetVersion} (aligned)`,
			);
			process.exit(0);
		}
		console.log(`sync-version: root already at ${targetVersion}`);
		process.exit(0);
	}

	if (checkOnly) {
		console.error(
			`sync-version: root package.json version is "${rootPkg.version}" but expected "${targetVersion}" (max of ${packageJsonPaths.join(", ")}). Run: node ./scripts/sync-version.mjs`,
		);
		process.exit(1);
	}

	const versionLinePattern = /^(\s*"version"\s*:\s*)"[^"]*"(,?\s*)$/m;
	if (!versionLinePattern.test(rootPkgRaw)) {
		fail("could not find version field in root package.json");
	}

	const updated = rootPkgRaw.replace(
		versionLinePattern,
		`$1"${targetVersion}"$2`,
	);
	writeFileSync(ROOT_PKG_PATH, updated);
	console.log(
		`sync-version: updated root version ${rootPkg.version} → ${targetVersion}`,
	);
}

const config = loadConfig();
const sync = config.sync ?? { strategy: "none" };
const strategy = sync.strategy ?? "none";

if (strategy === "none") {
	console.log("sync-version: strategy is none (nothing to do)");
	process.exit(0);
}

if (strategy === "json-field") {
	const file = sync.jsonField?.file;
	const field = sync.jsonField?.field;
	syncJsonField(file, field, readRootVersion());
	process.exit(0);
}

if (strategy === "max-semver") {
	syncMaxSemver(sync.packageJsonPaths);
	process.exit(0);
}

fail(
	`unknown sync.strategy "${strategy}". Use none, json-field, or max-semver.`,
);
