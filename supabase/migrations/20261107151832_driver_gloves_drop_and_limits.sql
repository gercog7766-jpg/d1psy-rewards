-- Main broadcaster drop limits. Preserve current saved values and active rounds.
alter table public.rewards_settings drop constraint rewards_settings_message_threshold_check;
alter table public.rewards_settings add constraint rewards_settings_message_threshold_check check(message_threshold between 5 and 5000);
alter table public.rewards_settings drop constraint rewards_settings_drop_price_range_check;
alter table public.rewards_settings add constraint rewards_settings_drop_price_range_check check(drop_min_price_coins between 2 and 3000 and drop_max_price_coins between drop_min_price_coins and 3000);
-- Drop pool only: do not create shop items, variants or offers.
insert into public.rewards_prizes(name,image_url,status,unlimited,draw_weight,sell_price_coins)
select 'Водительские перчатки | Гоночный зелёный BS','https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5T441rsfhr9kYDl7h1I4_utY5t-NPmHDW-VxdFxouRsQRa0hxg-jDGMnYftb3mXblQnWJclRuNYtETux9DlYr-wtVaK2IsTmCT-jC4Y6ihjtr0FUaA7uvqAQikoKDk','available',true,1,2500
where not exists(select 1 from public.rewards_prizes where name='Водительские перчатки | Гоночный зелёный BS');
