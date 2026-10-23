'use strict';
// Drops Chromium pieces YappyChat never uses (software Vulkan renderer) to make the installer smaller
const fs = require('fs'), path = require('path');
exports.default = async function (ctx) {
  for (const f of ['vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll']) { try { fs.rmSync(path.join(ctx.appOutDir, f), { force: true }); } catch (e) {} }
};
