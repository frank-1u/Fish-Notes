use serde::{ser::SerializeStruct, Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Configure the AI provider in Settings first.")]
    AiNotConfigured,
    #[error("{0}")]
    AiConfig(&'static str),
    #[error("{0}")]
    AiInput(&'static str),
    #[error("Could not connect to the AI provider or read its response.")]
    AiTransport,
    #[error("AI provider returned HTTP {0}.")]
    AiHttp(u16),
    #[error("The AI provider returned an invalid or incomplete response.")]
    AiResponse,
    #[error("This AI request is already active.")]
    AiRequestActive,
    #[error("The AI response channel could not be reached.")]
    AiChannel,
    #[error("Chat not found.")]
    ChatNotFound,
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

impl AppError {
    pub(crate) fn public_parts(&self) -> (&'static str, &'static str) {
        match self {
            Self::AiNotConfigured => (
                "ai_not_configured",
                "Configure the AI provider in Settings first.",
            ),
            Self::AiConfig(message) => ("ai_config_error", *message),
            Self::AiInput(message) => ("ai_input_error", *message),
            Self::AiTransport => (
                "ai_transport_error",
                "Could not connect to the AI provider or read its response.",
            ),
            Self::AiHttp(status) => (
                "ai_http_error",
                match status {
                    401 | 403 => "The AI provider rejected the credentials.",
                    404 => "The AI endpoint or model was not found. Check the base URL and model.",
                    429 => "The AI provider rate limit was exceeded.",
                    _ => "The AI provider rejected the request.",
                },
            ),
            Self::AiResponse => (
                "ai_response_error",
                "The AI provider returned an invalid or incomplete response.",
            ),
            Self::AiRequestActive => ("ai_request_active", "This AI request is already active."),
            Self::AiChannel => (
                "ai_channel_error",
                "The AI response channel could not be reached.",
            ),
            Self::ChatNotFound => ("chat_not_found", "Chat not found."),
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
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let (code, message) = self.public_parts();
        let mut error = serializer.serialize_struct("AppError", 2)?;
        error.serialize_field("code", code)?;
        error.serialize_field("message", message)?;
        error.end()
    }
}
