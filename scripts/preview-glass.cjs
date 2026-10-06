const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-md-glass-preview-'));
const sourceSettings = path.join(os.homedir(), 'Library/Application Support/Formula MD/settings.json');
if (fs.existsSync(sourceSettings)) fs.copyFileSync(sourceSettings, path.join(profile, 'settings.json'));
const transparency = Number(process.env.FORMULA_MD_GLASS_TRANSPARENCY);
if (process.env.FORMULA_MD_GLASS_TRANSPARENCY !== undefined && Number.isFinite(transparency)) {
  const settingsPath = path.join(profile, 'settings.json');
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  settings.chromeOpacity = 1 - Math.max(0, Math.min(100, transparency)) / 100;
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
}
fs.cpSync(path.join(root, 'examples'), path.join(profile, 'examples'), { recursive: true });
fs.writeFileSync(path.join(profile, 'recent-files.json'), JSON.stringify(['latex-showcase.md', 'images-showcase.md'].map((name) => ({ name, path: path.join(profile, 'examples', name) }))));
console.log(`玻璃预览使用独立数据目录：${profile}`);
console.log('关闭预览窗口即可退出；现有应用和文档不受影响。');
const child = spawn(require('electron'), [path.join(__dirname, 'glass-preview-app.cjs')], {
  stdio: 'inherit', env: { ...process.env, FORMULA_MD_QA_PROFILE: profile, FORMULA_MD_GLASS_PREVIEW: '1' }
});
child.on('exit', (code) => process.exitCode = code || 0);
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
