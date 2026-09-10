import {readdir,readFile,writeFile} from 'node:fs/promises';
import {decodeCoverage} from '../src/art-coverage.js';
const root=new URL('../assets/rig/coverage/',import.meta.url);
for(const file of (await readdir(root)).filter(f=>f.endsWith('.coverage'))){
  const source=await readFile(new URL(file,root));
  const {w,h,data}=decodeCoverage(source.buffer.slice(source.byteOffset,source.byteOffset+source.length));
  const runs=[];for(let i=0;i<data.length;){let end=i+1;while(end<data.length&&end-i<65535&&data[end]===data[i])end++;runs.push((end-i)&255,(end-i)>>8,data[i]);i=end;}
  const packed=Buffer.alloc(12+runs.length);packed.write('ICV1');packed.writeUInt32LE(w,4);packed.writeUInt32LE(h,8);packed.set(runs,12);
  const check=decodeCoverage(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.length));
  if(!Buffer.from(check.data).equals(Buffer.from(data)))throw new Error('Lossless check failed: '+file);
  await writeFile(new URL(file,root),packed);console.log(`${file}: ${w}×${h}, ${data.length} → ${packed.length} bytes, lossless`);
}
