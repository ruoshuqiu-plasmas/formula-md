const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
if (process.platform !== 'darwin') process.exit(0);
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'native/bridge.mm');
const output = path.join(root, 'src/native/formula-md-native.node');
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-fmodules', '-DNAPI_VERSION=8',
  '-mmacosx-version-min=13.0', '-arch', process.arch, '-bundle', '-undefined', 'dynamic_lookup',
  '-framework', 'AppKit', '-I', require('node-api-headers').include_dir, source, '-o', output], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
