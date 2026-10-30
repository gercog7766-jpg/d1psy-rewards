import { installAccountHotfix } from './account-hotfix.js';
import { installAccountStatusHotfix } from './account-status-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';
import { installAdminDashboardHotfix } from './admin-dashboard-hotfix.js';
import { installHomeHotfix } from './home-hotfix.js';
import { installOrdersHotfix } from './orders-hotfix.js';
import { installShopHotfix } from './shop-hotfix.js';

installShopHotfix();
installAccountHotfix();
installAccountStatusHotfix();
installObsHotfix();
installOrdersHotfix();
installAdminDashboardHotfix();
installHomeHotfix();
await import('./server-next.js');
