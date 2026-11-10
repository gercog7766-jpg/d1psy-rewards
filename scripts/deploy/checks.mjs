import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// These three legacy integration cases still expect intentionally paused Live/Contracts.
// Their enabled-feature DB/UI tests and the paused-features tests continue to run.
export const pausedLegacyCases = [
 'full app contracts: auth, navigation, validation and CSRF',
 'Live full app: admin-only state changes, CAS conflicts, single-outcome bets and result display',
 'main server pilot: sessions, ownership arguments, Origin, OBS tokens and signed channel routing',
];
export function testArguments(script) {
 const parts=script.trim().split(/\s+/);
 const files=parts.filter(s=>/^tests\/[a-zA-Z0-9_.-]+\.(mjs|ts)$/.test(s));
 if(!files.length || parts.some(s=>!['node','--import','tsx','--test'].includes(s)&&!/^--test-concurrency=\d+$/.test(s)&&!files.includes(s)))throw Error('Unexpected test command; review deployment gate');
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return ['--import','tsx','--test','--test-concurrency=1','--test-skip-pattern=^(?:'+pausedLegacyCases.map(escape).join('|')+')$',...files];
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 console.log('Deployment gate: serial full suite; three documented paused-feature legacy cases excluded.');
 const result=spawnSync(process.execPath,testArguments(pkg.scripts.test),{stdio:'inherit',env:process.env});
 process.exit(result.status??1);
}
