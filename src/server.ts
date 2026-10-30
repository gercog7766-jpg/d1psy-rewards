import { installAccountHotfix } from './account-hotfix.js';
import { installObsHotfix } from './obs-hotfix.js';
import { installAdminDashboardHotfix } from './admin-dashboard-hotfix.js';
import { installAdminHistoryHotfix } from './admin-history-hotfix.js';
import { installHomeHotfix } from './home-hotfix.js';
import { installPrizeAssets } from './prize-assets.js';
import { installEconomyHotfix } from './economy-hotfix.js';

installPrizeAssets();
installEconomyHotfix();
installAccountHotfix();
installObsHotfix();
installAdminHistoryHotfix();
installAdminDashboardHotfix();
installHomeHotfix();
await import('./server-next.js');
