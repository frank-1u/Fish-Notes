use std::{
    path::Path,
    sync::{Arc, RwLock},
};

use crate::{crypto::SessionKey, db, AppError};

#[derive(Clone)]
pub struct AppService {
    pub(crate) database: db::Database,
    pub(crate) session_key: Arc<RwLock<Option<SessionKey>>>,
}

impl AppService {
    pub fn open(data_dir: &Path) -> Result<Self, AppError> {
        Ok(Self {
            database: db::open(data_dir)?,
            session_key: Arc::default(),
        })
    }
}
