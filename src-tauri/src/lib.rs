mod ai;
mod chats;
mod commands;
mod crypto;
mod db;
mod desktop;
mod error;
mod images;
mod import_export;
mod notes;
mod search;
mod service;
mod tags;

pub use ai::{
    AiConfig, AiProtocol, ChatRequest, ChatScope, ChatStreamEvent, NoteSource, PublicAiConfig,
};
pub use chats::{ChatData, ChatMessageData, ChatRole, Message};
pub use desktop::run;
pub use error::AppError;
pub use import_export::{ImportFailure, ImportResult};
pub use notes::{NoteData, NoteSummary, NoteUpdate};
pub use search::{SearchResult, SnippetPart};
pub use service::AppService;
pub use tags::TagData;
