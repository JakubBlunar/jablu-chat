-- Set a default color on @everyone roles that don't have one
UPDATE server_roles SET color = '#99aab5' WHERE is_default = true AND (color IS NULL OR color = '');
