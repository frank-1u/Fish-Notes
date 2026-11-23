use super::{run_blocking, Service};
use crate::{AppError, SearchResult};

#[tauri::command]
pub(crate) async fn search_notes(
    state: Service<'_>,
    query: String,
) -> Result<Vec<SearchResult>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.search_notes(&query)).await
}
