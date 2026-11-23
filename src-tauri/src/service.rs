use std::{
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use crate::{ai::AiState, crypto::SessionKey, db, AppError};

#[derive(Clone)]
pub struct AppService {
    pub(crate) database: db::Database,
    pub(crate) data_dir: PathBuf,
    pub(crate) session_key: Arc<RwLock<Option<SessionKey>>>,
    pub(crate) ai: Arc<AiState>,
}

impl AppService {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        Ok(Self {
            database: db::open(data_dir)?,
            data_dir: data_dir.to_path_buf(),
            session_key: Arc::default(),
            ai: Arc::new(AiState::new()?),
        })
    }
}
