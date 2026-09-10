// ICV1 is lossless run-length encoded visibility, independent of the original RGB image.
export function decodeCoverage(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  const packed=bytes[0]===73&&bytes[1]===67&&bytes[2]===86&&bytes[3]===49;
  const offset=packed?4:0,w=view.getUint32(offset,true),h=view.getUint32(offset+4,true);
  if(!w||!h||w*h>16777216)throw new Error('无效的原画轮廓尺寸');
  if(!packed){if(bytes.length!==w*h+8)throw new Error('原画轮廓不完整');return {w,h,data:bytes.subarray(8)};}
  const data=new Uint8Array(w*h);let i=12,n=0;
  for(;i+2<bytes.length;i+=3){const count=view.getUint16(i,true);if(!count||n+count>data.length)throw new Error('原画轮廓损坏');data.fill(bytes[i+2],n,n+count);n+=count;}
  if(i!==bytes.length||n!==data.length)throw new Error('原画轮廓不完整');return {w,h,data};
}
