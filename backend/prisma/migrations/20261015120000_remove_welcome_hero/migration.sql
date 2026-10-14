-- The storefront's "Welcome Hero" section is retired. Its data lived only
-- inside "stores"."homepage" (JSONB): an entry { key: "hero", enabled,
-- settings: { title, subtitle, layout, ctaLabel } } in the ordered
-- "sections" list, or a "hero" flag in the legacy boolean-map shape.
-- Remove both, keeping every other section in its saved order. Data only —
-- no schema change.

UPDATE "stores"
SET "homepage" = jsonb_set(
  "homepage",
  '{sections}',
  COALESCE(
    (
      SELECT jsonb_agg(section.value ORDER BY section.ord)
      FROM jsonb_array_elements("homepage" -> 'sections') WITH ORDINALITY AS section(value, ord)
      WHERE section.value ->> 'key' IS DISTINCT FROM 'hero'
    ),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof("homepage" -> 'sections') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("homepage" -> 'sections') AS section(value)
    WHERE section.value ->> 'key' = 'hero'
  );

UPDATE "stores"
SET "homepage" = "homepage" - 'hero'
WHERE jsonb_typeof("homepage") = 'object'
  AND "homepage" ? 'hero';
