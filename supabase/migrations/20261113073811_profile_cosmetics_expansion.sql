-- Expand profile cosmetics while preserving the existing frame prices.
-- Standard backgrounds remain 25 coins; premium animated neon backgrounds cost 50.
alter table public.rewards_profile_catalog
 drop constraint rewards_profile_catalog_check;

alter table public.rewards_profile_catalog
 add constraint rewards_profile_catalog_price_tier_check
 check (
   (kind='frame' and ((tier='simple' and price=5) or (tier='rare' and price=15) or (tier='animated' and price=50)))
   or (kind='background' and ((tier='background' and price=25) or (tier='background_premium' and price=50)))
 );

insert into public.rewards_profile_catalog(id,kind,name,tier,price) values
 ('fuchsia','frame','Фуксия','rare',15),
 ('coral','frame','Коралл','rare',15),
 ('toxic_green','frame','Токсичный зелёный','rare',15),
 ('lime','frame','Салатовый неон','rare',15),
 ('neon_red','frame','Красный неон','rare',15),
 ('neon_green','frame','Зелёный неон','rare',15),
 ('neon_pink','frame','Розовый неон','rare',15),
 ('neon_coral','frame','Коралловый неон','rare',15),
 ('green_wave','frame','Зелёная волна','animated',50),
 ('red_pulse','frame','Красный импульс','animated',50),
 ('pink_pulse','frame','Розовый импульс','animated',50),
 ('rose','background','Розовый закат','background',25),
 ('ocean','background','Океан','background',25),
 ('forest','background','Изумрудный лес','background',25),
 ('coral_bg','background','Коралловый свет','background',25),
 ('neon_fuchsia_bg','background','Неоновая фуксия','background_premium',50),
 ('neon_green_bg','background','Неоновый зелёный','background_premium',50),
 ('neon_red_bg','background','Неоновый красный','background_premium',50);
