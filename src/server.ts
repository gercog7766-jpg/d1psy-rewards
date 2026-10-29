import { installAccountHotfix } from './account-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';
import { installAdminDashboardHotfix } from './admin-dashboard-hotfix.js';
import { installHomeHotfix } from './home-hotfix.js';
import { installPrizeAssets } from './prize-assets.js';

installPrizeAssets();
installAccountHotfix();
installObsHotfix();
installAdminDashboardHotfix();
installHomeHotfix();
await import('./server-next.js');
