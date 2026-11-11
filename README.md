# The Lions Den

The Lions skittles team app (Golden Lion, Weston-super-Mare): https://the-lions-den.com (old address https://the-lions-den.github.io forwards to it)

## What's here
- `app/`: the app itself (one page that works offline). Published to GitHub Pages by the job below.
- `scripts/feed.py`: reads the Central Skittle League website (Division 2 table, cup draw pictures, Lions fixtures PDF) and writes `feed.json` for the app.
- `.github/workflows/publish.yml`: publishes the app whenever a new version is pushed, and every 3 hours refreshes the league data. It also keeps the Supabase project awake and stops GitHub switching the schedule off over the summer.
- `.github/workflows/backup.yml`: nightly encrypted backup of the shared team data into `backups/`.
- `supabase/setup.sql`: the one-off database setup (tables, who-can-do-what rules, live updates). Run it once in Supabase → SQL Editor.

## Who can do what
- **Admins** (Andy Nancollis, Dave Dibble, Adam Watt): everything, including subs and switching scorers on or off.
- **Scorers**: on match night, change the line-up, add a player, enter scores and opposition names, sign the league card.
- **Everyone else**: sees everything, no sign-in.
The database enforces these rules itself.

## Restoring a backup
Backups are encrypted with the passphrase saved as the `BACKUP_PASSPHRASE` secret. To read one:

    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in backups/lions-den-YYYY-MM-DD.json.gz.enc -out backup.json.gz -pass pass:'YOUR PASSPHRASE'
    gunzip backup.json.gz

`backup.json` holds every shared item (`docs`) and the sign-in roles (`people`). Ask Claude to restore it.

## Each season
Check the page addresses in the CONFIG section of `scripts/feed.py` still match the league website, and update the squad and fixtures in the app.

## Building a new version
1. Edit `app/index.html` (the whole app is in this one file; `scripts/feed.py` for the league reader).
2. Run `scripts/build.sh "what changed"`. It checks the app, runs the multi-phone test (`tests/sync.js`),
   bumps the version in `app/sw.js`, commits, pushes and waits for GitHub, then prints the times.
Phones pick up the new version the next time the app is opened.
