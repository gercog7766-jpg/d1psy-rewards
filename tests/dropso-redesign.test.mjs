import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withDropsoRedesign} from '../src/dropso-redesign.ts';
import {withSiteNavigation} from '../src/site-navigation.ts';
const html='<!doctype html><html><head></head><body><main><button id="action">Действие</button></main></body></html>';
test('redesign is route scoped and idempotent, keeps original control IDs and excludes admin/OBS/API',()=>{
 for(const path of ['/account','/membership','/shop','/bonuses','/bosses','/streamers','/black-box','/games/red-button','/vault','/profile/customize','/clans']){
  const before=withSiteNavigation(html,path),after=withDropsoRedesign(before,path);
  assert.match(after,/id="dropsoRedesign"/);assert.match(after,/id="action"/);assert.equal(withDropsoRedesign(after,path),after);
 }
 for(const path of ['/admin','/admin/bosses','/obs/boss','/api/me','/']){const before=withSiteNavigation(html,path);assert.equal(withDropsoRedesign(before,path),before)}
});
