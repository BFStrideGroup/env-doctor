import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(date = new Date('1980-01-01T00:00:00Z')) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}
function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function xml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
}
const files = [];
async function addTree(abs, prefix) {
  for (const e of (await readdir(abs, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const a = path.join(abs, e.name);
    const rel = path.posix.join(prefix, e.name);
    if (e.isDirectory()) await addTree(a, rel);
    else if (e.isFile() && !e.name.endsWith('.map'))
      files.push({ name: rel, data: await readFile(a) });
  }
}
for (const name of [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
]) {
  await access(path.join(root, name));
  files.push({ name: `extension/${name}`, data: await readFile(path.join(root, name)) });
}
await addTree(path.join(root, 'bundle'), 'extension/bundle');
await addTree(path.join(root, 'resources'), 'extension/resources');
const tsRoot = path.join(root, 'node_modules', 'typescript');
for (const name of ['package.json', 'LICENSE.txt', 'ThirdPartyNoticeText.txt'])
  files.push({
    name: `extension/node_modules/typescript/${name}`,
    data: await readFile(path.join(tsRoot, name)),
  });
const tsFile = path.join(tsRoot, 'lib', 'typescript.js');
files.push({
  name: 'extension/node_modules/typescript/lib/typescript.js',
  data: await readFile(tsFile),
});
const manifest = `<?xml version="1.0" encoding="utf-8"?>\n<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">\n<Metadata><Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}"/><DisplayName>${xml(pkg.displayName)}</DisplayName><Description xml:space="preserve">${xml(pkg.description)}</Description><Tags>${xml((pkg.keywords || []).join(','))}</Tags><Categories>${xml((pkg.categories || []).join(','))}</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/resources/icon.png" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>\n</PackageManifest>\n`;
const contentTypes = `<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>\n`;
files.unshift(
  { name: 'extension.vsixmanifest', data: Buffer.from(manifest) },
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
);
files.sort((a, b) => a.name.localeCompare(b.name));
const chunks = [];
const central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name.replace(/\\/g, '/'));
  const data = file.data;
  const compressed = deflateRawSync(data, { level: 9 });
  const stored = compressed.length < data.length ? compressed : data;
  const method = stored === data ? 0 : 8;
  const crc = crc32(data);
  const { time, day } = dosDateTime();
  const executable = file.name === 'extension/bundle/cli.js';
  const mode = executable ? 0o100755 : 0o100644;
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(method),
    u16(time),
    u16(day),
    u32(crc),
    u32(stored.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    name,
  ]);
  chunks.push(local, stored);
  central.push(
    Buffer.concat([
      u32(0x02014b50),
      u16(0x0314),
      u16(20),
      u16(0),
      u16(method),
      u16(time),
      u16(day),
      u32(crc),
      u32(stored.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(mode << 16),
      u32(offset),
      name,
    ]),
  );
  offset += local.length + stored.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(files.length),
  u16(files.length),
  u32(centralBuf.length),
  u32(offset),
  u16(0),
]);
const archive = Buffer.concat([...chunks, centralBuf, end]);
await writeFile(output, archive);
console.log(
  `Created ${path.basename(output)} with ${files.length} files (${(archive.length / 1024 / 1024).toFixed(2)} MiB).`,
);
