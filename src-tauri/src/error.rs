use serde::{ser::SerializeStruct, Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Note not found.")]
    NoteNotFound,
    #[error("Background task failed: {0}")]
    BackgroundTask(#[from] tokio::task::JoinError),
    #[error("Database operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database connection failed: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("Data directory could not be created: {0}")]
    DataDirectory(#[from] std::io::Error),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let (code, message) = match self {
            Self::NoteNotFound => ("note_not_found", "Note not found."),
            Self::BackgroundTask(_) => ("background_task_error", "The background task failed."),
            Self::Sqlite(_) | Self::Pool(_) => ("database_error", "The database operation failed."),
            Self::DataDirectory(_) => {
                ("data_directory_error", "The data directory is unavailable.")
            }
        };
        let mut error = serializer.serialize_struct("AppError", 2)?;
        error.serialize_field("code", code)?;
        error.serialize_field("message", message)?;
        error.end()
    }
}
