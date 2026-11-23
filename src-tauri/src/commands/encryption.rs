use zeroize::Zeroizing;

use super::{run_blocking, Service};
use crate::AppError;

#[tauri::command]
pub(crate) async fn encryption_has_password(state: Service<'_>) -> Result<bool, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.has_password()).await
}

#[tauri::command]
pub(crate) async fn encryption_is_unlocked(state: Service<'_>) -> Result<bool, AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.is_unlocked()).await
}

#[tauri::command]
pub(crate) async fn encryption_set_password(
    state: Service<'_>,
    password: String,
) -> Result<(), AppError> {
    let app = state.inner().clone();
    let password = Zeroizing::new(password);
    run_blocking(move || app.set_password(&password)).await
}

#[tauri::command]
pub(crate) async fn encryption_verify_password(
    state: Service<'_>,
    password: String,
) -> Result<bool, AppError> {
    let app = state.inner().clone();
    let password = Zeroizing::new(password);
    run_blocking(move || app.verify_password(&password)).await
}

#[tauri::command]
pub(crate) async fn encryption_change_password(
    state: Service<'_>,
    old_password: String,
    new_password: String,
) -> Result<bool, AppError> {
    let app = state.inner().clone();
    let old_password = Zeroizing::new(old_password);
    let new_password = Zeroizing::new(new_password);
    run_blocking(move || app.change_password(&old_password, &new_password)).await
}

#[tauri::command]
pub(crate) async fn encryption_remove_password(
    state: Service<'_>,
    password: String,
) -> Result<bool, AppError> {
    let app = state.inner().clone();
    let password = Zeroizing::new(password);
    run_blocking(move || app.remove_password(&password)).await
}

#[tauri::command]
pub(crate) async fn encryption_lock_all(state: Service<'_>) -> Result<(), AppError> {
    let app = state.inner().clone();
    run_blocking(move || app.lock_all()).await
}
