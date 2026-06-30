use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri::RunEvent;

const SERVICE: &str = "com.grapevineprep.rig";
const ACCOUNT: &str = "rig-credentials";
const PP_ACCOUNT: &str = "pp-settings";
const PP_NOT_CONFIGURED_MSG: &str = "ProPresenter port is required. In ProPresenter → Settings → Network, turn Enable Network ON, enter the TCP/IP Port ID in Grapevine Client, then Save or Apply again.";
const API_BASE_DEFAULT: &str = "https://grapevineprep.com";

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pp_bundle_root: Option<String>,
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

fn publish_skip_reason(detail: &str) -> String {
    if detail.contains("assistive access") || detail.contains("-2700") {
        "Drive publish was skipped; playlist is ready in ProPresenter.".to_string()
    } else {
        format!("Drive publish was skipped: {detail}")
    }
}

fn native_export_file_name(playlist_name: &str) -> String {
    let forbidden = ['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>'];
    let base: String = playlist_name
        .chars()
        .map(|c| if forbidden.contains(&c) { '-' } else { c })
        .collect();
    let base = base.trim();
    if base.is_empty() {
        "playlist.proplaylist".to_string()
    } else {
        format!("{base}.proplaylist")
    }
}

async fn export_playlist_via_osascript(
    app: &tauri::AppHandle,
    playlist_name: &str,
    output_path: &Path,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = (app, playlist_name, output_path);
        return Err(
            "ProPresenter export via AppleScript is not available on Windows.".to_string(),
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
    let script = app
        .path()
        .resolve("export-playlist.applescript", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    if !script.exists() {
        return Err(
            "ProPresenter export script missing from app bundle. Reinstall Grapevine Client."
                .to_string(),
        );
    }

    let playlist = playlist_name.to_string();
    let output = output_path.to_string_lossy().to_string();
    let script_arg = script.to_string_lossy().to_string();

    let (mut rx, _child) = app
        .shell()
        .command("/usr/bin/osascript")
        .args([script_arg.as_str(), playlist.as_str(), output.as_str()])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stderr = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => stderr.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(1) != 0 {
                    let detail = if stderr.trim().is_empty() {
                        format!("exit {:?}", payload.code)
                    } else {
                        stderr.trim().to_string()
                    };
                    return Err(detail);
                }
                break;
            }
            CommandEvent::Error(err) => return Err(err),
            _ => {}
        }
    }

    if !output_path.exists() {
        return Err("export finished but .proplaylist file was not created".to_string());
    }
    Ok(())
    }
}

fn pp_settings_env(settings: &PpSettings) -> Vec<(String, String)> {
    let mut env = vec![
        ("PP_HOST".to_string(), settings.pp_host.clone()),
        ("PP_PORT".to_string(), settings.pp_port.to_string()),
        ("PP_TRANSPORT".to_string(), settings.pp_transport.clone()),
    ];
    if let Some(root) = settings.pp_bundle_root.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        env.push(("PP_BUNDLE_ROOT".to_string(), root.to_string()));
    }
    env
}

fn default_bundle_root() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(documents) = std::env::var("USERPROFILE") {
            return format!("{documents}\\Documents\\ProPresenter");
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return format!(
                "{home}/Library/Application Support/RenewedVision/ProPresenter"
            );
        }
    }
    String::new()
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
        pp_bundle_root: None,
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

fn build_pp_settings(
    pp_host: String,
    pp_port: u16,
    pp_transport: String,
    pp_bundle_root: Option<String>,
) -> Result<PpSettings, String> {
    if pp_port == 0 {
        return Err("ProPresenter port is required.".to_string());
    }
    let bundle = pp_bundle_root
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let d = default_bundle_root();
            if d.is_empty() { None } else { Some(d) }
        });
    Ok(PpSettings {
        pp_host: normalize_pp_host(&pp_host),
        pp_port,
        pp_transport: parse_pp_transport(&pp_transport)?,
        pp_bundle_root: bundle,
    })
}

#[tauri::command]
fn save_pp_settings(
    app: tauri::AppHandle,
    pp_host: String,
    pp_port: u16,
    pp_transport: String,
    pp_bundle_root: Option<String>,
) -> Result<(), String> {
    let settings = build_pp_settings(pp_host, pp_port, pp_transport, pp_bundle_root)?;
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

#[cfg(target_os = "windows")]
fn windows_path_for_node_argv(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    let stripped = if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        s.into_owned()
    };
    PathBuf::from(stripped)
}

#[cfg(target_os = "windows")]
fn is_usable_node_exe(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => ext.eq_ignore_ascii_case("exe"),
        None => false,
    }
}

#[cfg(target_os = "windows")]
fn windows_standard_node_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        out.push(PathBuf::from(pf).join("nodejs").join("node.exe"));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        out.push(PathBuf::from(pf86).join("nodejs").join("node.exe"));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        out.push(
            PathBuf::from(local)
                .join("Programs")
                .join("node")
                .join("node.exe"),
        );
    }
    out
}

#[cfg(target_os = "windows")]
fn windows_node_executable() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("GRAPEVINE_NODE_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if is_usable_node_exe(&p) {
                return Ok(p);
            }
            return Err(format!(
                "GRAPEVINE_NODE_PATH must point to node.exe (not a .cmd shim): {trimmed}"
            ));
        }
    }

    for p in windows_standard_node_paths() {
        if is_usable_node_exe(&p) {
            return Ok(p);
        }
    }

    if let Ok(output) = std::process::Command::new("where")
        .arg("node.exe")
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().map(str::trim).filter(|l| !l.is_empty()) {
                let p = PathBuf::from(line);
                if is_usable_node_exe(&p) {
                    return Ok(p);
                }
            }
        }
    }

    Err(
        "Node.js not found. Install Node.js 20+ (node.exe in Program Files\\nodejs) and restart Grapevine Client. \
         Do not rely on npm's node.cmd shim — set GRAPEVINE_NODE_PATH to your node.exe if needed."
            .to_string(),
    )
}

#[cfg(target_os = "windows")]
async fn run_windows_node_worker(script: &Path, env: Vec<(String, String)>) -> Result<String, String> {
    let node = windows_path_for_node_argv(&windows_node_executable()?);
    let script = windows_path_for_node_argv(script);
    let node_log = node.to_string_lossy().into_owned();
    let script_log = script.to_string_lossy().into_owned();
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&node);
        cmd.arg(&script);
        for (key, value) in &env {
            cmd.env(key, value);
        }
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.output()
            .map_err(|e| format!("Failed to start node worker on Windows: {e}"))
    })
    .await
    .map_err(|e| format!("Worker task failed: {e}"))?;

    let result = output.map_err(|e| {
        format!("Node worker failed (node={node_log}, script={script_log}): {e}")
    })?;
    let code = result.status.code().unwrap_or(1);
    let stdout = String::from_utf8_lossy(&result.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&result.stderr).into_owned();
    if code != 0 {
        let mut msg = stderr.trim().to_string();
        if msg.is_empty() {
            msg = stdout.trim().to_string();
        } else if !stdout.trim().is_empty() {
            msg = format!("{msg}\n{}", stdout.trim());
        }
        return Err(if msg.is_empty() {
            format!("Worker exited with code {code} (node={node_log}, script={script_log})")
        } else {
            format!("{msg}\n(node={node_log}, script={script_log})")
        });
    }
    Ok(stdout.trim().to_string())
}

#[cfg(not(target_os = "windows"))]
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

fn parse_worker_stdout(stdout: &str) -> Result<String, String> {
    let trimmed = stdout.trim();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if value.get("conflict").and_then(|v| v.as_bool()) == Some(true) {
            let payload = serde_json::to_string(&value).map_err(|e| e.to_string())?;
            return Err(format!("CONFLICT:{payload}"));
        }
        if value.get("ok").and_then(|v| v.as_bool()) == Some(false) {
            let message = value
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Worker failed.");
            return Err(message.to_string());
        }
    }
    Ok(format_worker_success(stdout))
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

async fn run_remote_prep_worker(
    app: &tauri::AppHandle,
    job_id: String,
    client_token: String,
    inline_pp: Option<PpSettings>,
) -> Result<String, String> {
    let pp = if let Some(settings) = inline_pp {
        write_pp_settings_file(app, &settings)?;
        settings
    } else {
        load_pp_settings_for_app(app)?.ok_or(PP_NOT_CONFIGURED_MSG.to_string())?
    };

    let mut env: Vec<(String, String)> = vec![
        ("REMOTE_PREP_JOB_ID".to_string(), job_id),
        ("REMOTE_PREP_CLIENT_TOKEN".to_string(), client_token),
        ("GRAPEVINE_PREP_URL".to_string(), API_BASE_DEFAULT.to_string()),
        ("PP_ALLOW_WRITES".to_string(), "true".to_string()),
    ];
    env.extend(pp_settings_env(&pp));
    if let Ok(script) = app.path().resolve(
        "open-propresenter.applescript",
        tauri::path::BaseDirectory::Resource,
    ) {
        if script.exists() {
            env.push((
                "PP_OPEN_APPLESCRIPT_PATH".to_string(),
                script.to_string_lossy().into_owned(),
            ));
        }
    }

    let stdout = run_node_worker_stdout_with_env(app, "remote-prep.mjs", env).await?;
    Ok(parse_worker_stdout(&stdout)?)
}

fn parse_remote_prep_deeplink(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim();
    if !trimmed.starts_with("grapevine://") {
        return None;
    }
    let rest = trimmed.trim_start_matches("grapevine://");
    let host = rest.split(['?', '/']).next()?.trim();
    if host != "remote-prep" {
        return None;
    }
    let query = rest.find('?').map(|i| &rest[i + 1..]).unwrap_or("");
    let mut job_id = None;
    let mut token = None;
    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        let key = kv.next()?.trim();
        let value = kv.next()?.trim();
        if key == "jobId" {
            job_id = Some(value.to_string());
        } else if key == "token" {
            token = Some(value.to_string());
        }
    }
    Some((job_id?, token?))
}

async fn run_node_worker_stdout_with_env(
    app: &tauri::AppHandle,
    node_script: &str,
    env: Vec<(String, String)>,
) -> Result<String, String> {
    let script = resolve_worker_script(app, node_script)?;

    #[cfg(target_os = "windows")]
    {
        return run_windows_node_worker(&script, env).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
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

        Ok(stdout.trim().to_string())
    }
}

async fn run_node_worker_stdout(
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

    run_node_worker_stdout_with_env(app, node_script, env).await
}

async fn run_node_worker(
    app: &tauri::AppHandle,
    node_script: &str,
    extra_env: Vec<(String, String)>,
    inline_pp: Option<PpSettings>,
) -> Result<String, String> {
    Ok(parse_worker_stdout(
        &run_node_worker_stdout(app, node_script, extra_env, inline_pp).await?,
    )?)
}

#[tauri::command]
async fn run_remote_prep(
    app: tauri::AppHandle,
    job_id: String,
    client_token: String,
    pp_settings: Option<PpSettings>,
) -> Result<String, String> {
    run_remote_prep_worker(&app, job_id, client_token, pp_settings).await
}

#[tauri::command]
async fn run_apply(
    app: tauri::AppHandle,
    build_id: String,
    pp_settings: Option<PpSettings>,
) -> Result<String, String> {
    let apply_stdout = run_node_worker_stdout(
        &app,
        "worker.mjs",
        vec![
            ("BUILD_ID".to_string(), build_id.clone()),
            ("APPLY_ONLY".to_string(), "true".to_string()),
        ],
        pp_settings.clone(),
    )
    .await?;

    let apply_json: serde_json::Value = serde_json::from_str(apply_stdout.trim())
        .map_err(|e| format!("Invalid apply worker output: {e}"))?;

    let publish_after = apply_json
        .get("publishAfterApply")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !publish_after {
        return Ok(format_worker_success(&apply_stdout));
    }

    let playlist_name = apply_json
        .get("playlistName")
        .and_then(|v| v.as_str())
        .ok_or("Apply worker did not return playlistName.")?;

    let apply_result = apply_json
        .get("applyResult")
        .ok_or("Apply worker did not return applyResult.")?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let staging = data_dir.join("pp-exports");
    fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    let output_path = staging.join(native_export_file_name(playlist_name));

    if let Err(export_err) =
        export_playlist_via_osascript(&app, playlist_name, &output_path).await
    {
        let apply_result_json =
            serde_json::to_string(apply_result).map_err(|e| e.to_string())?;
        let skip_reason = publish_skip_reason(&export_err);
        let skipped_stdout = run_node_worker_stdout(
            &app,
            "worker.mjs",
            vec![
                ("BUILD_ID".to_string(), build_id.clone()),
                ("COMPLETE_APPLY_PUBLISH_SKIPPED".to_string(), "true".to_string()),
                ("APPLY_RESULT_JSON".to_string(), apply_result_json),
                ("PUBLISH_SKIP_REASON".to_string(), skip_reason),
            ],
            pp_settings.clone(),
        )
        .await?;
        return Ok(format_worker_success(&skipped_stdout));
    }

    let apply_result_json =
        serde_json::to_string(apply_result).map_err(|e| e.to_string())?;

    run_node_worker(
        &app,
        "worker.mjs",
        vec![
            ("BUILD_ID".to_string(), build_id),
            ("PUBLISH_ONLY".to_string(), "true".to_string()),
            (
                "PP_NATIVE_EXPORT_PATH".to_string(),
                output_path.to_string_lossy().into_owned(),
            ),
            ("APPLY_RESULT_JSON".to_string(), apply_result_json),
        ],
        pp_settings,
    )
    .await
}

#[tauri::command]
async fn run_scan(app: tauri::AppHandle, pp_settings: Option<PpSettings>) -> Result<String, String> {
    run_node_worker(&app, "scan.mjs", vec![], pp_settings).await
}

#[tauri::command]
async fn run_handoff(
    app: tauri::AppHandle,
    handoff_id: String,
    pp_settings: Option<PpSettings>,
) -> Result<String, String> {
    run_node_worker(
        &app,
        "handoff.mjs",
        vec![("HANDOFF_ID".to_string(), handoff_id)],
        pp_settings,
    )
    .await
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
            run_handoff,
            run_remote_prep,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Grapevine Client")
        .run(|app, event| {
            if let RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Some((job_id, token)) = parse_remote_prep_deeplink(url.as_str()) {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let message = match run_remote_prep_worker(&handle, job_id, token, None).await {
                                Ok(msg) => msg,
                                Err(err) => err,
                            };
                            let _ = handle.emit("remote-prep-status", message);
                        });
                    }
                }
            }
        });
}
