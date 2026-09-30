-- READ ONLY. Run through an existing approved private DB connection.
-- Events, not unique people/cohorts. Do not divide adjacent rows into a CVR.
-- Internal/test users are NOT excluded: segment them before business decisions.
-- Client-side CTA clicks live in Vercel Analytics, not in this table.
-- GSC impressions/clicks and real paid customers need their own verified source.
SELECT event_name,
       count(*) FILTER (WHERE occurred_at >= now() - interval '7 days') AS events_7d,
       count(*) AS events_28d
FROM public.analytics_events
WHERE occurred_at >= now() - interval '28 days'
  AND event_name IN ('try_demo_started','try_demo_completed','try_demo_failed',
                    'signup_completed','plan_generated','plan_quality_warning',
                    'share_link_created','checkout_started','checkout_success')
GROUP BY event_name ORDER BY event_name;

-- Article attribution ends at demo output: no invented article-to-revenue link.
SELECT metadata->>'article_slug' AS public_article_slug,
       count(*) FILTER (WHERE event_name = 'try_demo_started') AS started_events,
       count(*) FILTER (WHERE event_name = 'try_demo_completed') AS completed_events,
       count(*) FILTER (WHERE event_name = 'try_demo_failed') AS failed_events
FROM public.analytics_events
WHERE occurred_at >= now() - interval '28 days'
  AND metadata->>'entry_source' = 'blog'
  AND event_name IN ('try_demo_started','try_demo_completed','try_demo_failed')
GROUP BY metadata->>'article_slug' ORDER BY completed_events DESC;
