mod commands;

use tauri::{Emitter, Manager};
use tauri::webview::Color;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("./migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "blocker profiles",
            sql: include_str!("./migrations/002_blocker_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "subtasks",
            sql: include_str!("./migrations/003_subtasks.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:skadiflow.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::locker::check_locker_permission,
            commands::locker::activate_locker,
            commands::locker::deactivate_locker,
        ])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            let quick_add = MenuItem::with_id(app, "quick_add", "Quick Add Task", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit SkadiFlow", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[
                &show_hide,
                &quick_add,
                &PredefinedMenuItem::separator(app)?,
                &quit,
            ])?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SkadiFlow")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let window = app.get_webview_window("main").unwrap();
                    match event.id().as_ref() {
                        "show_hide" => {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quick_add" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("quick-add", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Set transparent background on the floating-timer webview (required for Windows WebView2)
            if let Some(webview) = app.get_webview_window("floating-timer") {
                let _ = webview.set_background_color(Some(Color(0, 0, 0, 0)));
            }
            // Set transparent background on the task-toast notification window
            if let Some(webview) = app.get_webview_window("task-toast") {
                let _ = webview.set_background_color(Some(Color(0, 0, 0, 0)));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
