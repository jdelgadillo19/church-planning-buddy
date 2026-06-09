use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const SERVICE: &str = "com.grapevineprep.rig";
const ACCOUNT: &str = "rig-credentials";
const PP_ACCOUNT: &str = "pp-settings";
const PP_NOT_CONFIGURED_MSG: &str = "ProPresenter port is required. In ProPresenter → Settings → Network, turn Enable Network ON, enter the TCP/IP Port ID in Grapevine Rig, then Save or Apply again.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigCredentials {
    pub rig_id: String,
    pub rig_secret: String,
    pub display_name: String,
    pub api_base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pp_host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pp_port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pp_transport: Option<String>,
}

fn creds_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

fn pp_settings_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, PP_ACCOUNT).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PpSettings {
    pub pp_host: String,
    pub pp_port: u16,
    pub pp_transport: String,
}

fn parse_pp_transport(raw: &str) -> Result<String, String> {
    match raw.trim().to_lowercase().as_str() {
        "tcp" | "http" | "auto" => Ok(raw.trim().to_lowercase()),
        other => Err(format!("Invalid PP transport: {other} (use tcp, http, or auto)")),
    }
}

fn rig_worker_export_env(app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let mut env = Vec::new();
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let staging = data_dir.join("pp-exports");
    fs::create_dir_all(&staging).map_err(|e| format!("Could not create export folder: {e}"))?;
    env.push((
        "PP_EXPORT_STAGING_DIR".to_string(),
        staging.to_string_lossy().into_owned(),
    ));

    if let Ok(script) =
        app.path()
            .resolve("export-playlist.applescript", tauri::path::BaseDirectory::Resource)
    {
        if script.exists() {
            env.push((
                "PP_EXPORT_APPLESCRIPT_PATH".to_string(),
                script.to_string_lossy().into_owned(),
            ));
        }
    }

    Ok(env)
}

fn pp_settings_env(settings: &PpSettings) -> Vec<(String, String)> {
    vec![
        ("PP_HOST".to_string(), settings.pp_host.clone()),
        ("PP_PORT".to_string(), settings.pp_port.to_string()),
        ("PP_TRANSPORT".to_string(), settings.pp_transport.clone()),
    ]
}

fn write_credentials(creds: &RigCredentials) -> Result<(), String> {
    let json = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    creds_entry()?.set_password(&json).map_err(|e| e.to_string())
}

fn pp_from_creds(creds: &RigCredentials) -> Option<PpSettings> {
    creds.pp_port.map(|port| PpSettings {
        pp_host: creds
            .pp_host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".to_string()),
        pp_port: port,
        pp_transport: creds
            .pp_transport
            .clone()
            .unwrap_or_else(|| "tcp".to_string()),
    })
}

fn normalize_pp_host(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "localhost" || trimmed.starts_with("127.0.0.") {
        return "127.0.0.1".to_string();
    }
    trimmed.to_string()
}

fn pp_settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("pp-settings.json"))
}

fn write_pp_settings_file(app: &tauri::AppHandle, settings: &PpSettings) -> Result<(), String> {
    let path = pp_settings_file(app)?;
    let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn read_pp_settings_file(app: &tauri::AppHandle) -> Result<Option<PpSettings>, String> {
    let path = pp_settings_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::from_str(&json).map_err(|e| e.to_string())?))
}

fn migrate_pp_settings_from_keychain(app: &tauri::AppHandle) -> Result<Option<PpSettings>, String> {
    if let Some(creds) = load_credentials()? {
        if let Some(pp) = pp_from_creds(&creds) {
            write_pp_settings_file(app, &pp)?;
            return Ok(Some(pp));
        }
    }

    match pp_settings_entry()?.get_password() {
        Ok(json) => {
            let settings: PpSettings = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            write_pp_settings_file(app, &settings)?;
            let _ = pp_settings_entry()?.delete_credential();
            Ok(Some(settings))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn load_pp_settings_for_app(app: &tauri::AppHandle) -> Result<Option<PpSettings>, String> {
    if let Some(settings) = read_pp_settings_file(app)? {
        return Ok(Some(settings));
    }
    migrate_pp_settings_from_keychain(app)
}

fn build_pp_settings(pp_host: String, pp_port: u16, pp_transport: String) -> Result<PpSettings, String> {
    if pp_port == 0 {
        return Err("ProPresenter port is required.".to_string());
    }
    Ok(PpSettings {
        pp_host: normalize_pp_host(&pp_host),
        pp_port,
        pp_transport: parse_pp_transport(&pp_transport)?,
    })
}

#[tauri::command]
fn save_pp_settings(
    app: tauri::AppHandle,
    pp_host: String,
    pp_port: u16,
    pp_transport: String,
) -> Result<(), String> {
    let settings = build_pp_settings(pp_host, pp_port, pp_transport)?;
    write_pp_settings_file(&app, &settings)
}

#[tauri::command]
fn load_pp_settings(app: tauri::AppHandle) -> Result<Option<PpSettings>, String> {
    load_pp_settings_for_app(&app)
}

#[tauri::command]
fn save_credentials(
    rig_id: String,
    rig_secret: String,
    display_name: String,
    api_base_url: String,
) -> Result<(), String> {
    let creds = RigCredentials {
        rig_id,
        rig_secret,
        display_name,
        api_base_url,
        pp_host: None,
        pp_port: None,
        pp_transport: None,
    };
    write_credentials(&creds)
}

#[tauri::command]
fn load_credentials() -> Result<Option<RigCredentials>, String> {
    match creds_entry()?.get_password() {
        Ok(json) => {
            let creds: RigCredentials = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(creds))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn clear_credentials() -> Result<(), String> {
    match creds_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_hostname() -> Result<String, String> {
    hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

fn resolve_worker_script(app: &tauri::AppHandle, node_script: &str) -> Result<PathBuf, String> {
    if let Ok(p) = app.path().resolve(node_script, tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let dev = cwd
            .join("../../grapevine-rig-worker/dist")
            .join(node_script);
        if dev.exists() {
            return Ok(dev);
        }
    }
    Err(format!("Worker script not found: {node_script}"))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn system_node_path() -> Option<&'static str> {
    for candidate in ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
        if Path::new(candidate).exists() {
            return Some(candidate);
        }
    }
    None
}

fn spawn_node_worker(
    app: &tauri::AppHandle,
    script: &Path,
    env: Vec<(String, String)>,
) -> Result<
    (
        tauri::async_runtime::Receiver<CommandEvent>,
        tauri_plugin_shell::process::CommandChild,
    ),
    String,
> {
    let script_arg = shell_quote(&script.to_string_lossy());
    let zsh_cmd = format!("exec node {script_arg}");

    // Prefer login shell so nvm/Homebrew paths from .zprofile are available (GUI apps have a minimal PATH).
    match app
        .shell()
        .command("/bin/zsh")
        .args(["-l", "-c", &zsh_cmd])
        .envs(env.clone())
        .spawn()
    {
        Ok(pair) => return Ok(pair),
        Err(zsh_err) => {
            if let Some(node) = system_node_path() {
                return app
                    .shell()
                    .command(node)
                    .arg(script)
                    .envs(env)
                    .spawn()
                    .map_err(|e| format!("Failed to start node worker ({node}): {e}"));
            }
            Err(format!(
                "Failed to start worker via login shell. Install Node.js (nvm or Homebrew) and try again. ({zsh_err})"
            ))
        }
    }
}

fn format_worker_success(stdout: &str) -> String {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return "Done.".to_string();
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(message) = value.get("message").and_then(|m| m.as_str()) {
            return message.to_string();
        }
        if let Some(snapshot) = value.get("snapshot") {
            let at = snapshot
                .get("snapshotAt")
                .and_then(|v| v.as_str())
                .unwrap_or("just now");
            return format!("Index uploaded ({at}).");
        }
        if value.get("result").is_some() {
            return "Apply completed.".to_string();
        }
    }

    for line in trimmed.lines().rev() {
        let line = line.trim();
        if line.is_empty() || line == "}" || line == "{" || line == "]" || line == "[" {
            continue;
        }
        return line.to_string();
    }

    "Done.".to_string()
}

async fn run_node_worker(
    app: &tauri::AppHandle,
    node_script: &str,
    extra_env: Vec<(String, String)>,
    inline_pp: Option<PpSettings>,
) -> Result<String, String> {
    let creds = load_credentials()?.ok_or("Not paired.")?;

    let mut env: Vec<(String, String)> = vec![
        ("RIG_ID".to_string(), creds.rig_id),
        ("RIG_SECRET".to_string(), creds.rig_secret),
        ("GRAPEVINE_PREP_URL".to_string(), creds.api_base_url),
        ("PP_ALLOW_WRITES".to_string(), "true".to_string()),
    ];
    let pp = if let Some(settings) = inline_pp {
        write_pp_settings_file(&app, &settings)?;
        settings
    } else {
        load_pp_settings_for_app(&app)?.ok_or(PP_NOT_CONFIGURED_MSG.to_string())?
    };
    env.extend(pp_settings_env(&pp));
    env.extend(rig_worker_export_env(app)?);
    env.extend(extra_env);

    let script = resolve_worker_script(app, node_script)?;
    let (mut rx, _child) = spawn_node_worker(app, &script, env)?;

    let mut stdout = String::new();
    let mut stderr = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => stdout.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Stderr(line) => stderr.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(1) != 0 {
                    let mut msg = stderr.trim().to_string();
                    if msg.is_empty() {
                        msg = stdout.trim().to_string();
                    } else if !stdout.trim().is_empty() {
                        msg = format!("{msg}\n{}", stdout.trim());
                    }
                    return Err(if msg.is_empty() {
                        format!("Worker exited with code {:?}", payload.code)
                    } else {
                        msg
                    });
                }
                break;
            }
            CommandEvent::Error(err) => return Err(err),
            _ => {}
        }
    }

    Ok(format_worker_success(&stdout))
}

#[tauri::command]
async fn run_apply(
    app: tauri::AppHandle,
    build_id: String,
    pp_settings: Option<PpSettings>,
) -> Result<String, String> {
    let env = vec![("BUILD_ID".to_string(), build_id)];
    run_node_worker(&app, "worker.mjs", env, pp_settings).await
}

#[tauri::command]
async fn run_scan(app: tauri::AppHandle, pp_settings: Option<PpSettings>) -> Result<String, String> {
    run_node_worker(&app, "scan.mjs", vec![], pp_settings).await
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_credentials,
            load_credentials,
            clear_credentials,
            save_pp_settings,
            load_pp_settings,
            get_hostname,
            app_version,
            run_apply,
            run_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Grapevine Rig");
}
