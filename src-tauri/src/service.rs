use std::{path::Path, sync::Arc};

use crate::{ai::AiState, db, AppError};

#[derive(Clone)]
pub struct AppService {
    pub(crate) database: db::Database,
    pub(crate) ai: Arc<AiState>,
}

impl AppService {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        Ok(Self {
            database: db::open(data_dir)?,
            ai: Arc::new(AiState::new()?),
        })
    }
}
