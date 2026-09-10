import { mkdir, cp } from 'node:fs/promises';
const root = new URL('.', import.meta.url);
const out = new URL('dist/', root);
await mkdir(out, { recursive: true });
for (const name of ['index.html', 'mark.svg', 'src', 'vendor', 'LICENSE']) {
  await cp(new URL(name, root), new URL(name, out), { recursive: true });
}
await cp(new URL('assets/reference/turnarounds/', root),new URL('assets/reference/turnarounds/',out),{recursive:true});
await cp(new URL('assets/rig/', root),new URL('assets/rig/',out),{recursive:true});
console.log('Built Ink Blade in dist/. Serve this directory through HTTP to play.');
