mod ai;
mod chats;
mod commands;
mod db;
mod desktop;
mod error;
mod notes;
mod service;

pub use ai::{
    AiConfig, AiProtocol, ChatRequest, ChatScope, ChatStreamEvent, NoteSource, PublicAiConfig,
};
pub use chats::{ChatData, ChatMessageData, ChatRole, Message};
pub use desktop::run;
pub use error::AppError;
pub use notes::{NoteData, NoteSummary, NoteUpdate};
pub use service::AppService;
