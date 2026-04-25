#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "hermes-learning";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const pluginEntry = path.join(packageRoot, "dist", "src", "index.js");

const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir();
const openclawDir = path.join(HOME, ".openclaw");
const configFile = path.join(openclawDir, "openclaw.json");

const cmd = (process.argv[2] || "install").toLowerCase();

function ensurePluginEntryExists() {
  if (!fs.existsSync(pluginEntry)) {
    console.error(
      `\n[hermes-learning-loop] Compiled plugin not found at:\n  ${pluginEntry}\n`,
    );
    console.error(
      "Run `npm run build` from the package root, or reinstall the package so `prepare` rebuilds it.\n",
    );
    process.exit(1);
  }
}

function readConfig() {
  if (!fs.existsSync(configFile)) {
    fs.mkdirSync(openclawDir, { recursive: true });
    return {};
  }
  const raw = fs.readFileSync(configFile, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(
      `[hermes-learning-loop] Failed to parse ${configFile}: ${err.message}`,
    );
    process.exit(1);
  }
}

function writeConfig(config) {
  fs.mkdirSync(openclawDir, { recursive: true });
  const tmp = `${configFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, configFile);
}

function backupConfig() {
  if (!fs.existsSync(configFile)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${configFile}.${stamp}.bak`;
  fs.copyFileSync(configFile, backup);
  return backup;
}

function install() {
  ensurePluginEntryExists();
  const backup = backupConfig();
  const config = readConfig();

  config.plugins = config.plugins || {};
  config.plugins.load = config.plugins.load || {};
  config.plugins.load.paths = Array.isArray(config.plugins.load.paths)
    ? config.plugins.load.paths
    : [];

  const existingIndex = config.plugins.load.paths.findIndex(
    (p) => typeof p === "string" && path.resolve(p) === path.resolve(pluginEntry),
  );
  if (existingIndex < 0) {
    config.plugins.load.paths.push(pluginEntry);
  }

  config.plugins.slots = config.plugins.slots || {};
  config.plugins.slots.contextEngine = PLUGIN_ID;

  config.plugins.entries = config.plugins.entries || {};
  config.plugins.entries[PLUGIN_ID] = {
    ...(config.plugins.entries[PLUGIN_ID] || {}),
    enabled: true,
  };

  config.plugins.installs = config.plugins.installs || { index: {} };
  config.plugins.installs.index = config.plugins.installs.index || {};
  config.plugins.installs.index[PLUGIN_ID] = {
    source: "path",
    sourcePath: pluginEntry,
    installPath: pluginEntry,
    installedAt: new Date().toISOString(),
  };

  writeConfig(config);

  console.log("\n✓ Hermes Learning Loop installed and enabled.\n");
  console.log(`  Plugin entry : ${pluginEntry}`);
  console.log(`  Config file  : ${configFile}`);
  if (backup) console.log(`  Backup       : ${backup}`);
  console.log("\nNext step: restart OpenClaw to activate the plugin.\n");
}

function uninstall() {
  if (!fs.existsSync(configFile)) {
    console.log("[hermes-learning-loop] No OpenClaw config found, nothing to do.");
    return;
  }
  backupConfig();
  const config = readConfig();
  const plugins = config.plugins;
  if (!plugins) {
    console.log("[hermes-learning-loop] No plugins section in config, nothing to do.");
    return;
  }

  if (Array.isArray(plugins.load?.paths)) {
    plugins.load.paths = plugins.load.paths.filter(
      (p) => !(typeof p === "string" && path.resolve(p) === path.resolve(pluginEntry)),
    );
  }
  if (plugins.slots?.contextEngine === PLUGIN_ID) {
    delete plugins.slots.contextEngine;
  }
  if (plugins.entries?.[PLUGIN_ID]) {
    delete plugins.entries[PLUGIN_ID];
  }
  if (plugins.installs?.index?.[PLUGIN_ID]) {
    delete plugins.installs.index[PLUGIN_ID];
  }

  writeConfig(config);
  console.log("\n✓ Hermes Learning Loop removed from OpenClaw config.\n");
  console.log("Restart OpenClaw to deactivate the plugin.\n");
}

function status() {
  if (!fs.existsSync(configFile)) {
    console.log("[hermes-learning-loop] OpenClaw config not found at:", configFile);
    return;
  }
  const config = readConfig();
  const plugins = config.plugins || {};
  const inPaths = (plugins.load?.paths || []).some(
    (p) => typeof p === "string" && path.resolve(p) === path.resolve(pluginEntry),
  );
  const isSlot = plugins.slots?.contextEngine === PLUGIN_ID;
  const entryEnabled = plugins.entries?.[PLUGIN_ID]?.enabled === true;
  const recorded = Boolean(plugins.installs?.index?.[PLUGIN_ID]);

  console.log("Hermes Learning Loop status:");
  console.log(`  config file           : ${configFile}`);
  console.log(`  plugin entry          : ${pluginEntry}`);
  console.log(`  registered (load.paths): ${inPaths ? "yes" : "no"}`);
  console.log(`  context engine slot   : ${isSlot ? "yes" : "no"}`);
  console.log(`  entries.enabled       : ${entryEnabled ? "yes" : "no"}`);
  console.log(`  install record        : ${recorded ? "yes" : "no"}`);
  console.log(
    `  → effective active    : ${inPaths && (isSlot || entryEnabled) ? "YES" : "NO"}`,
  );
}

function help() {
  console.log(`hermes-learning-loop <command>

Commands:
  install     Register and enable the plugin in ~/.openclaw/openclaw.json (default)
  uninstall   Remove the plugin from the OpenClaw config
  status      Show whether the plugin is currently registered and enabled
  help        Show this message
`);
}

switch (cmd) {
  case "install":
    install();
    break;
  case "uninstall":
  case "remove":
    uninstall();
    break;
  case "status":
    status();
    break;
  case "help":
  case "-h":
  case "--help":
    help();
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    help();
    process.exit(1);
}
