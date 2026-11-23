use super::{run_blocking, Service};
use crate::{AppError, ChatData, ChatMessageData, ChatRole};

#[tauri::command]
pub(crate) async fn chats_list(state: Service<'_>) -> Result<Vec<ChatData>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.list_chats()).await
}

#[tauri::command]
pub(crate) async fn chats_create(
    state: Service<'_>,
    title: Option<String>,
) -> Result<ChatData, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.create_chat(title.as_deref())).await
}

#[tauri::command]
pub(crate) async fn chats_get_messages(
    state: Service<'_>,
    chat_id: String,
) -> Result<Vec<ChatMessageData>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.get_chat_messages(&chat_id)).await
}

#[tauri::command]
pub(crate) async fn chats_add_message(
    state: Service<'_>,
    chat_id: String,
    role: ChatRole,
    content: String,
    note_id: Option<String>,
) -> Result<ChatMessageData, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.add_chat_message(&chat_id, role, &content, note_id.as_deref())).await
}

#[tauri::command]
pub(crate) async fn chats_delete(state: Service<'_>, id: String) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.delete_chat(&id)).await
}
