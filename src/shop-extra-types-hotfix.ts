import express from 'express';

const rarityByName:Record<string,string>={
  'five-seven | капилляры':'army',
  'dual berettas | хищные растения':'restricted',
  'desert eagle | послание коринфянам':'army',
  'm4a1-s | эмфорозавр-s':'restricted',
  'm4a1-s | ночной ужас':'restricted',
  'пп-19 «бизон» | космокот':'restricted',
  'm4a1-s | electrum':'restricted',
  'револьвер r8 | янтарный градиент':'classified',
  'mp9 | слизь':'restricted',
  'm4a1-s | уединение':'classified',
  'p250 | лучшее вино':'restricted',
  'dual berettas | милые ангелочки':'restricted',
  'awp | бог червей':'restricted',
  'awp | экзотермия':'restricted',
  'nova | умная пушка':'restricted',
  'ak-47 | колымага':'restricted',
  'dual berettas | турбодвойники':'classified',
  'ak-47 | сланец':'restricted',
  'p90 | взор врага':'classified',
  'mp9 | гидра':'classified',
  'mp7 | дух бездны':'classified',
  'dual berettas | плод воображения':'classified',
  'famas | быстрые движения глаз':'classified',
  'famas | пульс':'restricted',
  'zeus x27 | сон дракона':'classified',
  'tec-9 | топливный инжектор':'classified',
  'm4a4 | 龍王 (король драконов)':'classified',
  'ak-47 | афродита':'covert',
  'awp | кортисейра':'classified',
  'five-seven | сказка':'classified',
  'usp-s | следы асфальта':'restricted',
  'автомат «галиль» | леденец':'army'
};

const CHARM='https://cs2.io/assets/images/skins/cs2/charms/charm-biomech.png';
const STICKER='https://images.steamusercontent.com/ugc/1711912631077972797/A03D60E4F02F0FB3D47D01B4BC3E37128E4D8F4E/';
const KNIFE_RE='(нож|knife|стилет|stiletto|керамбит|karambit|наваха|navaja|фальшион|falchion|штык|bayonet|коготь|talon|боуи|bowie|складной|flip|охотничий|huntsman|паракорд|paracord|скелетный|skeleton|выживания|survival|медвежий|ursus|бродяга|nomad|классический|classic)';

export function installShopExtraTypesHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'){
      if(body.includes('<title>Магазин — d1psy Rewards</title>')){
        body=body.replace(
          '<label><input type="checkbox" data-type="gloves"> 🧤 Перчатки</label>',
          '<label><input type="checkbox" data-type="gloves"> 🧤 Перчатки</label><label><input type="checkbox" data-type="agent"> 👤 Агент</label><label><input type="checkbox" data-type="charm"><img class="typeico" src="'+CHARM+'" alt=""> Брелок</label><label><input type="checkbox" data-type="sticker"><img class="typeico" src="'+STICKER+'" alt=""> Наклейка</label>'
        );
        body=body.replace(
          '<p class="note">Редкость добавим после классификации скинов.</p>',
          '<h3>Редкость</h3><div class="opts rarityopts"><label class="rarity-army"><input type="checkbox" data-rarity="army"> Армейское качество</label><label class="rarity-restricted"><input type="checkbox" data-rarity="restricted"> Запрещённое</label><label class="rarity-classified"><input type="checkbox" data-rarity="classified"> Засекреченное</label><label class="rarity-covert"><input type="checkbox" data-rarity="covert"> Тайное</label></div>'
        );
        body=body.replace('</style>','.typeico{width:22px;height:22px;object-fit:contain;vertical-align:middle;margin:0 5px 0 2px}.rarityopts .rarity-army{color:#4b9cff}.rarityopts .rarity-restricted{color:#9b5cff}.rarityopts .rarity-classified{color:#f05acb}.rarityopts .rarity-covert{color:#ff4f5e}</style>');
      }
      if(body.includes("function ok(x)")&&body.includes("data-type")){
        body=body.replace(
          "z==='knife'?/(нож|knife)/i.test(name):/(перчат|gloves|обмотки рук)/i.test(name)",
          "z==='knife'?/"+KNIFE_RE+"/i.test(name):z==='gloves'?/(перчат|gloves|обмотки рук)/i.test(name):z==='agent'?/(солдат|агент|agent|феникс|кавалерия|фбр|антитеррор)/i.test(name):z==='charm'?/(брелок|charm)/i.test(name):/(наклейка|sticker)/i.test(name)"
        );
        body=body.replace(
          "ts=sel('[data-type]','type'),price=Number(x.price_coins)",
          "ts=sel('[data-type]','type'),rs=sel('[data-rarity]','rarity'),price=Number(x.price_coins)"
        );
        const map=JSON.stringify(rarityByName);
        body=body.replace(
          "if(ts.length&&!ts.some(function(z){return z==='knife'?/"+KNIFE_RE+"/i.test(name):z==='gloves'?/(перчат|gloves|обмотки рук)/i.test(name):z==='agent'?/(солдат|агент|agent|феникс|кавалерия|фбр|антитеррор)/i.test(name):z==='charm'?/(брелок|charm)/i.test(name):/(наклейка|sticker)/i.test(name)}))return false;return true",
          "if(ts.length&&!ts.some(function(z){return z==='knife'?/"+KNIFE_RE+"/i.test(name):z==='gloves'?/(перчат|gloves|обмотки рук)/i.test(name):z==='agent'?/(солдат|агент|agent|феникс|кавалерия|фбр|антитеррор)/i.test(name):z==='charm'?/(брелок|charm)/i.test(name):/(наклейка|sticker)/i.test(name)}))return false;var rb="+map+";if(rs.length&&rs.indexOf(rb[name])<0)return false;return true"
        );
      }
    }
    return originalSend.call(this,body);
  };
}
