-- Extend course resources beyond video, PDF, images, text, and links.
alter type public.asset_type add value if not exists 'spreadsheet';
alter type public.asset_type add value if not exists 'document';