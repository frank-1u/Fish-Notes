use std::{env, path::PathBuf};

use tauri::{webview::NewWindowResponse, Manager, Url, WebviewWindowBuilder};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

use crate::{commands, AppService};

pub fn run() {
    tauri::Builder::default()
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
            commands::notes_create,
            commands::notes_list,
            commands::notes_get,
            commands::notes_update,
            commands::notes_trash,
            commands::notes_restore,
            commands::notes_delete_permanently,
            commands::notes_toggle_pin,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Fish Notes");
}

fn open_external(app: &tauri::AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
            log::warn!("Could not open external link: {error}");
        }
    }
}
