use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::WebviewWindow;
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::{run_blocking, Service};
use crate::{import_export::IMPORT_EXTENSIONS, AppError, AppService, ImportFailure, ImportResult};

#[tauri::command]
pub(crate) async fn import_files(
    window: WebviewWindow,
    service: Service<'_>,
) -> Result<ImportResult, AppError> {
    let service = service.inner().clone();
    run_blocking(move || {
        let Some(selections) = window
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("Markdown, text, HTML", IMPORT_EXTENSIONS)
            .blocking_pick_files()
        else {
            return Ok(ImportResult::default());
        };

        let mut paths = Vec::new();
        let mut invalid = Vec::new();
        for selection in selections {
            let name = match &selection {
                FilePath::Path(path) => path.file_name().map(|name| name.to_string_lossy()),
                FilePath::Url(url) => url
                    .path_segments()
                    .and_then(|mut segments| segments.next_back())
                    .map(Into::into),
            }
            .unwrap_or_default()
            .into_owned();

            match selection.into_path() {
                Ok(path) => paths.push(path),
                Err(_) => invalid.push(ImportFailure {
                    name,
                    error: AppError::NonLocalFile.to_string(),
                }),
            }
        }
        let mut result = service.import_files(paths);
        result.failed.extend(invalid);
        Ok(result)
    })
    .await
}

#[tauri::command]
pub(crate) async fn export_markdown(
    window: WebviewWindow,
    title: String,
    content: String,
) -> Result<bool, AppError> {
    save_export(window, title, content, "Markdown", "md").await
}

#[tauri::command]
pub(crate) async fn export_html(
    window: WebviewWindow,
    title: String,
    html: String,
) -> Result<bool, AppError> {
    save_export(window, title, html, "HTML", "html").await
}

#[tauri::command]
pub(crate) async fn export_image_data_url(
    service: Service<'_>,
    name: String,
) -> Result<String, AppError> {
    let service = service.inner().clone();
    run_blocking(move || {
        // The same scoped image lookup is used by the preview protocol.
        let (mime, bytes) = service.read_image(&format!("/{name}"))?;
        Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    })
    .await
}

async fn save_export(
    window: WebviewWindow,
    title: String,
    content: String,
    file_type: &str,
    extension: &'static str,
) -> Result<bool, AppError> {
    let name = title.replace(
        |ch: char| ch.is_control() || r#"<>:"/\|?*"#.contains(ch),
        "_",
    );
    let name = name.trim_matches([' ', '.']);
    let name = if name.is_empty() { "Untitled" } else { name };
    let dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter(file_type, &[extension])
        .set_file_name(format!("{name}.{extension}"));

    run_blocking(move || {
        let destination = dialog
            .blocking_save_file()
            .map(FilePath::into_path)
            .transpose()
            .map_err(|_| AppError::NonLocalFile)?;
        AppService::save_export(destination.as_deref(), &content)
    })
    .await
}
