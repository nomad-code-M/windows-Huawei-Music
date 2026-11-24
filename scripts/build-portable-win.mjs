// Build a no-install portable Windows bundle and zip it.
//
// The NSIS installer (dist:win) requires an installation wizard; this target produces a plain
// directory that runs by double-clicking the exe, which is what "download and run" means for
// users who do not want to install anything. electron-builder's `dir` target writes
// <output>/win-unpacked; we rename that folder, drop a short readme next to the exe and zip
// the whole folder so extraction always yields one tidy top-level directory.
//
// Windows only: electron-builder edits the exe resources with rcedit.exe on Windows. Pass
// `linux` as the sole argument to exercise the same packaging/zip path on a Linux host for
// local verification (the produced artifact is a Linux build, not shippable to Windows).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? 'win';
if (!['win', 'linux'].includes(target)) throw new Error('Usage: build-portable-win.mjs [win|linux]');
if (target === 'win' && process.platform !== 'win32') {
  throw new Error('Build the Windows portable bundle on native Windows (npm run dist:win:portable).');
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const isWindows = target === 'win';
const workDir = join(root, 'release', isWindows ? 'win-portable' : 'linux-portable');
const unpackedName = isWindows ? 'win-unpacked' : 'linux-unpacked';
const unpacked = join(workDir, unpackedName);
const folderName = isWindows ? 'HuaweiMusic-Windows-Portable' : 'HuaweiMusic-Linux-Portable';
const folder = join(workDir, folderName);
const artifactDir = join(root, 'release', isWindows ? 'win-x64' : 'linux-x64');
const zipPath = join(artifactDir, `HuaweiMusic-${isWindows ? 'Windows' : 'Linux'}-Portable-v${version}.zip`);

// Typecheck-free runtime import: electron-builder is a devDependency and may be ESM or CJS
// depending on the installed resolution. createRequire keeps both cases working.
const require = createRequire(import.meta.url);
const { build, Platform, Arch } = require('electron-builder');

// `dist:win` normally builds out/ first, but this script must also work standalone.
try {
  await stat(join(root, 'out', 'main', 'index.js'));
} catch {
  console.log('[portable] out/ missing — running npm run build first');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const built = spawnSync(npm, ['run', 'build'], {
    stdio: 'inherit', cwd: root, shell: process.platform === 'win32',
  });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error(`npm run build failed with exit code ${built.status}`);
}

await rm(workDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

console.log(`[portable] building ${target}/x64 dir target -> ${workDir}`);
await build({
  targets: (isWindows ? Platform.WINDOWS : Platform.LINUX).createTarget('dir', Arch.x64),
  config: {
    directories: { output: workDir },
    win: { signExecutable: false, forceCodeSigning: false, requestedExecutionLevel: 'asInvoker' },
    publish: null,
  },
  publish: 'never',
});

await stat(unpacked);

const readme = [
  `华为音乐 ${isWindows ? 'Windows' : 'Linux'} 便携版（第三方 · 非官方 · 学习研究用）`,
  '================================================',
  '',
  isWindows ? '【运行】双击 HuaweiMusic.exe 即可，无需安装、无需 Node.js。' : '【运行】执行目录内的主程序即可，无需安装。',
  '【首次使用】点「扫码登录」，用手机华为音乐 / 华为帐号 App 扫码。',
  '            登录页必须是华为官方域名；出现任何第三方域名请立即关闭。',
  '【退出】右下角系统托盘图标 → 右键 → 退出。关闭窗口默认最小化到托盘。',
  '【会话】约 7 天后过期，重新扫码即可。',
  '【SmartScreen】未签名，Windows 会拦截。请先核对 Release 里的 SHA256SUMS，',
  '            再点「更多信息」→「仍要运行」。不要关闭系统防护。',
  '',
  '本目录由 GitHub Actions 自动构建，内容 = 官方 Electron 运行时 + app.asar（由源码构建）。',
  '无安装器、无自动更新、无遥测、无第三方认证服务器。',
  `版本 ${version} · 许可 AGPL-3.0-only · 未获华为授权，仅供个人学习研究。`,
  '',
].join('\n');

// Keep every ZIP entry name ASCII: Compress-Archive on Windows PowerShell 5.1 does not
// reliably set the UTF-8 filename flag, which garbles Chinese names in some unzip tools.
await writeFile(join(unpacked, 'README.txt'), `\uFEFF${readme}`, 'utf8');
if (isWindows) {
  const exe = (await readdir(unpacked)).find(name => /\.exe$/i.test(name));
  if (!exe) throw new Error('electron-builder produced no .exe in win-unpacked');
  await rename(join(unpacked, exe), join(unpacked, 'HuaweiMusic.exe'));
}
await rename(unpacked, folder);

// `zip -r` updates an existing archive instead of replacing it, which would leave stale
// entries from a previous build. Remove the target first on both platforms.
await rm(zipPath, { force: true });
console.log(`[portable] compressing -> ${zipPath}`);
let result;
if (isWindows) {
  // Compress-Archive includes the folder itself, so extraction yields one tidy directory.
  const command = `Compress-Archive -LiteralPath '${folder.replaceAll("'", "''")}' `
    + `-DestinationPath '${zipPath.replaceAll("'", "''")}' -CompressionLevel Optimal -Force`;
  result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    stdio: 'inherit', cwd: root,
  });
} else {
  result = spawnSync('zip', ['-r', '-9', '-q', zipPath, folderName], {
    stdio: 'inherit', cwd: workDir,
  });
}
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`compression failed with exit code ${result.status}`);

const info = await stat(zipPath);
console.log(`[portable] done: ${zipPath} (${(info.size / 1024 / 1024).toFixed(1)} MiB)`);
console.log('[portable] nothing uploaded; attach this file to the release together with SHA256SUMS.');
