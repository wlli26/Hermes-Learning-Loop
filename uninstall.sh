#!/usr/bin/env bash
set -e

PLUGIN_ID="hermes-learning"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ENTRY="$SCRIPT_DIR/dist/src/index.js"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

echo "Uninstalling Hermes Learning Loop plugin..."
echo "  Config file: $CONFIG_FILE"
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
  echo "No OpenClaw config found at: $CONFIG_FILE"
  echo "Nothing to uninstall."
  exit 0
fi

# Try Node.js first (preferred)
if command -v node >/dev/null 2>&1; then
  echo "Using Node.js to uninstall..."
  node "$SCRIPT_DIR/bin/cli.js" uninstall
  exit 0
fi

# Fallback to Python
if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD=python
else
  echo "Error: Neither Node.js nor Python found."
  echo ""
  echo "Please install Node.js or Python, or manually remove the plugin config from:"
  echo "  $CONFIG_FILE"
  echo ""
  echo "Remove these sections:"
  echo '  - "plugins.load.paths" entry: "'"$PLUGIN_ENTRY"'"'
  echo '  - "plugins.slots.contextEngine" if set to "'"$PLUGIN_ID"'"'
  echo '  - "plugins.entries.'"$PLUGIN_ID"'"'
  echo '  - "plugins.installs.index.'"$PLUGIN_ID"'"'
  exit 1
fi

echo "Using Python to uninstall..."

$PYTHON_CMD - <<PYTHON_SCRIPT
import json
import os
import shutil
from datetime import datetime

config_file = "$CONFIG_FILE"
plugin_entry = "$PLUGIN_ENTRY"
plugin_id = "$PLUGIN_ID"

if not os.path.exists(config_file):
    print("No config file found, nothing to do.")
    exit(0)

# Read config
with open(config_file, 'r', encoding='utf-8') as f:
    config = json.load(f)

# Backup
timestamp = datetime.now().isoformat().replace(':', '-').replace('.', '-')
backup = f"{config_file}.{timestamp}.bak"
shutil.copy2(config_file, backup)
print(f"Backup created: {backup}")

plugins = config.get('plugins', {})

# Remove from load.paths
if 'load' in plugins and 'paths' in plugins['load']:
    paths = plugins['load']['paths']
    # Normalize paths for comparison
    normalized_entry = os.path.abspath(plugin_entry)
    plugins['load']['paths'] = [
        p for p in paths
        if os.path.abspath(p) != normalized_entry
    ]

# Remove context engine slot if it's ours
if 'slots' in plugins and plugins['slots'].get('contextEngine') == plugin_id:
    del plugins['slots']['contextEngine']

# Remove from entries
if 'entries' in plugins and plugin_id in plugins['entries']:
    del plugins['entries'][plugin_id]

# Remove install record
if 'installs' in plugins and 'index' in plugins['installs']:
    if plugin_id in plugins['installs']['index']:
        del plugins['installs']['index'][plugin_id]

# Write config
with open(config_file, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)
    f.write('\n')

print("")
print("✓ Hermes Learning Loop removed from OpenClaw config.")
print("")
print("Restart OpenClaw to deactivate the plugin.")
print("")
PYTHON_SCRIPT
