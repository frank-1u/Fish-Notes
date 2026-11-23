use tauri::ipc::{InvokeBody, Request};

use super::{run_blocking, Service};
use crate::AppError;

#[tauri::command]
pub(crate) async fn images_save_from_buffer(
    service: Service<'_>,
    request: Request<'_>,
) -> Result<String, AppError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::InvalidImageUpload);
    };
    let mime_type = request
        .headers()
        .get("x-mime-type")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::UnsupportedImageType)?
        .to_owned();
    let bytes = bytes.clone();
    let service = service.inner().clone();
    run_blocking(move || service.save_image(&bytes, &mime_type)).await
}
