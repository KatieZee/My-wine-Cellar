# My Cellar

A wine cellar tracker that ranks which bottles to drink next by drinking window, tracks value, and logs what you've drunk.

## Deploy on Vercel

1. **Import** this repo in Vercel (Add New → Project). No build settings needed.
2. **Database:** in the project, open **Storage → Create → Upstash for Redis** (free tier) and connect it to the project.
3. **Password:** **Settings → Environment Variables** → add `CELLAR_PASSWORD` with a strong password.
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new settings take effect.

Open the site, enter your password once per device, and your cellar syncs everywhere.

## Moving your data in

In the Claude version, go to **Import / export → Copy as JSON**, then paste it into the same box on this site and press **Restore from JSON**.
