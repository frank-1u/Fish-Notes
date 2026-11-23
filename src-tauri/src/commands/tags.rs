use super::{run_blocking, Service};
use crate::{AppError, NoteSummary, TagData};

#[tauri::command]
pub(crate) async fn tags_get_all(state: Service<'_>) -> Result<Vec<TagData>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.list_tags()).await
}

#[tauri::command]
pub(crate) async fn tags_get_by_note_id(
    state: Service<'_>,
    note_id: String,
) -> Result<Vec<TagData>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.get_tags_by_note_id(&note_id)).await
}

#[tauri::command]
pub(crate) async fn tags_get_notes_by_tag(
    state: Service<'_>,
    tag_id: String,
) -> Result<Vec<NoteSummary>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.get_notes_by_tag(&tag_id)).await
}

#[tauri::command]
pub(crate) async fn tags_set_note_tags(
    state: Service<'_>,
    note_id: String,
    tag_names: Vec<String>,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.set_note_tags(&note_id, &tag_names)).await
}

#[tauri::command]
pub(crate) async fn tags_add_note_tag(
    state: Service<'_>,
    note_id: String,
    tag_name: String,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.add_note_tag(&note_id, &tag_name)).await
}

#[tauri::command]
pub(crate) async fn tags_remove_note_tag(
    state: Service<'_>,
    note_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.remove_note_tag(&note_id, &tag_id)).await
}

#[tauri::command]
pub(crate) async fn tags_cleanup_unused(state: Service<'_>) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.cleanup_unused_tags()).await
}

#[tauri::command]
pub(crate) async fn tags_delete(
    state: Service<'_>,
    tag_id: String,
) -> Result<Vec<String>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.delete_tag(&tag_id)).await
}

#[tauri::command]
pub(crate) async fn tags_rename(
    state: Service<'_>,
    tag_id: String,
    new_name: String,
) -> Result<Option<String>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.rename_tag(&tag_id, &new_name)).await
}

#[tauri::command]
pub(crate) async fn tags_toggle_pin(state: Service<'_>, tag_id: String) -> Result<bool, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.toggle_tag_pin(&tag_id)).await
}

#[tauri::command]
pub(crate) async fn tags_reorder(
    state: Service<'_>,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.reorder_tags(&ordered_ids)).await
}
