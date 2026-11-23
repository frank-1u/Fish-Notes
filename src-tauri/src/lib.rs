mod commands;
mod db;
mod desktop;
mod error;
mod notes;
mod search;
mod service;
mod tags;

pub use desktop::run;
pub use error::AppError;
pub use notes::{NoteData, NoteSummary, NoteUpdate};
pub use search::{SearchResult, SnippetPart};
pub use service::AppService;
pub use tags::TagData;
