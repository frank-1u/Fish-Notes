use std::path::{Path, PathBuf};

use crate::{db, AppError};

#[derive(Clone)]
pub struct AppService {
    pub(crate) database: db::Database,
    pub(crate) data_dir: PathBuf,
}

impl AppService {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        Ok(Self {
            database: db::open(data_dir)?,
            data_dir: data_dir.to_path_buf(),
        })
    }
}
