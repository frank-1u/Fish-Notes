use super::{run_blocking, Service};
use crate::{AppError, NoteData, NoteSummary, NoteUpdate};

#[tauri::command]
pub(crate) async fn notes_create(state: Service<'_>) -> Result<NoteSummary, AppError> {
    let app = state.inner().clone();
    run_blocking(move || Ok(app.create_note()?.summary)).await
}

#[tauri::command]
pub(crate) async fn notes_list(
    state: Service<'_>,
    is_trashed: bool,
) -> Result<Vec<NoteSummary>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.list_notes(is_trashed)).await
}

#[tauri::command]
pub(crate) async fn notes_get(
    state: Service<'_>,
    id: String,
) -> Result<Option<NoteData>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.get_note(&id)).await
}

#[tauri::command]
pub(crate) async fn notes_update(
    state: Service<'_>,
    id: String,
    data: NoteUpdate,
) -> Result<NoteSummary, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.update_note(&id, data)).await
}

#[tauri::command]
pub(crate) async fn notes_trash(state: Service<'_>, id: String) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.trash_note(&id)).await
}

#[tauri::command]
pub(crate) async fn notes_restore(state: Service<'_>, id: String) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.restore_note(&id)).await
}

#[tauri::command]
pub(crate) async fn notes_delete_permanently(
    state: Service<'_>,
    id: String,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.delete_note_permanently(&id)).await
}

#[tauri::command]
pub(crate) async fn notes_toggle_pin(state: Service<'_>, id: String) -> Result<bool, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.toggle_note_pin(&id)).await
}
