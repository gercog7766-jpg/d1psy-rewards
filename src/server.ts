import { installAccountHotfix } from './account-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';
import { installAdminDashboardHotfix } from './admin-dashboard-hotfix.js';

installAccountHotfix();
installObsHotfix();
installAdminDashboardHotfix();
await import('./server-next.js');
