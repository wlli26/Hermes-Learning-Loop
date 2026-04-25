#!/usr/bin/env bash
set -e

PLUGIN_ID="hermes-learning"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ENTRY="$SCRIPT_DIR/dist/src/index.js"
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

# Check if we're running status command
if [ "$1" = "status" ]; then
  if command -v node >/dev/null 2>&1; then
    node "$SCRIPT_DIR/bin/cli.js" status
    exit 0
  fi
  echo "Node.js not found. Install Node.js or check config manually at: $CONFIG_FILE"
  exit 1
fi

# Verify plugin entry exists
if [ ! -f "$PLUGIN_ENTRY" ]; then
  echo "Error: Plugin entry not found at: $PLUGIN_ENTRY"
  echo "Make sure you're running this script from the extracted package directory."
  exit 1
fi

echo "Installing Hermes Learning Loop plugin..."
echo "  Plugin entry: $PLUGIN_ENTRY"
echo "  Config file : $CONFIG_FILE"
echo ""

# Try Node.js first (preferred)
if command -v node >/dev/null 2>&1; then
  echo "Using Node.js to install..."
  node "$SCRIPT_DIR/bin/cli.js" install
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
  echo "Please install Node.js or Python, or manually add the following to $CONFIG_FILE:"
  echo ""
  echo '  "plugins": {'
  echo '    "load": {'
  echo '      "paths": ["'"$PLUGIN_ENTRY"'"]'
  echo '    },'
  echo '    "slots": {'
  echo '      "contextEngine": "'"$PLUGIN_ID"'"'
  echo '    },'
  echo '    "entries": {'
  echo '      "'"$PLUGIN_ID"'": {'
  echo '        "enabled": true'
  echo '      }'
  echo '    }'
  echo '  }'
  exit 1
fi

echo "Using Python to install..."

$PYTHON_CMD - <<PYTHON_SCRIPT
import json
import os
import shutil
from datetime import datetime

config_dir = "$CONFIG_DIR"
config_file = "$CONFIG_FILE"
plugin_entry = "$PLUGIN_ENTRY"
plugin_id = "$PLUGIN_ID"

# Create config dir if needed
os.makedirs(config_dir, exist_ok=True)

# Read or create config
if os.path.exists(config_file):
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    # Backup
    timestamp = datetime.now().isoformat().replace(':', '-').replace('.', '-')
    backup = f"{config_file}.{timestamp}.bak"
    shutil.copy2(config_file, backup)
    print(f"Backup created: {backup}")
else:
    config = {}

# Ensure structure
if 'plugins' not in config:
    config['plugins'] = {}
if 'load' not in config['plugins']:
    config['plugins']['load'] = {}
if 'paths' not in config['plugins']['load']:
    config['plugins']['load']['paths'] = []
if 'slots' not in config['plugins']:
    config['plugins']['slots'] = {}
if 'entries' not in config['plugins']:
    config['plugins']['entries'] = {}
if 'installs' not in config['plugins']:
    config['plugins']['installs'] = {'index': {}}

# Add plugin path if not present
if plugin_entry not in config['plugins']['load']['paths']:
    config['plugins']['load']['paths'].append(plugin_entry)

# Set context engine slot
config['plugins']['slots']['contextEngine'] = plugin_id

# Enable in entries
if plugin_id not in config['plugins']['entries']:
    config['plugins']['entries'][plugin_id] = {}
config['plugins']['entries'][plugin_id]['enabled'] = True

# Add install record
config['plugins']['installs']['index'][plugin_id] = {
    'source': 'path',
    'sourcePath': plugin_entry,
    'installPath': plugin_entry,
    'installedAt': datetime.now().isoformat()
}

# Write config
with open(config_file, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)
    f.write('\n')

print("")
print("✓ Hermes Learning Loop installed and enabled.")
print("")
print("Next step: restart OpenClaw to activate the plugin.")
print("")
PYTHON_SCRIPT
