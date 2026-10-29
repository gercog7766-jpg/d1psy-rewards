import { installAccountHotfix } from './account-hotfix.js';
import { installAccountStatusHotfix } from './account-status-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';
import { installAdminDashboardHotfix } from './admin-dashboard-hotfix.js';
import { installHomeHotfix } from './home-hotfix.js';

installAccountHotfix();
installAccountStatusHotfix();
installObsHotfix();
installAdminDashboardHotfix();
installHomeHotfix();
await import('./server-next.js');
