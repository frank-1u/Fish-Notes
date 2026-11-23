use tauri::State;

use crate::AppError;

mod ai;
mod chats;
mod encryption;
mod images;
mod import_export;
mod notes;
mod search;
mod tags;

pub(crate) use ai::*;
pub(crate) use chats::*;
pub(crate) use encryption::*;
pub(crate) use images::*;
pub(crate) use import_export::*;
pub(crate) use notes::*;
pub(crate) use search::*;
pub(crate) use tags::*;

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    let result = tokio::task::spawn_blocking(operation).await?;
    if let Err(error) = &result {
        log::warn!("{error}");
    }
    result
}

type Service<'a> = State<'a, crate::AppService>;
