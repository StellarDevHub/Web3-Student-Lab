# Database Backup, WAL Archiving & Point-In-Time Recovery (BE-084)

Production disaster recovery for PostgreSQL. The pipeline is implemented by
[`scripts/db-backup-pitr.sh`](../scripts/db-backup-pitr.sh), scheduled by
[`k8s/backup-cronjob.yaml`](../k8s/backup-cronjob.yaml), and exercised on every
relevant pull request by the **PITR Restore Drill** job in
[`.github/workflows/disaster-recovery.yml`](../.github/workflows/disaster-recovery.yml).

## Architecture

```
                     ┌────────────────────────────────────────────┐
 PostgreSQL primary  │ archive_mode = on                          │
                     │ archive_command → db-backup-pitr.sh        │
                     │                    wal-archive %p %f       │
                     └───────────────┬────────────────────────────┘
                                     │ encrypt (AES-256-CBC/PBKDF2)
                                     ▼
              ┌──────────────────────────────────────────┐
              │ S3 bucket — us-east-1                    │
              │   pitr/base/<epoch>-<iso>/manifest.env   │
              │   pitr/base/<epoch>-<iso>/*.tar.gz.enc   │
              │   pitr/wal/<segment>*.enc                │
              └──────────────────────────────────────────┘
                                     │ replicated to every bucket
                                     ▼
              ┌──────────────────────────────────────────┐
              │ S3 bucket — eu-west-1 (second region)    │
              └──────────────────────────────────────────┘

 daily 02:00 UTC   postgres-base-backup   → pg_basebackup + encrypted upload
 every 15 min      postgres-wal-health    → fails when WAL lag > RPO budget
 daily 03:00 UTC   postgres-pitr-drill    → restore + WAL replay + integrity SQL
 monthly           postgres-cold-storage  → move old bases to DEEP_ARCHIVE
```

WAL archiving is **continuous**: PostgreSQL invokes `archive_command` for every
completed segment (and `archive_timeout` forces a segment even on an idle
system). Each upload is verified in every configured region before the command
returns success; PostgreSQL retries otherwise, so a partial region outage
cannot silently create a WAL gap.

## Recovery objectives

| Requirement | Budget | Enforcement |
| --- | --- | --- |
| RTO (restore to serving staging instance) | **< 30 minutes** (`BACKUP_RTO_BUDGET_SECONDS=1800`) | `drill` fails the job if the measured duration exceeds the budget |
| RPO (data window that can be lost) | **< 5 minutes** (`BACKUP_RPO_BUDGET_SECONDS=300`) | `drill` compares the newest archived WAL against the target; `status --check` alarms every 15 minutes |

The CI drill validates the mechanism on a small dataset; production RTO must
also be exercised against production-sized data — raise the PVC size and the
`activeDeadlineSeconds` in the drill CronJob accordingly.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_STORAGE` | `s3` | `local` for CI/drills, `s3` for production |
| `BACKUP_LOCAL_DIR` | `/var/backups/pitr` | Root for `BACKUP_STORAGE=local` |
| `BACKUP_S3_BUCKETS` | — | Comma-separated buckets; every object is written to all of them |
| `BACKUP_S3_BUCKET` | — | Single-bucket alias used when `BACKUP_S3_BUCKETS` is unset |
| `BACKUP_S3_PREFIX` | `pitr` | Key prefix inside every bucket |
| `BACKUP_S3_REGION` | `AWS_REGION` / `us-east-1` | Region passed to the AWS CLI |
| `BACKUP_ENCRYPTION` | `openssl` | `none` is only acceptable for local drill data |
| `BACKUP_ENCRYPTION_KEY` / `BACKUP_ENCRYPTION_KEY_FILE` | — | AES-256 key; store it outside the backup account |
| `BACKUP_RETENTION_DAYS` | `30` | Hot base-backup retention |
| `BACKUP_WAL_RETENTION_DAYS` | `14` | Local WAL retention (S3 uses a lifecycle rule) |
| `BACKUP_COLD_AFTER_DAYS` | `14` | Age at which `cold-storage` moves a base backup |
| `BACKUP_RTO_BUDGET_SECONDS` | `1800` | Drill fails above this |
| `BACKUP_RPO_BUDGET_SECONDS` | `300` | Drill and `status --check` fail above this |
| `STAGING_PORT` | `55433` | Port for the throwaway restored instance |
| `PITR_VERIFY_SQL` | table count in `public` | Integrity query run after promotion |
| `PITR_EXPECTED_RESULT` | unset | If set, the query result must match exactly |
| `PITR_REPORT_PATH` | unset | Writes the drill JSON report to this path |
| `PITR_KEEP_RESTORE` | `false` | Keep the restored data directory for debugging |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | libpq defaults | Primary connection |

Standard `PGSSLMODE`, `PGSSLROOTCERT` and AWS credential/provider variables are
honoured by the underlying clients.

## Commands

```bash
# Daily full backup (encrypted, every region, retention applied)
scripts/db-backup-pitr.sh base-backup

# PostgreSQL archive_command target (configure in postgresql.conf)
archive_mode = on
archive_command = '/opt/backup/db-backup-pitr.sh wal-archive %p %f'

# Health: latest base backup age and WAL archive lag (exit 1 on RPO breach)
scripts/db-backup-pitr.sh status --check

# Prepare a data directory for PITR (does not start it)
scripts/db-backup-pitr.sh restore \
  --target-time 2026-11-23T10:15:00.000Z \
  --dest /restore/pitr

# Full automated drill: restore → replay → promote → verify → RTO/RPO gates
scripts/db-backup-pitr.sh drill \
  --target-time 2026-11-23T10:15:00.000Z \
  --dest /scratch/restore \
  --port 55433

# Move base backups older than BACKUP_COLD_AFTER_DAYS to cold storage
scripts/db-backup-pitr.sh cold-storage
```

`--target-time` must be a timestamp for which archived WAL **after** the target
exists. PostgreSQL stops at the first transaction with a commit time at or
after the target; if the target is later than the end of the archived WAL the
recovery intentionally fails instead of silently restoring newer data. When
choosing a target, use an application-level timestamp (audit row, incident
time, deploy marker), not an arbitrary clock value on an idle database.

## Restore runbook

1. Declare the target time and reason. Record it in the incident channel.
2. Retrieve the encryption key from the secrets manager (it is not in S3).
3. Prepare the data directory:

   ```bash
   scripts/db-backup-pitr.sh restore --target-time "$TARGET" --dest /restore/pitr
   ```

   The latest base backup at or before `$TARGET` is selected, downloaded,
   checksum-verified, decrypted and extracted. `postgresql.auto.conf` gets a
   `restore_command` pointing back at this script, plus the recovery target.
4. Start PostgreSQL as the `postgres` user:

   ```bash
   pg_ctl -D /restore/pitr -l /restore/pitr.log -w -t 1800 start
   ```

   Recovery replays archived WAL, promotes at the target time and logs
   `database system is ready to accept connections`.
5. Verify data before cutting over. For example compare row counts against the
   expected values captured at the target time, then run tenant-level checks.
6. Remove `/restore/pitr/.pitr-encryption.key` after recovery/promotion.
7. Point the application at the restored instance, or promote it through the
   normal failover mechanism.

## Key management

- All objects are encrypted client-side with AES-256-CBC and PBKDF2 before
  upload. Bucket-side encryption does **not** replace this: the key must be
  unavailable to whoever can list the buckets.
- Keep `BACKUP_ENCRYPTION_KEY` in a managed secrets store, backed up separately
  from the database and from AWS. Losing it makes every backup unrecoverable.
- Rotation: create a new key, keep the old key available for restores of older
  backups, re-encrypt by taking a fresh base backup, then retire the old key
  after the retention window.
- The restore directory contains a 0600 copy of the key while recovery runs so
  `restore_command` can decrypt WAL. The drill removes it automatically; a
  manual restore must remove it after promotion.

## Kubernetes deployment

1. Build and push the tools image (see `k8s/Dockerfile.backup-tools`).
2. Create the `db-backup-pitr-secrets` Secret described at the top of
   `k8s/backup-cronjob.yaml`.
3. Ensure the PostgreSQL pods run with `archive_mode`, `archive_command` and
   `archive_timeout` as documented. The CronJob that takes **base backups**
   cannot compensate for a missing WAL stream.
4. Configure the buckets:
   - versioning + object lock per your compliance policy,
   - lifecycle expiration for `pitr/wal/` (e.g. 14 days),
   - cross-region replication as a second layer (the script also writes to
     every bucket in `BACKUP_S3_BUCKETS`),
   - a `DEEP_ARCHIVE` lifecycle rule for `pitr/cold/`.
5. Apply the manifest and verify:

   ```bash
   kubectl apply -f k8s/backup-cronjob.yaml
   kubectl -n web3-student-lab create job --from=cronjob/postgres-base-backup manual-backup-$(date +%s)
   kubectl -n web3-student-lab logs job/manual-backup-...
   ```

6. Alert on failed `postgres-wal-health` and `postgres-pitr-drill` jobs. A
   failing drill is a production incident, not a routine cron failure.

## CI drill

The `pitr-drill` job in `.github/workflows/disaster-recovery.yml` installs
PostgreSQL 15, starts a primary with WAL archiving enabled, seeds data, takes a
base backup, writes a transaction inside the target window and another after
it, simulates a disaster with `DROP TABLE`, then runs `drill` and asserts:

- the restore reaches the requested target time,
- the expected rows are present (post-target rows are **not**),
- recovery takes less than 30 minutes,
- the newest archived WAL is within 5 minutes of the target.

The drill report is uploaded as a build artifact.

## Limitations / operational notes

- `wal-archive` refuses filenames that are not completed 24-hex segments,
  `.backup` label files, or `.history` files. A `.partial` name indicates a
  PostgreSQL configuration error and is never marked archived.
- S3 listing timestamps have minute granularity; `status --check` is therefore
  an early-warning mechanism, not a millisecond-accurate RPO measurement.
- WAL retention for S3 is enforced with a bucket lifecycle rule; the script
  only prunes local WAL to avoid accidentally deleting restorable history.
- Cold backups under `pitr/cold/` are not selected automatically by `restore`.
  Restoring from cold storage is a deliberate, slower operation: copy the
  object back to `pitr/base/<id>/` first.
- The AWS CLI reads credentials from the pod environment (IRSA is preferred to
  static keys in production).
