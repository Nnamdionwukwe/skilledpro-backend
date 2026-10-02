#!/usr/bin/env bash
BACKUP_ROOT="$HOME/backups/skilledproz-backups"

echo "═══════════════════════════════════════════"
echo "  BACKUP STATUS"
echo "═══════════════════════════════════════════"
echo ""

echo "── Latest backups ──"
echo "  Database: $(ls -t $BACKUP_ROOT/database/daily/*.sql.gz 2>/dev/null | head -1)"
echo "  Code:     $(ls -t $BACKUP_ROOT/code/daily/*.tar.gz 2>/dev/null | head -1)"
echo "  .env:     $(ls -t $BACKUP_ROOT/env/.env-* 2>/dev/null | head -1)"
echo ""

echo "── Counts ──"
echo "  Daily DBs:    $(ls $BACKUP_ROOT/database/daily/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') (14 days retained)"
echo "  Weekly DBs:   $(ls $BACKUP_ROOT/database/weekly/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') (8 weeks retained)"
echo "  Monthly DBs:  $(ls $BACKUP_ROOT/database/monthly/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') (12 months retained)"
echo "  Code dailies: $(ls $BACKUP_ROOT/code/daily/*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
echo ""

echo "── Total size ──"
du -sh "$BACKUP_ROOT" 2>/dev/null
echo ""

echo "── Latest 10 log lines ──"
tail -10 "$BACKUP_ROOT/logs/backup.log" 2>/dev/null
echo ""

echo "── Launchd job ──"
launchctl list | grep skilledproz || echo "  (not loaded)"
