import { installAdminHotfix } from './admin-hotfix.js';
import { installAccountHotfix } from './account-hotfix.js';

installAdminHotfix();
installAccountHotfix();
await import('./server-next.js');
