import {readFileSync} from 'node:fs';
import {join} from 'node:path';
// A public commit ID only; no environment values or credentials are exposed.
export function readDeploymentRelease(directory=process.cwd()): string|null {
 try { const value=readFileSync(join(directory,'.dropso-release'),'utf8').trim();return /^[0-9a-f]{40}$/.test(value)?value:null; }
 catch { return null; }
}
export const deploymentRelease=readDeploymentRelease();
