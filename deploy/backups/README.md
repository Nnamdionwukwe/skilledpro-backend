# SkilledProz Backup System

Daily backups of the production database and codebase, pulled to the local Mac
from the Hetzner server (Coolify-managed).

## Files
- `backup-all.sh` — main backup (dumps Postgres, archives code, applies retention)
- `catchup-backup.sh` — runs on Mac wake; triggers backup if >12h stale
- `restore.sh` — interactive restore utility
- `status.sh` — reports backup age, counts, sizes
- `launchd/*.plist` — macOS launchd schedules (3 AM daily + wake catch-up)

## Install on a new Mac
    mkdir -p ~/backups/skilledproz-backups/scripts
    cp deploy/backups/*.sh ~/backups/skilledproz-backups/scripts/
    chmod +x ~/backups/skilledproz-backups/scripts/*.sh

    cp deploy/backups/launchd/*.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.skilledproz.backup.plist
    launchctl load ~/Library/LaunchAgents/com.skilledproz.backup.catchup.plist

    ~/backups/skilledproz-backups/scripts/backup-all.sh

## Server details
- Server: Hetzner (157.90.20.7)
- SSH key: ~/.ssh/id_ed25519
- Postgres container: vl4bcqsmw3nohmfwwkitijej (managed by Coolify)
