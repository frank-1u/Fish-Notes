use std::{path::Path, time::Duration};

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::TransactionBehavior;

use crate::AppError;

pub(crate) type Database = Pool<SqliteConnectionManager>;

pub(crate) fn open(data_dir: &Path) -> Result<Database, AppError> {
    std::fs::create_dir_all(data_dir)?;
    let manager = SqliteConnectionManager::file(data_dir.join("fish-notes.db")).with_init(|conn| {
        conn.busy_timeout(Duration::from_millis(5000))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        Ok(())
    });
    let pool = Pool::builder()
        .max_size(4)
        .min_idle(Some(1))
        .build(manager)?;

    let mut conn = pool.get()?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let legacy_fts: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name = 'notes_fts')
            AND NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE name = 'notes_fts_content')",
        [],
        |row| row.get(0),
    )?;
    if legacy_fts {
        transaction.execute_batch(
            "DROP TRIGGER IF EXISTS notes_ai;
             DROP TRIGGER IF EXISTS notes_ad;
             DROP TRIGGER IF EXISTS notes_au;
             DROP TABLE notes_fts;",
        )?;
    }
    transaction.execute_batch(include_str!("schema.sql"))?;
    if legacy_fts {
        transaction.execute("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')", [])?;
    }
    transaction.commit()?;

    Ok(pool)
}
