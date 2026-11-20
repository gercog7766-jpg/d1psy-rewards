// Download exact Steam inventory artwork once, then serve it from persistent VPS storage.
// Source mapping: ByMykel/CSGO-API, skins.json blob 5c8774404bce418ae2e865127a1693e30c46cb7f.
import {mkdir,mkdtemp,writeFile,rename,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
const sources=[
  {
    "name": "AK-47 | Olive Polycam",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wipP0OKhZL1SI_GeAViRyrohj-1gSCGn201-4G7dyo2oeXORaAIpCcFwTeEK4ELskNa0NeKxtVTXiItDySms3XxXrnE8JD9gyYo"
  },
  {
    "name": "Five-SeveN | Sky Blue",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRe6toH_KfG2KvwOByj-JhXSa-kCIrujqNjsGueHuXb1VxDZRzFuJe5BC4w4XnYbnj5A2NjIMUyyr3iikY6Cc4tecBT-N7rc172J_D"
  },
  {
    "name": "P250 | Sleet",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwipC6s2tabZSN-KSHljD_uJ_t-l9AXCwxhwi6j_Syoysc36TbAAhXpYiRuIPshLsk4bnYemw7wCKiNoUyC7gznQekhpLnpY"
  },
  {
    "name": "SG 553 | Basket Halftone",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLimcO1qx1T-82heqVjJ_WsDGaDyutij-1gSCGn2xxy6mndyNj6cnLCPAIlC5YkF-4Ku0W_ltDhPr6z5lfb2IJBniT7iy9XrnE8euhCJNg"
  },
  {
    "name": "SCAR-20 | Sand Mesh",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLinZfyr3Jk_OKRZaF-KM-AD2mU_uJ_t-l9AXHhwxwi5zyDmIqoeCmWaAUhXpUiRrFZsBHsxNXvM-jl5lTdgotDySzgznQefYC7ilk"
  },
  {
    "name": "M249 | Sleet",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8zMK5wipC6s2jOvA0H_OSHFiH0-9mj7JWQyC0nQlp6zzQwtiudHvCO1MlDJByQuIC4UO7lta0Zuy0swPZiNhDxSv33C0f6zErvbjSvv-GUg"
  },
  {
    "name": "Negev | Sour Grapes",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL_m5Hl6x1I4PeRaqF_MumsAm6Xyfo44-Q7Gy3jzBsh4Tncw4n6cXiRbFAlW5B3TbEJu0PuwNWzPu_r4wDagpUFk3tgr-gSOQ"
  },
  {
    "name": "XM1014 | Irezumi",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLpk8ewrHZk9___OPU5H_mBC32FzOdJvOhuRz39k0h14juBztapc3-fPVIjWZomFucMtxe9m9zmNOjltQ2N2dgTnCr_3zQJsHjkNdtnHQ"
  },
  {
    "name": "PP-Bizon | Candy Apple",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzl4zv8x1I4M28baBSLPmUBnPemO105rI6SirhzRwi6zjWzd2uJCmfaFByApMiRbNcuxC_k9TgZb_qthue1dzUHyay4A"
  },
  {
    "name": "MAC-10 | Light Box",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1W7vH_OJtkLPyGHW6fz9F6ueZhW2e2lBsk4WvXw974diiSblV1DMBxRrEJu0PrwNy1Mruw4gKK3d0TynmskGoXuUBgCcQQ"
  },
  {
    "name": "Five-SeveN | Capillary",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRa7FSJvmFC3SV1-t4j_dsRieMmRQguynLmY79IinFbA90CZN2Q-Bc4UW6x9KyZLnjtQCMjo8WyXr7jy1O6Ck_sfFCD_SqR6qLvA"
  },
  {
    "name": "CZ75-Auto | Eco",
    "image": "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLyhMG1_B1Y-s2tcvM4H_WQAVicyOl-pK87HivqxR5xt2_Qnt6qI3-fPFciWJBzRuFZ5Ba_moG0Mrm04lfajYwQ02yg2Q7xomN1"
  }
];
const directory='/var/lib/dropso-case-artwork';
const hosts=['community.akamai.steamstatic.com','community.steamstatic.com','community.cloudflare.steamstatic.com'];
const limit=1024*1024;
const mime=b=>b.length>12&&(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null);
await mkdir(directory,{recursive:true,mode:0o755});
const stage=await mkdtemp(join(directory,'.download-'));
try{
 for(const [i,item] of sources.entries()){
  let found=false;
  for(const host of hosts){
   try{
    const url=new URL(item.image);url.hostname=host;
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok||!response.body||Number(response.headers.get('content-length'))>limit)continue;
    const reader=response.body.getReader(),chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('image too large')}chunks.push(value)}
    const bytes=Buffer.concat(chunks);if(!mime(bytes))continue;
    await writeFile(join(stage,String(i)+'.img'),bytes,{mode:0o644});found=true;
    console.log('OK '+(i+1)+'/12 '+item.name);break;
   }catch{}
  }
  if(!found)throw Error('Cannot download '+item.name+' from Steam CDN; existing cache unchanged.');
 }
 for(let i=0;i<sources.length;i++){await rename(join(stage,String(i)+'.img'),join(directory,String(i)+'.img'));await chmod(join(directory,String(i)+'.img'),0o644)}
 console.log('READY: 12/12 skin images saved.');
}finally{await rm(stage,{recursive:true,force:true})}
