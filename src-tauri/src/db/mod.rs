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
    transaction.execute_batch(include_str!("schema.sql"))?;
    transaction.commit()?;

    Ok(pool)
}
