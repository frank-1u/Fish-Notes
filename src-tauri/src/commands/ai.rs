use tauri::ipc::Channel;

use super::{run_blocking, Service};
use crate::{AiConfig, AppError, ChatRequest, ChatStreamEvent, PublicAiConfig};

#[tauri::command]
pub(crate) async fn ai_get_config(state: Service<'_>) -> Result<Option<PublicAiConfig>, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.get_ai_config()).await
}

#[tauri::command]
pub(crate) async fn ai_set_config(state: Service<'_>, config: AiConfig) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.set_ai_config(config)).await
}

#[tauri::command]
pub(crate) async fn ai_test_connection(
    state: Service<'_>,
    config: Option<AiConfig>,
) -> Result<String, AppError> {
    state.test_ai_connection(config).await
}

#[tauri::command]
pub(crate) async fn ai_suggest_title(
    state: Service<'_>,
    content: String,
) -> Result<String, AppError> {
    state.suggest_title(content).await
}

#[tauri::command]
pub(crate) async fn ai_polish_text(state: Service<'_>, text: String) -> Result<String, AppError> {
    state.polish_text(text).await
}

#[tauri::command]
pub(crate) async fn ai_chat_stream(
    state: Service<'_>,
    request: ChatRequest,
    channel: Channel<ChatStreamEvent>,
) -> Result<(), AppError> {
    state
        .stream_chat(request, |event| {
            channel.send(event).map_err(|_| AppError::AiChannel)
        })
        .await
}

#[tauri::command]
pub(crate) fn ai_abort_chat(state: Service<'_>, request_id: String) {
    state.abort_chat(&request_id);
}
