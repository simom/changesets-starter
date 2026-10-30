#!/usr/bin/env node
/**
 * One-shot Changesets scaffold for a target project.
 *
 * Usage:
 *   node bin/init.mjs --cwd /path/to/project
 *   node bin/init.mjs --cwd ../my-app --profile single
 *   node bin/init.mjs --cwd ../my-app --profile single --sync json-field \
 *     --json-file config/settings.json --json-field app_version
 *   node bin/init.mjs --cwd ../my-monorepo --profile workspaces --sync max-semver \
 *     --root-from packages/core,packages/ui
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(__dirname, "..");

const CHANGESETS_CLI = "@changesets/cli";

function printHelp() {
	console.log(`Usage: create-changesets [options]

Options:
  --cwd <path>              Target project root (default: current directory)
  --profile single|workspaces
                            Auto-detected from package.json workspaces if omitted
  --sync none|json-field|max-semver
                            Post-version sync strategy (default: none)
  --json-file <path>        Relative JSON file for json-field sync
  --json-field <name>       String field name for json-field sync
  --root-from <a,b,c>       Package dirs or package.json paths for max-semver
  --base-branch <name>      Changesets baseBranch (default: main)
  --merge                   Skip overwriting existing config/docs; fill gaps only
  --agents                  Append release snippet to AGENTS.md when present
  --dry-run                 Print actions without writing or installing
  --help                    Show this help
`);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {Record<string, string | boolean>} */
	const args = {
		cwd: process.cwd(),
		sync: "none",
		baseBranch: "main",
		merge: false,
		agents: false,
		dryRun: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined || value.startsWith("--")) {
				fail(`missing value for ${token}`);
			}
			return value;
		};

		switch (token) {
			case "--help":
			case "-h":
				args.help = true;
				break;
			case "--cwd":
				args.cwd = resolve(next());
				break;
			case "--profile":
				args.profile = next();
				break;
			case "--sync":
				args.sync = next();
				break;
			case "--json-file":
				args.jsonFile = next();
				break;
			case "--json-field":
				args.jsonField = next();
				break;
			case "--root-from":
				args.rootFrom = next();
				break;
			case "--base-branch":
				args.baseBranch = next();
				break;
			case "--merge":
				args.merge = true;
				break;
			case "--agents":
				args.agents = true;
				break;
			case "--dry-run":
				args.dryRun = true;
				break;
			default:
				fail(`unknown argument: ${token}`);
		}
	}

	return args;
}

/** @param {string} message */
function fail(message) {
	console.error(`create-changesets: ${message}`);
	process.exit(1);
}

/** @param {string} message */
function log(message) {
	console.log(`create-changesets: ${message}`);
}

/**
 * @param {string} cwd
 * @param {boolean} dryRun
 */
function readTargetPackage(cwd, dryRun) {
	const pkgPath = join(cwd, "package.json");
	if (!existsSync(pkgPath)) {
		fail(`no package.json in ${cwd}`);
	}
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	if (dryRun) {
		log(`(dry-run) would read ${pkgPath}`);
	}
	return { pkg, pkgPath };
}

/**
 * @param {object} pkg
 * @param {string | undefined} explicit
 */
function resolveProfile(pkg, explicit) {
	if (explicit) {
		if (explicit !== "single" && explicit !== "workspaces") {
			fail(`--profile must be single or workspaces (got "${explicit}")`);
		}
		return explicit;
	}
	const hasWorkspaces =
		Array.isArray(pkg.workspaces) ||
		(pkg.workspaces && typeof pkg.workspaces === "object");
	return hasWorkspaces ? "workspaces" : "single";
}

/**
 * @param {string} sync
 */
function assertSync(sync) {
	const allowed = new Set(["none", "json-field", "max-semver"]);
	if (!allowed.has(sync)) {
		fail(`--sync must be none, json-field, or max-semver (got "${sync}")`);
	}
}

/**
 * @param {string} entry
 */
function normalizePackageJsonPath(entry) {
	const trimmed = entry.trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed.endsWith("package.json")) {
		return trimmed.replace(/^\.\//, "");
	}
	return join(trimmed, "package.json").replace(/\\/g, "/");
}

/**
 * @param {string | undefined} rootFrom
 * @param {string} cwd
 */
function resolvePackageJsonPaths(rootFrom, cwd) {
	if (!rootFrom) {
		return [];
	}
	return rootFrom
		.split(",")
		.map(normalizePackageJsonPath)
		.filter(Boolean)
		.map((relative) => {
			const full = join(cwd, relative);
			if (!existsSync(full)) {
				log(`warning: --root-from path not found yet: ${relative}`);
			}
			return relative;
		});
}

/**
 * @param {object} args
 * @param {string[]} packageJsonPaths
 */
function buildReleaseKitConfig(args, packageJsonPaths) {
	/** @type {object} */
	const sync = { strategy: args.sync };

	if (args.sync === "json-field") {
		if (!args.jsonFile || !args.jsonField) {
			fail(
				"--sync json-field requires --json-file and --json-field",
			);
		}
		sync.jsonField = {
			file: String(args.jsonFile),
			field: String(args.jsonField),
		};
	}

	if (args.sync === "max-semver") {
		if (packageJsonPaths.length === 0) {
			fail(
				"--sync max-semver requires --root-from with at least one package path",
			);
		}
		sync.packageJsonPaths = packageJsonPaths;
	}

	return { sync };
}

/**
 * @param {string} baseBranch
 */
function loadChangesetConfig(baseBranch) {
	const templatePath = join(kitRoot, "templates", "changeset-config.json");
	const config = JSON.parse(readFileSync(templatePath, "utf8"));
	config.baseBranch = baseBranch;
	return `${JSON.stringify(config, null, "\t")}\n`;
}

/**
 * @param {string} cwd
 * @param {string} dirName
 */
function scanWorkspacePackages(cwd, dirName) {
	const base = join(cwd, dirName);
	if (!existsSync(base)) {
		return [];
	}
	/** @type {{ path: string, name: string }[]} */
	const rows = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const relPkg = join(dirName, entry.name, "package.json").replace(
			/\\/g,
			"/",
		);
		const full = join(cwd, relPkg);
		if (!existsSync(full)) {
			continue;
		}
		try {
			const pkg = JSON.parse(readFileSync(full, "utf8"));
			if (pkg.name) {
				rows.push({ path: `${dirName}/${entry.name}/**`, name: pkg.name });
			}
		} catch {
			// skip invalid package.json
		}
	}
	return rows;
}

/**
 * @param {string} cwd
 * @param {string} profile
 * @param {string} packageName
 */
function buildReleaseDoc(cwd, profile, packageName) {
	if (profile === "single") {
		const template = readFileSync(
			join(kitRoot, "templates", "release.md.single.md"),
			"utf8",
		);
		return template.replaceAll("PACKAGE_NAME", packageName || "my-app");
	}

	const template = readFileSync(
		join(kitRoot, "templates", "release.md.workspaces.md"),
		"utf8",
	);
	const rows = [
		...scanWorkspacePackages(cwd, "packages"),
		...scanWorkspacePackages(cwd, "apps"),
	];

	let table;
	if (rows.length === 0) {
		table = [
			"| Area touched | Package in changeset |",
			"| --- | --- |",
			"| `packages/core/**` | `@scope/core` |",
			"| `packages/ui/**` | `@scope/ui` |",
			"| Everything else (docs, scripts, root config) | pick a tooling package or the most relevant package |",
		].join("\n");
	} else {
		const lines = [
			"| Area touched | Package in changeset |",
			"| --- | --- |",
			...rows.map((row) => `| \`${row.path}\` | \`${row.name}\` |`),
			"| Everything else (docs, scripts, root config) | pick a tooling package or the most relevant package |",
		];
		table = lines.join("\n");
	}

	return template.replace("PACKAGE_MAP_TABLE", table);
}

/**
 * @param {object} pkg
 * @param {string} sync
 */
function buildReleaseScript(sync) {
	if (sync === "none") {
		return "changeset version && npm install --package-lock-only";
	}
	return "changeset version && node ./scripts/sync-version.mjs && npm install --package-lock-only";
}

/**
 * @param {object} pkg
 * @param {string} sync
 * @param {boolean} merge
 */
function mergePackageScripts(pkg, sync, merge) {
	const next = { ...pkg, scripts: { ...(pkg.scripts || {}) } };
	const releaseScript = buildReleaseScript(sync);

	if (!merge || !next.scripts.changeset) {
		next.scripts.changeset = "changeset";
	}
	if (!merge || !next.scripts.release) {
		next.scripts.release = releaseScript;
	}

	const deps = {
		...(next.devDependencies || {}),
	};
	let needsInstall = false;
	if (!deps[CHANGESETS_CLI] && !(next.dependencies || {})[CHANGESETS_CLI]) {
		deps[CHANGESETS_CLI] = "^3.0.3";
		next.devDependencies = deps;
		needsInstall = true;
	}

	return { pkg: next, needsInstall };
}

/**
 * @param {string} path
 * @param {string} contents
 * @param {boolean} dryRun
 * @param {boolean} skipIfExists
 */
function writeText(path, contents, dryRun, skipIfExists) {
	if (skipIfExists && existsSync(path)) {
		log(`skip existing ${path}`);
		return false;
	}
	if (dryRun) {
		log(`(dry-run) would write ${path}`);
		return true;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	log(`wrote ${path}`);
	return true;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {boolean} dryRun
 * @param {boolean} skipIfExists
 */
function copyFile(from, to, dryRun, skipIfExists) {
	if (skipIfExists && existsSync(to)) {
		log(`skip existing ${to}`);
		return false;
	}
	if (dryRun) {
		log(`(dry-run) would copy ${from} → ${to}`);
		return true;
	}
	mkdirSync(dirname(to), { recursive: true });
	copyFileSync(from, to);
	log(`copied ${to}`);
	return true;
}

/**
 * @param {string} cwd
 * @param {boolean} dryRun
 */
function ensureChangesetReadme(cwd, dryRun) {
	const readmePath = join(cwd, ".changeset", "README.md");
	if (existsSync(readmePath)) {
		return;
	}
	const contents = `Changesets live here. See docs/release.md in this project.\n`;
	writeText(readmePath, contents, dryRun, false);
}

/**
 * @param {string} cwd
 * @param {boolean} dryRun
 * @param {boolean} forceAgents
 */
function maybeAppendAgents(cwd, dryRun, forceAgents) {
	const agentsPath = join(cwd, "AGENTS.md");
	if (!existsSync(agentsPath)) {
		if (forceAgents) {
			log("AGENTS.md not found; skipping --agents");
		}
		return;
	}
	const current = readFileSync(agentsPath, "utf8");
	if (current.toLowerCase().includes("changeset")) {
		log("AGENTS.md already mentions changesets; skipping append");
		return;
	}
	if (!forceAgents) {
		log("AGENTS.md present; pass --agents to append the release snippet");
		return;
	}
	const snippet = readFileSync(
		join(kitRoot, "templates", "agents-snippet.md"),
		"utf8",
	);
	const next = `${current.trimEnd()}\n\n${snippet.trimEnd()}\n`;
	if (dryRun) {
		log(`(dry-run) would append release snippet to ${agentsPath}`);
		return;
	}
	writeFileSync(agentsPath, next);
	log(`updated ${agentsPath}`);
}

/**
 * @param {string} cwd
 * @param {boolean} dryRun
 */
function installChangesets(cwd, dryRun) {
	if (dryRun) {
		log(`(dry-run) would run npm install -D ${CHANGESETS_CLI}`);
		return;
	}
	log(`installing ${CHANGESETS_CLI}…`);
	const result = spawnSync(
		"npm",
		["install", "-D", CHANGESETS_CLI],
		{
			cwd,
			stdio: "inherit",
			shell: process.platform === "win32",
		},
	);
	if (result.status !== 0) {
		fail(`npm install failed with exit code ${result.status}`);
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		process.exit(0);
	}

	assertSync(String(args.sync));

	const cwd = String(args.cwd);
	const dryRun = Boolean(args.dryRun);
	const merge = Boolean(args.merge);

	log(`target ${cwd}${dryRun ? " (dry-run)" : ""}`);

	const { pkg, pkgPath } = readTargetPackage(cwd, dryRun);
	const profile = resolveProfile(pkg, args.profile ? String(args.profile) : undefined);
	log(`profile ${profile}`);

	const packageJsonPaths = resolvePackageJsonPaths(
		args.rootFrom ? String(args.rootFrom) : undefined,
		cwd,
	);
	const releaseKit = buildReleaseKitConfig(args, packageJsonPaths);

	const changesetDir = join(cwd, ".changeset");
	const changesetConfigPath = join(changesetDir, "config.json");
	const releaseDocPath = join(cwd, "docs", "release.md");
	const releaseKitPath = join(cwd, "release-kit.config.json");
	const syncScriptPath = join(cwd, "scripts", "sync-version.mjs");

	writeText(
		changesetConfigPath,
		loadChangesetConfig(String(args.baseBranch)),
		dryRun,
		merge,
	);
	ensureChangesetReadme(cwd, dryRun);

	if (args.sync !== "none") {
		writeText(
			releaseKitPath,
			`${JSON.stringify(releaseKit, null, "\t")}\n`,
			dryRun,
			merge,
		);
		copyFile(
			join(kitRoot, "shared", "sync-version.mjs"),
			syncScriptPath,
			dryRun,
			merge,
		);
	} else if (!merge || !existsSync(releaseKitPath)) {
		writeText(
			releaseKitPath,
			`${JSON.stringify({ sync: { strategy: "none" } }, null, "\t")}\n`,
			dryRun,
			merge,
		);
	}

	const packageName =
		typeof pkg.name === "string" && pkg.name ? pkg.name : "my-app";
	writeText(
		releaseDocPath,
		buildReleaseDoc(cwd, profile, packageName),
		dryRun,
		merge,
	);

	const { pkg: nextPkg, needsInstall } = mergePackageScripts(
		pkg,
		String(args.sync),
		merge,
	);

	if (dryRun) {
		log(`(dry-run) would update scripts in ${pkgPath}`);
		log(`(dry-run) release → ${nextPkg.scripts.release}`);
	} else {
		writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, "\t")}\n`);
		log(`updated ${pkgPath} scripts`);
	}

	if (needsInstall) {
		installChangesets(cwd, dryRun);
	} else {
		log(`${CHANGESETS_CLI} already listed in package.json`);
	}

	maybeAppendAgents(cwd, dryRun, Boolean(args.agents));

	log("done");
	if (!dryRun) {
		log("next: add a .changeset/*.md for your change, then npm run release when ready");
	}
}

main();
