use std::{env, io::ErrorKind, path::PathBuf};

use tauri::{
    http::{header, Response, StatusCode},
    webview::NewWindowResponse,
    Manager, Url, WebviewWindowBuilder,
};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

use crate::{commands, AppError, AppService};

pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("fish-image", |context, request| {
            let service = context.app_handle().state::<AppService>();
            serve_image(&service, request.uri().path())
        })
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([Target::new(TargetKind::LogDir { file_name: None })])
                .max_file_size(5_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .build(),
        )
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = match env::var_os("FISH_NOTES_USER_DATA") {
                Some(path) if !path.is_empty() => PathBuf::from(path),
                _ => app.path().app_data_dir()?,
            };
            let service =
                AppService::open(&data_dir).inspect_err(|error| log::error!("{error}"))?;
            app.manage(service);

            let window = &app.config().app.windows[0];
            let dev_url = app
                .config()
                .build
                .dev_url
                .clone()
                .filter(|_| tauri::is_dev());
            let app_url = if cfg!(target_os = "windows") {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            };
            let local_url = dev_url.unwrap_or(Url::parse(app_url)?);
            let navigation_handle = app.handle().clone();
            let new_window_handle = app.handle().clone();

            WebviewWindowBuilder::from_config(app, window)?
                .on_navigation(move |url| {
                    if url.scheme() == local_url.scheme()
                        && url.host_str() == local_url.host_str()
                        && url.port_or_known_default() == local_url.port_or_known_default()
                    {
                        return true;
                    }
                    open_external(&navigation_handle, url);
                    false
                })
                .on_new_window(move |url, _| {
                    open_external(&new_window_handle, &url);
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::images_save_from_buffer,
            commands::notes_create,
            commands::notes_list,
            commands::notes_get,
            commands::notes_update,
            commands::notes_trash,
            commands::notes_restore,
            commands::notes_delete_permanently,
            commands::notes_toggle_pin,
            commands::ai_get_config,
            commands::ai_set_config,
            commands::ai_test_connection,
            commands::ai_suggest_title,
            commands::ai_polish_text,
            commands::ai_chat_stream,
            commands::ai_abort_chat,
            commands::chats_list,
            commands::chats_create,
            commands::chats_get_messages,
            commands::chats_add_message,
            commands::chats_delete,
            commands::notes_lock,
            commands::notes_unlock,
            commands::notes_get_decrypted,
            commands::encryption_has_password,
            commands::encryption_is_unlocked,
            commands::encryption_set_password,
            commands::encryption_verify_password,
            commands::encryption_change_password,
            commands::encryption_remove_password,
            commands::encryption_lock_all,
            commands::tags_get_all,
            commands::tags_get_by_note_id,
            commands::tags_get_notes_by_tag,
            commands::tags_set_note_tags,
            commands::tags_add_note_tag,
            commands::tags_remove_note_tag,
            commands::tags_cleanup_unused,
            commands::tags_delete,
            commands::tags_rename,
            commands::tags_toggle_pin,
            commands::tags_reorder,
            commands::search_notes,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Fish Notes");
}

fn serve_image(service: &AppService, path: &str) -> Response<Vec<u8>> {
    let response = Response::builder()
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(
            header::CONTENT_SECURITY_POLICY,
            "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        );
    let status = match service.read_image(path) {
        Ok((mime_type, bytes)) => {
            return response
                .header(header::CONTENT_TYPE, mime_type)
                .body(bytes)
                .expect("valid image response");
        }
        Err(AppError::InvalidImagePath) => StatusCode::NOT_FOUND,
        Err(AppError::ImageStorage(error)) if error.kind() == ErrorKind::NotFound => {
            StatusCode::NOT_FOUND
        }
        Err(error) => {
            log::warn!("{error}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    };
    response
        .status(status)
        .body(Vec::new())
        .expect("valid image error response")
}

fn open_external(app: &tauri::AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
            log::warn!("Could not open external link: {error}");
        }
    }
}
