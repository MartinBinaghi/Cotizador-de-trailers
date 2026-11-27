use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Recuerda entre reinicios la carpeta compartida autorizada en el diálogo.
    .plugin(tauri_plugin_persisted_scope::init())
    .setup(|app| {
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Un service worker de una versión vieja (antes de selfDestroying) puede seguir sirviendo
      // la copia guardada de esa versión, y WebView2 no siempre lo reemplaza. Se borra su carpeta
      // antes de abrir la ventana. Los datos (IndexedDB, localStorage) están en otras carpetas.
      #[cfg(windows)]
      if let Ok(dir) = app.path().app_local_data_dir() {
        borrar_carpeta(&dir.join("EBWebView").join("Default").join("Service Worker"));
      }
      // La ventana se crea acá (create: false en tauri.conf.json) para que exista recién después del borrado.
      tauri::WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?.build()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Borra archivo por archivo: `std::fs::remove_dir_all` fallaba con el error 32 de Windows
/// ("archivo en uso") en esta carpeta, y así se borra. Lo que no se pueda borrar se ignora.
#[cfg(windows)]
fn borrar_carpeta(carpeta: &std::path::Path) {
  for entrada in std::fs::read_dir(carpeta).into_iter().flatten().flatten() {
    let ruta = entrada.path();
    if ruta.is_dir() { borrar_carpeta(&ruta) } else { let _ = std::fs::remove_file(&ruta); }
  }
  let _ = std::fs::remove_dir(carpeta);
}
