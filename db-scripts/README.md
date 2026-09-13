# SkilledProz Backend — Database Re-Host Kit

Complete SQL scripts to recreate the entire SkilledProz database from scratch on any fresh Postgres server.

## 📋 Requirements

- PostgreSQL 14+ (tested on 16)
- A database user with CREATE privileges
- A database named `skilledproz` (or your choice)

## 🚀 Quick Start — Rebuild from Scratch

### 1. Create the database

```bash
sudo -u postgres createdb -O prisma skilledproz
```

### 2. Run the rebuild

```bash
psql -U prisma -d skilledproz -f rebuild-all.sql
```

**That's it.** The database now has:
- 31 enums
- 50 tables
- 84 foreign keys
- 152 indexes

## 📁 File Structure

```
db-scripts/
├── README.md                      ← this file
├── 00-init.sql                    ← extensions (uuid-ossp, pgcrypto)
├── 01-enums.sql                   ← all 31 enums
├── 99-final-fks.sql               ← deferred FKs (dependency order)
├── rebuild-all.sql                ← runs EVERYTHING in order  ⭐
├── dump-current-db.sh             ← backup live DB to timestamped file
└── controllers/
    ├── 02-auth.sql                ← User, WorkerProfile, HirerProfile
    ├── 02-user.sql                ← User, DeviceToken, SavedWorker, SavedJob
    ├── 03-worker.sql              ← WorkerProfile + related
    ├── 04-hirer.sql               ← HirerProfile
    ├── 05-booking.sql             ← Booking, Review, Conversation, Message, VideoCall
    ├── 06-payment.sql             ← Payment
    ├── 07-refund.sql              ← Refund
    ├── 08-hirerWallet.sql         ← Wallets + transactions + withdrawals
    ├── 09-adminLog.sql            ← AuditLog, Report, AppSettings
    ├── 10-job.sql                 ← JobPost, JobCategory, JobApplication
    ├── 13-category.sql            ← Category
    ├── 14-campaign.sql            ← Campaign* tables
    ├── 18-feedback.sql            ← Feedback
    ├── 23-notification.sql        ← Notification
    ├── 24-post.sql                ← Post, PostReaction, PostComment
    ├── 26-referral.sql            ← Referral
    ├── 30-subscription.sql        ← Subscription, PromoCode, FeaturedListing
    ├── 31-survey.sql              ← SurveyResponse
    └── 34-waitlist.sql            ← Waitlist tables
```

## 🎯 What Each File Does

| File | Purpose |
|------|---------|
| `00-init.sql` | Extensions: `uuid-ossp`, `pgcrypto` |
| `01-enums.sql` | All Postgres enums (idempotent via DO blocks) |
| `controllers/*.sql` | Tables grouped by controller/feature |
| `99-final-fks.sql` | FKs that need all tables to exist first |
| `rebuild-all.sql` | Concatenates everything in the correct order |
| `dump-current-db.sh` | Live backup with data |

## 🔄 Running Individual Controller Files

Each controller file is **idempotent** (uses `IF NOT EXISTS`). You can run them individually to add missing tables:

```bash
psql -U prisma -d skilledproz -f controllers/07-refund.sql
```

## 💾 Backup the Live Database

```bash
./dump-current-db.sh
```

Creates `dumps/skilledproz-full-YYYY-MM-DD-HHMMSS.sql.gz` — includes:
- Full schema (`CREATE` statements)
- All data (`INSERT` statements)
- Runs `DROP` first, so it's safe to restore over an existing DB

### Restore from a dump

```bash
gunzip -c dumps/skilledproz-full-XXXX.sql.gz | psql -U prisma -d skilledproz
```

## 🧪 Verify the Rebuild

```bash
# Count tables (should be 50)
psql -U prisma -d skilledproz -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"

# Count enums (should be 31)
psql -U prisma -d skilledproz -t -c "SELECT count(*) FROM pg_type WHERE typtype='e';"

# Count foreign keys (should be 84)
psql -U prisma -d skilledproz -t -c "SELECT count(*) FROM pg_constraint WHERE contype='f';"

# Count indexes (should be 152)
psql -U prisma -d skilledproz -t -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public';"
```

## ⚠️ Important Notes

### Regenerating the SQL from Prisma

If the Prisma schema changes, regenerate the SQL:

```bash
cd /path/to/skilledpro-backend
./node_modules/.bin/prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > db-scripts/_full-schema.sql

cd db-scripts
./split-schema.sh          # regenerates controllers/*.sql
./patch-if-not-exists.sh   # adds IF NOT EXISTS
./make-rebuild.sh          # rebuilds rebuild-all.sql
```

### Why Deferred FKs?

Prisma emits `ALTER TABLE ... ADD CONSTRAINT` statements inline. When Table A references Table B, but B is created later in the SQL, the FK fails. We fix this by moving 2 problematic FKs into `99-final-fks.sql`, which runs last.

### Testing on a Scratch DB

Before trusting the kit on a real rebuild, test on a scratch DB:

```bash
sudo -u postgres createdb -O prisma skilledproz_test
sudo -u postgres psql skilledproz_test < rebuild-all.sql
sudo -u postgres dropdb skilledproz_test
```

## 🚢 Re-Hosting on a New Server

1. **Set up Postgres + user:**

   ```bash
   sudo apt install postgresql postgresql-contrib
   sudo -u postgres createuser --createdb prisma
   sudo -u postgres psql -c "ALTER USER prisma WITH PASSWORD 'your-password';"
   sudo -u postgres createdb -O prisma skilledproz
   ```

2. **Copy `db-scripts/` to the new server:**

   ```bash
   rsync -avz db-scripts/ user@new-server:/tmp/db-scripts/
   ```

3. **Run the rebuild:**

   ```bash
   ssh user@new-server "sudo -u postgres psql skilledproz < /tmp/db-scripts/rebuild-all.sql"
   ```

4. **Point your app at the new DB** (update `DATABASE_URL` in `.env`).

5. **Verify with the app:**

   ```bash
   cd /path/to/skilledpro-backend
   ./node_modules/.bin/prisma db pull --print
   # Should show all 50 models
   ```

6. **Restore data (optional):**

   If you have a `dumps/skilledproz-full-XXXX.sql.gz`, restore:

   ```bash
   gunzip -c skilledproz-full-XXXX.sql.gz | psql -U prisma -d skilledproz
   ```

## 📊 Current Stats

| Metric | Count |
|--------|-------|
| Enums | 31 |
| Tables | 50 |
| Foreign Keys | 84 |
| Indexes | 152 |
| Total SQL lines | ~1864 |

**Last verified:** 2026-09-13 — rebuild matches live DB 100%

---

*Generated by the SkilledProz re-host kit builder.*
