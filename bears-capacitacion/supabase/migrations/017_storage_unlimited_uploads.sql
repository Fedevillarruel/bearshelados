update storage.buckets
set file_size_limit = 53687091200
where id in ('course-media', 'manuals');