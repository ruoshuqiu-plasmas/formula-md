(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AppearanceSettings = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const palettes = {
  "arctic-frost": {
    "name": "Arctic Frost 极地霜",
    "mode": "light",
    "colors": {
      "accent": "#2e6b8a",
      "chrome": "#e4edf5",
      "page": "#f0f5fa",
      "text": "#22303c"
    }
  },
  "cloud-saas": {
    "name": "Cloud SaaS 云端蓝",
    "mode": "light",
    "colors": {
      "accent": "#2563eb",
      "chrome": "#e8ecf1",
      "page": "#fafbfc",
      "text": "#0f172a"
    }
  },
  "blush-lavender": {
    "name": "Blush & Lavender 胭粉薰衣草",
    "mode": "light",
    "colors": {
      "accent": "#9b72cf",
      "chrome": "#f2e2e9",
      "page": "#fbf4f7",
      "text": "#3a2a33"
    }
  },
  "lilac-mist": {
    "name": "Lilac Mist 丁香雾",
    "mode": "light",
    "colors": {
      "accent": "#6f5b8d",
      "chrome": "#eae4f2",
      "page": "#f8f6fb",
      "text": "#3d3450"
    }
  },
  "github-dim": {
    "name": "GitHub Dim 暗夜",
    "mode": "dark",
    "colors": {
      "accent": "#58a6ff",
      "chrome": "#161b22",
      "page": "#0d1117",
      "text": "#c9d1d9"
    }
  },
  "midnight-indigo": {
    "name": "Midnight Indigo 午夜靛蓝",
    "mode": "dark",
    "colors": {
      "accent": "#6c63f0",
      "chrome": "#141432",
      "page": "#0a0a1a",
      "text": "#e3e4f2"
    }
  },
  "linear-violet": {
    "name": "Linear Violet 线性紫",
    "mode": "dark",
    "colors": {
      "accent": "#6c77dd",
      "chrome": "#1c1d2e",
      "page": "#0a0b1e",
      "text": "#e1e2ec"
    }
  },
  "stripe-violet": {
    "name": "Stripe Violet 条纹紫",
    "mode": "dark",
    "colors": {
      "accent": "#7a74ff",
      "chrome": "#0f2d4d",
      "page": "#0a2540",
      "text": "#e6eef7"
    }
  },
  "ibm-blue": {
    "name": "IBM Blue 企业蓝",
    "mode": "light",
    "colors": {
      "accent": "#0f62fe",
      "chrome": "#eaeaea",
      "page": "#f4f4f4",
      "text": "#161616"
    }
  },
  "vapor-chrome": {
    "name": "Vapor Chrome 蒸汽铬",
    "mode": "light",
    "colors": {
      "accent": "#6366f1",
      "chrome": "#e4e0f8",
      "page": "#f2effd",
      "text": "#312e4b"
    }
  },
  "sapphire-ice": {
    "name": "Sapphire Ice 冰晶蓝",
    "mode": "light",
    "colors": {
      "accent": "#1e5ba8",
      "chrome": "#deebf8",
      "page": "#f0f6fd",
      "text": "#102542"
    }
  },
  "ultra-violet": {
    "name": "Ultra Violet 紫外光",
    "mode": "dark",
    "colors": {
      "accent": "#8e72c9",
      "chrome": "#25243d",
      "page": "#1b1a2e",
      "text": "#e9e4f3"
    }
  }
};
  const hasPalette = (id) => typeof id === 'string' && Object.hasOwn(palettes, id);
  const defaults = { light: 'arctic-frost', dark: 'github-dim' };
  const colorKeys = ['accent', 'chrome', 'page', 'text'];
  const validColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  function normalize(input = {}) {
    if (!input || typeof input !== 'object') input = {};
    const result = { version: 2, theme: ['light', 'dark', 'system'].includes(input.theme) ? input.theme : 'system',
      palettes: { ...defaults }, customColors: {}, chromeOpacity: 0.8, allowRemoteImages: false };
    for (const mode of ['light', 'dark']) {
      const id = input.palettes?.[mode];
      if (palettes[id]?.mode === mode) result.palettes[mode] = id;
    }
    if (hasPalette(input.palette)) result.palettes[palettes[input.palette].mode] = input.palette;
    if (Number.isFinite(input.chromeOpacity)) result.chromeOpacity = Math.max(0, Math.min(1, input.chromeOpacity));
    result.allowRemoteImages = input.allowRemoteImages === true;
    for (const id of Object.keys(palettes)) {
      const colors = {};
      for (const key of colorKeys) {
        const value = input.customColors?.[id]?.[key];
        if (validColor(value)) colors[key] = value.toLowerCase();
      }
      if (Object.keys(colors).length) result.customColors[id] = colors;
    }
    return result;
  }
  function patch(current, changes = {}) {
    const next = normalize(current);
    if (!changes || typeof changes !== 'object') return next;
    if (['system', 'light', 'dark'].includes(changes.theme)) next.theme = changes.theme;
    if (hasPalette(changes.palette)) {
      const mode = palettes[changes.palette].mode;
      next.palettes[mode] = changes.palette;
      next.theme = mode;
    }
    if (typeof changes.allowRemoteImages === 'boolean') next.allowRemoteImages = changes.allowRemoteImages;
    if (Number.isFinite(changes.chromeOpacity)) next.chromeOpacity = Math.max(0, Math.min(1, changes.chromeOpacity));
    if (hasPalette(changes.resetPalette)) delete next.customColors[changes.resetPalette];
    const id = changes.colors?.palette;
    if (hasPalette(id)) {
      next.customColors[id] ||= {};
      for (const key of colorKeys) {
        if (validColor(changes.colors[key])) next.customColors[id][key] = changes.colors[key].toLowerCase();
      }
    }
    return next;
  }
  function resolve(settings, dark) {
    const config = normalize(settings);
    const mode = config.theme === 'system' ? (dark ? 'dark' : 'light') : config.theme;
    const palette = config.palettes[mode];
    return { mode, palette, colors: { ...palettes[palette].colors, ...config.customColors[palette] } };
  }
  return { palettes, defaults, colorKeys, validColor, normalize, patch, resolve };
});
