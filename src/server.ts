import { installAdminHotfix } from './admin-hotfix.js';
import { installAccountHotfix } from './account-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';

installAdminHotfix();
installAccountHotfix();
installObsHotfix();
await import('./server-next.js');
