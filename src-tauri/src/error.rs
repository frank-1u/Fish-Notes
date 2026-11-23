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
    #[error("Unsupported file type.")]
    ImportExtension,
    #[error("File could not be read: {0}")]
    ImportRead(std::io::Error),
    #[error("HTML could not be converted to Markdown: {0}")]
    ImportHtml(std::io::Error),
    #[error("The selection is not a local file.")]
    NonLocalFile,
    #[error("The export could not be written: {0}")]
    ExportWrite(std::io::Error),
    #[error("Unsupported image MIME type.")]
    UnsupportedImageType,
    #[error("Expected a raw image upload.")]
    InvalidImageUpload,
    #[error("Invalid image path.")]
    InvalidImagePath,
    #[error("Image storage operation failed: {0}")]
    ImageStorage(std::io::Error),
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
            Self::ImportExtension => ("import_extension_error", "Unsupported file type."),
            Self::ImportRead(_) => ("import_read_error", "The file could not be read."),
            Self::ImportHtml(_) => ("import_html_error", "The HTML file could not be converted."),
            Self::NonLocalFile => ("non_local_file", "Select a local file."),
            Self::ExportWrite(_) => ("export_write_error", "The export could not be written."),
            Self::UnsupportedImageType => ("unsupported_image_type", "Unsupported image type."),
            Self::InvalidImageUpload => ("invalid_image_upload", "Expected a raw image upload."),
            Self::InvalidImagePath => ("invalid_image_path", "Invalid image path."),
            Self::ImageStorage(_) => (
                "image_storage_error",
                "The image could not be stored or read.",
            ),
        };
        let mut error = serializer.serialize_struct("AppError", 2)?;
        error.serialize_field("code", code)?;
        error.serialize_field("message", message)?;
        error.end()
    }
}
