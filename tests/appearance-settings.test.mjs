import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Settings = require('../src/shared/appearance-settings');
const { rebase } = require('../src/shared/insertion-anchor');
test('legacy theme and palette migrate without losing the selected appearance', () => {
  const migrated = Settings.normalize({ theme: 'dark', palette: 'ultra-violet' });
  assert.equal(migrated.palettes.dark, 'ultra-violet');
  assert.equal(Settings.resolve(migrated, false).palette, 'ultra-violet');
  assert.equal(Object.keys(Settings.palettes).length, 12);
  assert.equal(migrated.allowRemoteImages, false);
  assert.equal(migrated.chromeOpacity, 0.8);
});
test('system theme restores independent palettes and per-palette colors', () => {
  let config = Settings.patch({}, { palette: 'cloud-saas' });
  config = Settings.patch(config, { colors: { palette: 'cloud-saas', text: '#123456', accent: 'bad' } });
  config = Settings.patch(config, { palette: 'ultra-violet' });
  config = Settings.patch(config, { theme: 'system' });
  assert.equal(Settings.resolve(config, false).palette, 'cloud-saas');
  assert.equal(Settings.resolve(config, false).colors.text, '#123456');
  assert.equal(Settings.resolve(config, true).palette, 'ultra-violet');
  assert.equal(Settings.resolve(Settings.patch(config, { resetPalette: 'cloud-saas' }), false).colors.text, Settings.palettes['cloud-saas'].colors.text);
});
test('invalid stored values and partial updates cannot corrupt settings', () => {
  const value = Settings.normalize({ theme: 'other', chromeOpacity: 5, customColors: { 'arctic-frost': { text: 'red;display:none' } } });
  assert.equal(value.theme, 'system'); assert.equal(value.chromeOpacity, 1);
  assert.equal(value.customColors['arctic-frost'], undefined);
  assert.equal(Settings.patch(value, { allowRemoteImages: 'yes' }).allowRemoteImages, false);
});
test('an asynchronous insertion follows typing without overwriting changed selections', () => {
  const anchor = { content: 'hello world', start: 6, end: 6 };
  rebase(anchor, 'prefix hello world');
  assert.equal(anchor.start, 13);
  rebase(anchor, 'prefix hello new world');
  assert.equal(anchor.start, 17);
  const selected = { content: 'one two three', start: 4, end: 7 };
  rebase(selected, 'one edited three');
  assert.equal(selected.invalid, true);
});
