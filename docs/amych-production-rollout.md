# Amych production drops

The `/streamer` dashboard now issues real rewards to existing site users. `/admin/streamers` is the owner's funding and approval page. The primary owner's existing admin, settings and rounds remain the primary drop engine.

- Real wallet: `rewards_streamer_live_ledger`, funded only by the primary owner through an authenticated admin action. Initial balance is zero. Pilot money and awards remain in their original tables and are never converted.
- Real rounds, participants, deduplication, codes and OBS feeds are separate from primary singleton rounds. The broadcaster always comes from the signed session or verified Twitch notification.
- Limits: 1–3600 seconds; 5–5000 messages; prize range 2–3000 coins. Shared replenishable drop catalog only; disabled shop-only items and finite stock are excluded.
- One active round per channel. Each next round is launched manually. A round reserves its exact prize cost; cancellation/no eligible winner refunds it once. A winner must have an existing site account, valid Trade URL and no ban or participation restriction.
- Streamer codes use `STR-` and can award a replenishable skin or 1–3000 coins per activation, up to 1000 activations. Entire liability is reserved up front. Redemption, delivery, counter and provenance commit together. Unused liability is refunded on cancellation/expiry. Issuers cannot redeem their own codes.
- Skin awards enter `rewards_wins` with `source_type='streamer'`; coin codes enter the viewer's existing coin ledger. Provenance links each award to its owning streamer/round/code. Existing inventory claim/sale functions handle the new wins. Drop wins also receive existing XP, battle pass progress and push jobs.
- Existing private OBS links remain valid. Appearance matches `/obs`; data stays channel-scoped, with read-only bearer capability, SHA256 at rest and token in URL fragment. New token creation invalidates the previous token. Primary OBS activity excludes partner wins.

## Validation

68 automated tests and TypeScript build passed. PGlite tests exercise real award links, two channel isolation, wallet reservation/refunds, code retry, failed-delivery rollback, messages and price bounds, OBS and HTTP identity/security. PGlite serializes requests; this is not a claim of testing parallel Postgres sessions.

`supabase/checks/streamer-production-rollback.sql` passed against the production schema as `service_role`: actual shared inventory award, order creation, sale, coin code, replay protection, self-redemption rejection and exact wallet accounting. All its wallet, inventory, order, coin, XP and push changes were rolled back. No synthetic funds remain.

## Cutover and rollback

Schema is deployed with real control disabled. After application deployment is live: stop the old pilot through its switch function (refunds pilot obligations), sync its latest OBS hashes, then enable real control, in one transaction. Do not copy pilot ledger/history. Owner then funds the real wallet in admin.

To stop partner drops safely, use the real admin switch or `rewards_streamer_live_api(primary_id,'switch','{"enabled":false}')`: in-flight transactions finish, active real rounds/codes are cancelled and unused reserves refunded. Keep real awards/ledger for accounting. Do not enable the pilot as an automatic fallback or reinterpret real balances. Application checkpoint: `rollback/pre-amych-production-20261107`.

A Twitch chat test with viewers after owner funding is still needed to verify their OBS scene and real end-to-end stream operation. No chat messages were sent on behalf of users.
