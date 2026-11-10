import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,readFile,readlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDeploymentRelease} from '../src/deployment-release.ts';
import {testArguments,pausedLegacyCases} from '../scripts/deploy/checks.mjs';
const script=resolve('scripts/deploy/update.sh'),sha='a'.repeat(40);
test('deployment gate runs the repository suite serially and excludes only named paused legacy cases',async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8')),args=testArguments(pkg.scripts.test);
 assert(args.includes('--test-concurrency=1'));assert(args.includes('tests/paused-features.test.mjs'));assert(args.includes('tests/vps-autodeploy.test.mjs'));
 const pattern=new RegExp(args.find(x=>x.startsWith('--test-skip-pattern=')).split('=').slice(1).join('='));
 for(const name of pausedLegacyCases)assert.equal(pattern.test(name),true);
 for(const name of ['profile API: auth','main server pilot: other case','Live DB','full app contracts: different case'])assert(!pattern.test(name));
 assert.throws(()=>testArguments('node --test tests/a.mjs; echo secret'));
 const skipped=spawnSync(process.execPath,testArguments('node --import tsx --test tests/streamer-pilot-http.test.mjs'),{encoding:'utf8'});assert.equal(skipped.status,0,skipped.stdout+skipped.stderr);
});
async function scenario(mode){
 const dir=await mkdtemp(join(tmpdir(),'dropso-deploy-')),root=join(dir,'root'),state=join(dir,'state'),old=join(dir,'old'),release=join(root,'releases',sha),trace=join(dir,'trace');
 await mkdir(join(old,'dist'),{recursive:true});await writeFile(join(old,'dist/server-entry.js'),'old');await mkdir(join(root,'releases'),{recursive:true});await mkdir(state);await writeFile(trace,'');await symlink(old,join(root,'current'));
 if(mode==='unchanged'){await mkdir(release);await rm(join(root,'current'));await symlink(release,join(root,'current'))}
 if(mode==='rejected')await writeFile(join(state,'failed-sha'),sha);
 const shell=`source "$1"
ROOT="$2"; STATE="$3"; BUILDER=unused; trace="$4"; mode="$5"; target="$6"
is_root() { return 0; }
as_builder() { if [[ $* == *rev-parse* ]]; then printf '%s\\n' "$target"; fi; }
prepare_release() { echo build >> "$trace"; [[ $mode != build-fails ]] || return 1; mkdir -p "$release/dist"; echo new > "$release/dist/server-entry.js"; }
systemctl() { echo "$* $(readlink -f "$ROOT/current")" >> "$trace"; if [[ $1 == start && $mode == start-fails && $(readlink -f "$ROOT/current") == *"$target" ]]; then return 1; fi; }
checks=0
healthy() {
 checks=$((checks+1))
 if [[ $(readlink -f "$ROOT/current") == *"$target" ]]; then
  if [[ $mode == interrupted ]]; then kill -TERM "$$"; fi
  if [[ $mode == health-late-fails && $checks -gt 1 ]]; then return 1; fi
 fi
 [[ $mode != health-fails || $(readlink -f "$ROOT/current") != *"$target" ]]
}
wait_healthy() { healthy; }
sleep() { :; }
if [[ $mode == locked ]]; then exec 8>"$STATE/update.lock"; flock -n 8; fi
main
`;
 const result=spawnSync('bash',['-c',shell,'_',script,root,state,trace,mode,sha],{encoding:'utf8'});
 return {result,root,state,old,release,trace:await readFile(trace,'utf8'),cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('successful deployment builds first, stops the only app, switches atomically and keeps rollback release',async()=>{
 const s=await scenario('success');try{assert.equal(s.result.status,0,s.result.stdout+s.result.stderr);assert.equal(await readlink(join(s.root,'current')),s.release);assert.equal(await readlink(join(s.root,'previous')),s.old);assert(s.trace.startsWith('build\nstop dropso '+s.old+'\nstart dropso '+s.release));}finally{await s.cleanup()}
});
for(const mode of ['build-fails','health-fails','start-fails','health-late-fails','interrupted'])test('deployment failure: '+mode+' preserves/restores previous site and rejects the same commit',async()=>{
 const s=await scenario(mode);try{assert.notEqual(s.result.status,0);assert.equal(await readlink(join(s.root,'current')),s.old);assert.equal((await readFile(join(s.state,'failed-sha'),'utf8')).trim(),sha);if(mode==='build-fails')assert.equal(s.trace,'build\n');else assert(s.trace.endsWith('start dropso '+s.old+'\n'));}finally{await s.cleanup()}
});
for(const mode of ['unchanged','rejected','locked'])test('polling '+mode+' commit does not rebuild or restart',async()=>{
 const s=await scenario(mode);try{assert.equal(s.result.status,0,s.result.stdout+s.result.stderr);assert.equal(s.trace,'');}finally{await s.cleanup()}
});
test('installer keeps production environment separate and schedules exactly one service with serialized deployment',async()=>{
 const install=await readFile('scripts/deploy/install.sh','utf8'),update=await readFile(script,'utf8');
 assert(!install.includes('source /etc/dropso.env'));assert(!update.includes('source /etc/dropso.env'));
 assert.match(update,/runuser -u "\$BUILDER" -- env -i/);assert.match(update,/flock -n 9/);
 assert.match(install,/OnUnitInactiveSec=2min/);assert.match(install,/WorkingDirectory=\/opt\/dropso\/current/);
 assert.match(install,/ExecStart=\/usr\/bin\/node \/opt\/dropso\/current\/dist\/server-entry.js/);
 assert(!install.includes('systemctl start dropso\n'));
});

test('health release identifier accepts only an exact public SHA and tolerates the original installation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dropso-version-'));
 try{assert.equal(readDeploymentRelease(dir),null);await writeFile(join(dir,'.dropso-release'),sha+'\n');assert.equal(readDeploymentRelease(dir),sha);await writeFile(join(dir,'.dropso-release'),'not-a-sha');assert.equal(readDeploymentRelease(dir),null)}finally{await rm(dir,{recursive:true,force:true})}
});

test('health gate rejects the wrong running release, malformed responses and non-ready services',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dropso-health-'));await mkdir(join(dir,sha));await symlink(join(dir,sha),join(dir,'current'));
 try{for(const [body,active,status] of [[JSON.stringify({ok:true,release:sha}),true,0],[JSON.stringify({ok:true,release:'b'.repeat(40)}),true,1],['invalid',true,1],[JSON.stringify({ok:true,release:sha}),false,1]]){
  const result=spawnSync('bash',['-c',`source "$1"; ROOT="$2"; NODE_BIN="$3"; body="$4"; active="$5"; systemctl(){ [[ $active == true ]]; }; curl(){ printf '%s' "$body"; }; healthy`,'_',script,dir,process.execPath,body,String(active)],{encoding:'utf8'});assert.equal(result.status,status,result.stderr)
 }}finally{await rm(dir,{recursive:true,force:true})}
});
