use serde::{ser::SerializeStruct, Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Note not found.")]
    NoteNotFound,
    #[error("Enter a tag name with a nonempty name at each level.")]
    InvalidTagName,
    #[error("Only tags at the same level can be reordered together.")]
    InvalidTagOrder,
    #[error("Rename the tag within its current parent.")]
    InvalidTagRename,
    #[error("That tag name is already in use.")]
    TagNameTaken,
    #[error("An encryption password is already set.")]
    PasswordAlreadySet,
    #[error("Enter a non-empty encryption password.")]
    EmptyPassword,
    #[error("Unlock the encryption session first.")]
    SessionLocked,
    #[error("The encryption operation failed.")]
    Encryption,
    #[error("Background task failed: {0}")]
    BackgroundTask(#[from] tokio::task::JoinError),
    #[error("Database operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database connection failed: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("Data directory could not be created: {0}")]
    DataDirectory(#[from] std::io::Error),
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
            Self::InvalidTagName => (
                "invalid_tag_name",
                "Enter a tag name with a nonempty name at each level.",
            ),
            Self::InvalidTagOrder => (
                "invalid_tag_order",
                "Only tags at the same level can be reordered together.",
            ),
            Self::InvalidTagRename => (
                "invalid_tag_rename",
                "Rename the tag within its current parent.",
            ),
            Self::TagNameTaken => ("tag_name_taken", "That tag name is already in use."),
            Self::PasswordAlreadySet => (
                "password_already_set",
                "An encryption password is already set.",
            ),
            Self::EmptyPassword => ("empty_password", "Enter a non-empty encryption password."),
            Self::SessionLocked => ("session_locked", "Unlock the encryption session first."),
            Self::Encryption => ("encryption_error", "The encryption operation failed."),
            Self::BackgroundTask(_) => ("background_task_error", "The background task failed."),
            Self::Sqlite(_) | Self::Pool(_) => ("database_error", "The database operation failed."),
            Self::DataDirectory(_) => {
                ("data_directory_error", "The data directory is unavailable.")
            }
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
