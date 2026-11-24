// Run the retained feature integration tests without the temporary production
// pause. The real server entry and its pause are independently tested in
// paused-features.test.mjs; no production configuration is changed here.
import { register } from 'node:module';

register('./unpaused-server-loader.mjs', import.meta.url);
await import('../../src/server-entry.ts');
