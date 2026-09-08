use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn get_desktop_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_os_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Open a URL in the user's default browser.
///
/// This is deliberately a hand-written command rather than the opener
/// plugin's generic `open`. Anything reachable from the webview's JS is
/// also reachable from an XSS in it, and a general-purpose opener handed
/// to that surface would be enough to invoke `file://` or a Windows
/// protocol handler. The opener plugin is therefore not permissioned for
/// the main window at all (see `capabilities/default.json`); this command
/// keeps the blast radius to "can open a web page", which is all the UI
/// ever needs.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "invalid URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" => open::that_detached(parsed.as_str()).map_err(|e| e.to_string()),
        other => Err(format!("refused URL scheme: {other}")),
    }
}

#[tauri::command]
fn ping_ollama(endpoint: Option<String>) -> bool {
    let endpoint_str = endpoint.unwrap_or_else(|| "127.0.0.1:11434".to_string());
    let clean_addr = endpoint_str
        .replace("http://", "")
        .replace("https://", "");
    let host_port = clean_addr.split('/').next().unwrap_or("127.0.0.1:11434");
    let target = if host_port.contains(':') {
        host_port.to_string()
    } else {
        format!("{}:11434", host_port)
    };

    if let Ok(socket_addr) = target.parse() {
        std::net::TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_millis(500)).is_ok()
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Create System Tray Menu
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Open Playground", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            // Build Tray Icon safely with default window icon
            if let Some(icon) = app.default_window_icon() {
                let _ = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app);
            }

            // Ensure main window is visible and focused on launch
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();

                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { .. } = event {
                        // Terminate the process cleanly and free all system resources
                        app_handle.exit(0);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_version,
            get_os_platform,
            ping_ollama,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
