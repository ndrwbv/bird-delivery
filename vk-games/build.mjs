import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCity } from './prepare-city.mjs';
import { legalPage, privacy, terms } from './legal.mjs';

const edition = fileURLToPath(new URL('./', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url));
const baseCommit = '2cc121e93c22497839a80b7daac1b75c3aaa4bcb';
const vite = join(edition, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vite)) throw new Error('Install the VK build dependencies with npm ci --prefix vk-games');

const release = join(repo, 'release');
mkdirSync(release, { recursive: true });
const output = mkdtempSync(join(release, '.vk-build-'));
const stage = mkdtempSync(join(tmpdir(), 'bird-vk-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });

try {
  const archive = join(stage, 'snapshot.tar');
  run('git', ['archive', '--format=tar', `--output=${archive}`, baseCommit, 'index.html', 'src', 'public'], repo);
  run('tar', ['-xf', archive], stage);
  rmSync(archive);
  copyFileSync(join(edition, 'package.json'), join(stage, 'package.json'));
  copyFileSync(join(edition, 'vite.config.mjs'), join(stage, 'vite.config.mjs'));
  symlinkSync(join(edition, 'node_modules'), join(stage, 'node_modules'), 'junction');
  for (const file of ['game.patch', 'menu.patch', 'look.patch', 'neighborhood.patch', 'moderation.patch', 'entry.patch']) {
    run('git', ['apply', '--whitespace=nowarn', join(edition, file)], stage);
  }
  copyFileSync(join(edition, 'menu.js'), join(stage, 'src', 'game', 'menu.js'));
  copyFileSync(join(edition, 'menu-start.css'), join(stage, 'src', 'game', 'vk-menu-start.css'));
  copyFileSync(join(edition, 'platform.js'), join(stage, 'src', 'platform', 'vk.js'));
  for (const name of ['cloud-save.js', 'legal.mjs', 'moderation-ui.js', 'moderation.css']) {
    copyFileSync(join(edition, name), join(stage, 'src', 'platform', 'vk-' + name));
  }
  copyFileSync(join(edition, 'shift-reward.js'), join(stage, 'src', 'game', 'vk-shift-reward.js'));
  for (const ext of ['js', 'css']) copyFileSync(join(edition, 'hud.' + ext), join(stage, 'src', 'game', 'vk-hud.' + ext));
  copyFileSync(join(edition, 'pause.css'), join(stage, 'src', 'game', 'vk-pause.css'));
  copyFileSync(join(edition, 'minimap.js'), join(stage, 'src', 'game', 'vk-minimap.js'));
  copyFileSync(join(edition, 'neighborhood.js'), join(stage, 'src', 'game', 'vk-neighborhood.js'));
  copyFileSync(join(edition, 'paper.css'), join(stage, 'src', 'game', 'vk-paper.css'));
  copyFileSync(join(edition, 'fullmap.css'), join(stage, 'src', 'game', 'fullmap.css'));
  copyFileSync(join(edition, 'look.js'), join(stage, 'src', 'game', 'vk-look.js'));
  const city = join(stage, 'src', 'maps', 'seversk');
  copyFileSync(join(edition, 'map.js'), join(city, 'vk.js'));
  copyFileSync(join(edition, 'delivery-zone.mjs'), join(city, 'vk-delivery-zone.mjs'));
  await prepareCity(city);

  const assets = join(stage, 'public');
  const licenses = join(assets, 'licenses');
  mkdirSync(licenses, { recursive: true });
  copyFileSync(join(edition, 'node_modules', '@vkontakte', 'vk-bridge', 'LICENSE'), join(licenses, 'vk-bridge.txt'));
  for (const name of ['models', 'privacy.html', 'manifest.webmanifest', 'music', 'sfx', 'concepts/dock']) {
    rmSync(join(assets, name), { recursive: true, force: true });
  }
  copyFileSync(join(edition, 'boot-guard.js'), join(assets, 'boot-guard.js'));
  copyFileSync(join(edition, 'menu-city.webp'), join(assets, 'menu-city.webp'));
  writeFileSync(join(assets, 'terms.html'), legalPage(terms));
  writeFileSync(join(assets, 'privacy.html'), legalPage(privacy));
  const entry = join(stage, 'index.html');
  const error = readFileSync(join(edition, 'boot-error.html'), 'utf8');
  const cover = readFileSync(join(edition, 'menu-cover.css'), 'utf8');
  writeFileSync(entry, readFileSync(entry, 'utf8')
    .replace('</head>', '  <meta name="referrer" content="no-referrer">\n' +
      '  <link rel="preload" as="image" href="./menu-city.webp">\n  <style>\n' + cover + '  </style>\n' +
      '  <script src="./boot-guard.js"></script>\n</head>')
    .replace('<body class="booting">', '<body class="booting">\n' + error));
  for (const name of ['music', 'sfx']) {
    const folder = join(assets, name);
    mkdirSync(folder);
    writeFileSync(join(folder, 'index.json'), '{}\n');
  }
  const dialogue = join(assets, 'assets', 'dialogue', 'ZATO_Gennady_dialogue_assets');
  for (const name of ['optional', 'reference', 'PROMPT_FOR_AGENT.md', 'README.md']) {
    rmSync(join(dialogue, name), { recursive: true, force: true });
  }
  const manifest = join(dialogue, 'manifest.json');
  const { encounter, notes, ...portrait } = JSON.parse(readFileSync(manifest, 'utf8'));
  writeFileSync(manifest, JSON.stringify(portrait));
  for (const name of ['idle.png', 'talk.png', 'blink.png', 'smile.png', 'angry.png', 'cutting_guide.png']) {
    rmSync(join(dialogue, 'character', 'gennady', name), { force: true });
  }

  run(process.execPath, [vite, 'build', '--mode', 'vk'], stage);
  const zip = join(output, 'bird-pizza-vk.zip');
  run('zip', ['-q', '-r', zip, '.'], join(stage, 'dist'));
  const result = join(release, 'bird-pizza-vk.zip');
  renameSync(zip, result);
  console.log(`VK build: ${result}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
}
