import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
test('completed promo names can be reused, active duplicates and streamer namespace cannot; archive preserves history',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create table rewards_promo_codes(id integer primary key,code text,active boolean default true,activation_count integer default 0,max_activations integer default 1,expires_at timestamptz);create unique index rewards_promo_codes_code_ci on rewards_promo_codes(lower(code));create table redemption(id integer,promo_id integer references rewards_promo_codes(id));`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261109135354_owner_promo_lifecycle_and_reusable_names.sql',import.meta.url),'utf8'));
 await db.exec(`insert into rewards_promo_codes(id,code) values(1,'hello');insert into redemption values(1,1)`);
 await assert.rejects(db.exec(`insert into rewards_promo_codes(id,code) values(2,'HELLO')`),/unique/i);
 await assert.rejects(db.exec(`update rewards_promo_codes set archived_at=now() where id=1`),/promo_still_active/);
 await db.exec(`update rewards_promo_codes set activation_count=1 where id=1;insert into rewards_promo_codes(id,code) values(2,'Hello');update rewards_promo_codes set archived_at=now() where id=1`);
 assert.equal((await db.query('select count(*)::int n from redemption')).rows[0].n,1);
 await db.exec(`insert into rewards_promo_codes(id,code,expires_at) values(3,'expired',now()-interval '1 hour');insert into rewards_promo_codes(id,code) values(4,'EXPIRED');update rewards_promo_codes set active=false where id=4;insert into rewards_promo_codes(id,code) values(5,'EXPIRED')`);
 for(const code of ['STR-HELLO','str-hello'])await assert.rejects(db.exec(`insert into rewards_promo_codes(id,code) values(8,'${code}')`),/owner_promo_namespace/);
 assert.equal((await db.query(`select count(*)::int n from rewards_promo_codes where code='HELLO' and active`)).rows[0].n,1);await db.close();
});
test('admin markup provides completed-code deletion and keeps active-code cancellation',()=>{
 const src=readFileSync(new URL('../src/promo-ui-fix-hotfix.ts',import.meta.url),'utf8');assert.match(src,/data-promo-delete/);assert.match(src,/data-promo-cancel/);
 const script=src.slice(src.indexOf('const js=`')+10,src.indexOf('`;',src.indexOf('const js=`'))).split('<script>')[1].split('</script>')[0];new Function(script);
});
