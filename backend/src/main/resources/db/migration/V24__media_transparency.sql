-- Images with a transparent background (cut-outs used by templates) keep it: their variants are PNG instead of JPEG.
alter table media_assets add column variant_ext varchar(3) not null default 'jpg';
alter table media_assets add constraint media_assets_variant_ext check (variant_ext in ('jpg', 'png'));
-- Main colour of the photo (#rrggbb): templates tint the background behind a product photo with it.
alter table media_assets add column color varchar(7);
