use std::path::Path;

use crate::{db, AppError};

#[derive(Clone)]
pub struct AppService {
    pub(crate) database: db::Database,
}

impl AppService {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        Ok(Self {
            database: db::open(data_dir)?,
        })
    }
}
