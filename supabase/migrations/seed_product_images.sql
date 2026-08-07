-- Marrow Fresh product photos. Images are self-hosted in the website's
-- /public/img folder (served by Netlify, so they don't use Supabase bandwidth).
-- Run once in Supabase → SQL Editor AFTER the site with these images is deployed.
-- Safe to re-run (idempotent UPDATEs by slug).

update products set image_url = '/img/chicken-curry-cut.jpg' where slug = 'chicken-curry-cut';
update products set image_url = '/img/chicken-boneless.jpg'  where slug = 'chicken-boneless';
update products set image_url = '/img/chicken-live.jpg'      where slug = 'chicken-live';
update products set image_url = '/img/chicken-wings.jpg'     where slug = 'chicken-wings';
update products set image_url = '/img/mutton-curry-cut.jpg'  where slug = 'mutton-curry-cut';
update products set image_url = '/img/mutton-boneless.jpg'   where slug = 'mutton-boneless';
update products set image_url = '/img/rohu-fish.jpg'         where slug = 'rohu-fish';
update products set image_url = '/img/katla-fish.jpg'        where slug = 'katla-fish';
update products set image_url = '/img/prawns-medium.jpg'     where slug = 'prawns-medium';
update products set image_url = '/img/mud-crab.webp'         where slug = 'mud-crab';
-- country-eggs: keep current placeholder until a real photo is added.
