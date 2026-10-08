# Ronak Muscle Coach — AI Backend Package

This package contains the Netlify-ready Ronak Muscle Coach frontend plus the protected Supabase `rmc-coach` Edge Function.

## Included
- Local-first fitness dashboard
- 3,000 kcal / 180 g starting targets
- PPL workout rotation
- Food/calorie/protein logging
- Weight trend logging
- Supabase authentication
- Cross-device `rmc_cloud_state` sync
- Protected AI Coach invocation
- Proposed Coach actions (never silently applied)
- Netlify SPA fallback
- Supabase Edge Function source

## Required one-time Supabase secret setup

In Supabase Dashboard for project `uomfngyswypokhrjsrop`:

Edge Functions → Secrets

Add:
- `OPENAI_API_KEY` = your current OpenAI API key
- `OPENAI_MODEL` = `gpt-5-mini`

Do NOT put the OpenAI key in this ZIP, GitHub, Netlify frontend environment, or browser code.

The existing database tables used by the Coach are:
`rmc_cloud_state`, `rmc_daily_logs`, `rmc_food_logs`, `rmc_workout_sets`, `rmc_coach_runs`, `rmc_coach_actions`.

The `rmc-coach` function must remain JWT protected.

## Deploy frontend
Upload this folder/repository to Netlify. Publish directory is `.`.

## Deploy function
The function source is at:
`supabase/functions/rmc-coach/index.ts`

The active Supabase project already has `rmc-coach` deployed. The ZIP includes the source for reproducibility.

## Security
The OpenAI API key is intentionally NOT included in this package.
