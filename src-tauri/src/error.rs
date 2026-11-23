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
    #[error("Background task failed: {0}")]
    BackgroundTask(#[from] tokio::task::JoinError),
    #[error("Database operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database connection failed: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("Data directory could not be created: {0}")]
    DataDirectory(#[from] std::io::Error),
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
            Self::BackgroundTask(_) => ("background_task_error", "The background task failed."),
            Self::Sqlite(_) | Self::Pool(_) => ("database_error", "The database operation failed."),
            Self::DataDirectory(_) => {
                ("data_directory_error", "The data directory is unavailable.")
            }
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
