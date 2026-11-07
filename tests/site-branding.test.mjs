import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {withSiteBranding,brandLogoUrl} from '../src/site-branding.ts';
import {pwaIcons} from '../src/pwa-icons.ts';
import {pwaManifest,pwaHead,pwaSw} from '../src/pwa-assets.ts';

test('branding replaces service marks, preserves script hooks and personal avatars, and excludes Live',()=>{
 const script='<script>const template=\'<a class="brand">D1PSY</a>\';</script>';
 const input='<!doctype html><html><head></head><body><a class="brand"><span class="mkt-brand-mark">D</span><span>D1PSY MARKET</span></a><a class="brand"><span class="brand-mark" id="twitchPresenceMarker"><img id="channelAvatar" hidden><span id="channelAvatarFallback">D1</span></span></a><img class="user-avatar" src="https://twitch.test/user.png">'+script+'</body></html>';
 const html=withSiteBranding(input,'/account'),dom=new JSDOM(html),doc=dom.window.document;
 assert.equal(doc.querySelectorAll('.brand .d1psy-brand-logo').length,2);
 for(const image of doc.querySelectorAll('.d1psy-brand-logo'))assert.equal(image.getAttribute('src'),brandLogoUrl);
 assert(doc.querySelector('#twitchPresenceMarker'));assert(!doc.querySelector('#channelAvatar'));
 assert.equal(doc.querySelector('.user-avatar').getAttribute('src'),'https://twitch.test/user.png');assert(html.includes(script));
 assert.equal(withSiteBranding(html,'/account'),html);
 assert.equal(withSiteBranding(input,'/live'),input);assert.equal(withSiteBranding(input,'/admin/live'),input);
 assert.equal(withSiteBranding('{"brand":"D1PSY"}','/api/test'),'{"brand":"D1PSY"}');dom.window.close();
});

test('all icon variants are PNGs in expected sizes and versioned manifest references resolve',()=>{
 const sizes={'brand-logo':256,'brand-favicon':48,'brand-192':192,'brand-512':512,'brand-apple':180,'brand-maskable':512,'brand-badge':96};
 for(const [name,size] of Object.entries(sizes)){
  const png=Buffer.from(pwaIcons[name],'base64');assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 for(const icon of pwaManifest.icons){assert(icon.src.includes('/brand-'));assert(pwaIcons[icon.src.split('/').at(-1).replace('.png','')]);assert(pwaSw.includes(icon.src));}
 assert(pwaHead.includes('/brand-apple.png'));assert(pwaSw.includes('static-brand-v2'));
 assert.equal(pwaIcons['512'],pwaIcons['brand-512']);
});
