//! Local HTTP proxy that blocks websites during focus sessions.
//!
//! Architecture:
//!   1. A tiny async TCP proxy runs on 127.0.0.1:<random_port>
//!   2. When blocking is activated, Windows system proxy (HKCU — no admin!) is
//!      pointed at our proxy.
//!   3. Browsers send CONNECT requests (HTTPS) — we inspect the hostname and
//!      either tunnel the connection or return 403.
//!   4. Plain HTTP requests are handled similarly via the Host header.
//!   5. On deactivation, the original proxy settings are restored.
//!
//! This approach does NOT require administrator privileges.

use std::collections::HashSet;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tokio::io::{copy_bidirectional, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Shared state ─────────────────────────────────────────────────────

static BLOCKED_DOMAINS: OnceLock<Arc<RwLock<HashSet<String>>>> = OnceLock::new();
static PROXY_PORT: AtomicU16 = AtomicU16::new(0);

#[cfg(target_os = "windows")]
static SAVED_PROXY: OnceLock<Mutex<SavedProxy>> = OnceLock::new();

fn blocked_set() -> &'static Arc<RwLock<HashSet<String>>> {
    BLOCKED_DOMAINS.get_or_init(|| Arc::new(RwLock::new(HashSet::new())))
}

pub fn get_proxy_port() -> u16 {
    PROXY_PORT.load(Ordering::Relaxed)
}

// ── Saved proxy state for cleanup ────────────────────────────────────

#[cfg(target_os = "windows")]
#[derive(Default)]
struct SavedProxy {
    original_enable: Option<u32>,
    original_server: Option<String>,
    is_active: bool,
}

// ── Proxy server ─────────────────────────────────────────────────────

/// Start the proxy server. Call once from `lib.rs` setup.
/// Returns the port the proxy is listening on.
pub async fn start_server() -> Result<u16, String> {
    // Bind to port 0 = OS picks a free port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("proxy bind failed: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("proxy addr: {}", e))?
        .port();

    PROXY_PORT.store(port, Ordering::Relaxed);

    // Spawn the accept loop on the tokio runtime
    let domains = blocked_set().clone();
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let domains = domains.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, &domains).await {
                            // Connection errors are expected (client disconnects, etc.)
                            let _ = e;
                        }
                    });
                }
                Err(_) => {
                    // Accept error — brief pause before retrying
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
            }
        }
    });

    Ok(port)
}

/// Handle a single client connection.
async fn handle_connection(
    mut client: TcpStream,
    domains: &Arc<RwLock<HashSet<String>>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Read the initial HTTP request (headers fit in 8 KiB)
    let mut buf = vec![0u8; 8192];
    let n = client.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = match request.lines().next() {
        Some(line) => line.to_string(),
        None => return Ok(()),
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0].to_uppercase();

    if method == "CONNECT" {
        // ── HTTPS: CONNECT host:port HTTP/1.1 ────────────────
        let target = parts[1];
        let (host, port) = parse_host_port(target, 443);

        if is_blocked_by(&host, domains) {
            let resp = format!(
                "HTTP/1.1 403 Blocked\r\n\
                 Content-Type: text/html; charset=utf-8\r\n\
                 Connection: close\r\n\r\n\
                 <html><body style=\"background:#1a1a1a;color:#fff;font-family:Inter,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
                 <div style=\"text-align:center\"><h1 style=\"color:#f97316\">Blocked</h1>\
                 <p>{} is blocked during your focus session.</p>\
                 <p style=\"color:#666;font-size:13px\">SkadiFlow Focus Locker</p></div></body></html>",
                host
            );
            client.write_all(resp.as_bytes()).await?;
            return Ok(());
        }

        // Tunnel to the real server
        let mut remote = TcpStream::connect(format!("{}:{}", host, port)).await?;
        client
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await?;
        let _ = copy_bidirectional(&mut client, &mut remote).await;
    } else {
        // ── Plain HTTP: GET http://host/path HTTP/1.1 ────────
        let host = extract_http_host(&request, parts[1]);

        if is_blocked_by(&host, domains) {
            let body = format!(
                "<html><body style=\"background:#1a1a1a;color:#fff;font-family:Inter,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
                 <div style=\"text-align:center\"><h1 style=\"color:#f97316\">Blocked</h1>\
                 <p>{} is blocked during your focus session.</p>\
                 <p style=\"color:#666;font-size:13px\">SkadiFlow Focus Locker</p></div></body></html>",
                host
            );
            let resp = format!(
                "HTTP/1.1 403 Blocked\r\n\
                 Content-Type: text/html; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            );
            client.write_all(resp.as_bytes()).await?;
            return Ok(());
        }

        // Forward to the real server
        let port = extract_port_from_url(parts[1]).unwrap_or(80);
        if let Ok(mut remote) = TcpStream::connect(format!("{}:{}", host, port)).await {
            // Forward the original request
            remote.write_all(&buf[..n]).await?;
            let _ = copy_bidirectional(&mut client, &mut remote).await;
        }
    }

    Ok(())
}

// ── Domain matching ──────────────────────────────────────────────────

fn is_blocked_by(host: &str, domains: &Arc<RwLock<HashSet<String>>>) -> bool {
    let set = match domains.read() {
        Ok(s) => s,
        Err(_) => return false,
    };
    if set.is_empty() {
        return false;
    }

    let host_lower = host.to_lowercase();
    // Strip "www." for matching — "www.youtube.com" matches "youtube.com"
    let host_bare = host_lower.strip_prefix("www.").unwrap_or(&host_lower);

    for domain in set.iter() {
        // Exact match or subdomain match
        if host_bare == domain.as_str()
            || host_lower == domain.as_str()
            || host_bare.ends_with(&format!(".{}", domain))
            || host_lower.ends_with(&format!(".{}", domain))
        {
            return true;
        }
    }
    false
}

// ── Parsing helpers ──────────────────────────────────────────────────

fn parse_host_port(target: &str, default_port: u16) -> (String, u16) {
    // Handle [ipv6]:port or host:port
    if let Some(bracket_end) = target.find(']') {
        let host = target[..=bracket_end].to_string();
        let port = target[bracket_end + 1..]
            .strip_prefix(':')
            .and_then(|p| p.parse().ok())
            .unwrap_or(default_port);
        (host, port)
    } else if let Some(colon) = target.rfind(':') {
        let host = target[..colon].to_string();
        let port = target[colon + 1..].parse().unwrap_or(default_port);
        (host, port)
    } else {
        (target.to_string(), default_port)
    }
}

fn extract_http_host<'a>(request: &'a str, url: &'a str) -> String {
    // Try to get host from absolute URL: "http://host:port/path"
    if let Some(rest) = url.strip_prefix("http://").or_else(|| url.strip_prefix("https://")) {
        let host_part = rest.split('/').next().unwrap_or(rest);
        let host = host_part.split(':').next().unwrap_or(host_part);
        if !host.is_empty() {
            return host.to_lowercase();
        }
    }

    // Fall back to Host header
    for line in request.lines().skip(1) {
        let lower = line.to_lowercase();
        if lower.starts_with("host:") {
            let val = line[5..].trim();
            let host = val.split(':').next().unwrap_or(val);
            return host.to_lowercase();
        }
    }

    String::new()
}

fn extract_port_from_url(url: &str) -> Option<u16> {
    let rest = url.strip_prefix("http://").or_else(|| url.strip_prefix("https://"))?;
    let host_part = rest.split('/').next()?;
    let (_, port) = parse_host_port(host_part, 80);
    Some(port)
}

// ── System proxy management (HKCU — no admin needed!) ────────────────

#[cfg(target_os = "windows")]
fn get_proxy_state() -> &'static Mutex<SavedProxy> {
    SAVED_PROXY.get_or_init(|| Mutex::new(SavedProxy::default()))
}

#[cfg(target_os = "windows")]
fn enable_system_proxy(port: u16) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            KEY_READ | KEY_WRITE,
        )
        .map_err(|e| format!("open Internet Settings: {}", e))?;

    // Save original values
    let mut state = get_proxy_state().lock().unwrap();
    if !state.is_active {
        state.original_enable = key.get_value::<u32, _>("ProxyEnable").ok();
        state.original_server = key.get_value::<String, _>("ProxyServer").ok();
    }

    // Set our proxy
    key.set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("set ProxyEnable: {}", e))?;
    key.set_value("ProxyServer", &format!("127.0.0.1:{}", port))
        .map_err(|e| format!("set ProxyServer: {}", e))?;
    key.set_value("ProxyOverride", &"localhost;127.0.0.1;*.local;<local>")
        .map_err(|e| format!("set ProxyOverride: {}", e))?;

    state.is_active = true;
    drop(state);

    // Notify browsers that proxy settings changed
    notify_proxy_change();

    Ok(())
}

#[cfg(target_os = "windows")]
fn disable_system_proxy() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            KEY_READ | KEY_WRITE,
        )
        .map_err(|e| format!("open Internet Settings: {}", e))?;

    let mut state = get_proxy_state().lock().unwrap();

    // Restore original values
    let enable = state.original_enable.unwrap_or(0);
    key.set_value("ProxyEnable", &enable)
        .map_err(|e| format!("restore ProxyEnable: {}", e))?;

    match &state.original_server {
        Some(server) => {
            key.set_value("ProxyServer", server)
                .map_err(|e| format!("restore ProxyServer: {}", e))?;
        }
        None => {
            let _ = key.delete_value("ProxyServer");
        }
    }

    // Clean up ProxyOverride only if we set it
    if state.is_active {
        let _ = key.delete_value("ProxyOverride");
    }

    state.is_active = false;
    drop(state);

    notify_proxy_change();

    Ok(())
}

/// Notify WinInet (and thus Chrome/Edge) that proxy settings changed.
/// Uses PowerShell to call InternetSetOptionW from wininet.dll.
#[cfg(target_os = "windows")]
fn notify_proxy_change() {
    let script = concat!(
        "$t = Add-Type -MemberDefinition '",
        "[DllImport(\"wininet.dll\", SetLastError=true)]",
        "public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);",
        "' -Name W -Namespace P -PassThru; ",
        "$t::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null; ",  // SETTINGS_CHANGED
        "$t::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null"     // REFRESH
    );

    let _ = std::process::Command::new("powershell")
        .args(["-WindowStyle", "Hidden", "-NoProfile", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

/// On app startup, check if proxy settings point to a SkadiFlow port that's no longer active.
/// Fixes stale proxy settings left by a crash.
#[cfg(target_os = "windows")]
pub fn cleanup_stale_proxy() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = match hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        KEY_READ | KEY_WRITE,
    ) {
        Ok(k) => k,
        Err(_) => return,
    };

    let enable: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    let server: String = key.get_value("ProxyServer").unwrap_or_default();

    // If proxy is enabled and points to 127.0.0.1, it might be stale
    if enable == 1 && server.starts_with("127.0.0.1:") {
        // Check if OUR proxy is running on that port
        let our_port = get_proxy_port();
        let saved_port: u16 = server
            .strip_prefix("127.0.0.1:")
            .and_then(|p| p.parse().ok())
            .unwrap_or(0);

        if our_port == 0 || saved_port != our_port {
            // Stale proxy — disable it
            let _ = key.set_value("ProxyEnable", &0u32);
            let _ = key.delete_value("ProxyServer");
            let _ = key.delete_value("ProxyOverride");
            notify_proxy_change();
        }
    }
}

// ── Tauri commands ───────────────────────────────────────────────────

#[tauri::command]
pub fn activate_proxy_blocker(domains: Vec<String>) -> Result<String, String> {
    let port = get_proxy_port();
    if port == 0 {
        return Err("Proxy server not started".into());
    }

    // Normalize and set blocked domains
    let normalized: HashSet<String> = domains
        .iter()
        .map(|d| {
            d.trim()
                .trim_end_matches('.')
                .strip_prefix("www.")
                .unwrap_or(d.trim())
                .to_lowercase()
        })
        .filter(|d| !d.is_empty())
        .collect();

    let count = normalized.len();
    {
        let mut set = blocked_set().write().unwrap();
        *set = normalized;
    }

    // Enable system proxy pointing to our server
    #[cfg(target_os = "windows")]
    enable_system_proxy(port)?;

    Ok(format!("Proxy active on port {} — blocking {} domains", port, count))
}

#[tauri::command]
pub fn deactivate_proxy_blocker() -> Result<(), String> {
    // Clear blocked domains
    {
        let mut set = blocked_set().write().unwrap();
        set.clear();
    }

    // Restore original proxy settings
    #[cfg(target_os = "windows")]
    disable_system_proxy()?;

    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_set(domains: &[&str]) -> Arc<RwLock<HashSet<String>>> {
        let set: HashSet<String> = domains.iter().map(|s| s.to_string()).collect();
        Arc::new(RwLock::new(set))
    }

    // ── parse_host_port ──────────────────────────────────────────────

    #[test]
    fn parse_host_port_returns_default_when_no_port_given() {
        let (host, port) = parse_host_port("example.com", 443);
        assert_eq!(host, "example.com");
        assert_eq!(port, 443);
    }

    #[test]
    fn parse_host_port_extracts_explicit_port() {
        let (host, port) = parse_host_port("example.com:8080", 443);
        assert_eq!(host, "example.com");
        assert_eq!(port, 8080);
    }

    #[test]
    fn parse_host_port_handles_ipv6_with_brackets() {
        let (host, port) = parse_host_port("[::1]:8443", 443);
        assert_eq!(host, "[::1]");
        assert_eq!(port, 8443);
    }

    #[test]
    fn parse_host_port_falls_back_when_port_unparseable() {
        let (host, port) = parse_host_port("example.com:notaport", 443);
        assert_eq!(host, "example.com");
        assert_eq!(port, 443);
    }

    // ── extract_http_host ────────────────────────────────────────────

    #[test]
    fn extract_http_host_reads_absolute_url() {
        let req = "GET http://example.com/path HTTP/1.1\r\nHost: other.com\r\n\r\n";
        assert_eq!(extract_http_host(req, "http://example.com/path"), "example.com");
    }

    #[test]
    fn extract_http_host_strips_port_from_absolute_url() {
        let req = "GET http://example.com:8080/ HTTP/1.1\r\n\r\n";
        assert_eq!(extract_http_host(req, "http://example.com:8080/"), "example.com");
    }

    #[test]
    fn extract_http_host_falls_back_to_host_header_for_relative_path() {
        let req = "GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n";
        assert_eq!(extract_http_host(req, "/path"), "example.com");
    }

    #[test]
    fn extract_http_host_returns_lowercase() {
        let req = "GET / HTTP/1.1\r\nHost: Example.COM\r\n\r\n";
        assert_eq!(extract_http_host(req, "/"), "example.com");
    }

    #[test]
    fn extract_http_host_returns_empty_when_no_host_available() {
        assert_eq!(extract_http_host("GET / HTTP/1.1\r\n\r\n", "/"), "");
    }

    // ── is_blocked_by ────────────────────────────────────────────────

    #[test]
    fn is_blocked_by_matches_exact_domain() {
        let set = make_set(&["youtube.com"]);
        assert!(is_blocked_by("youtube.com", &set));
    }

    #[test]
    fn is_blocked_by_strips_www_prefix_from_host() {
        let set = make_set(&["youtube.com"]);
        assert!(is_blocked_by("www.youtube.com", &set));
    }

    #[test]
    fn is_blocked_by_matches_subdomains() {
        let set = make_set(&["youtube.com"]);
        assert!(is_blocked_by("m.youtube.com", &set));
        assert!(is_blocked_by("music.youtube.com", &set));
    }

    #[test]
    fn is_blocked_by_is_case_insensitive() {
        let set = make_set(&["youtube.com"]);
        assert!(is_blocked_by("YouTube.COM", &set));
    }

    #[test]
    fn is_blocked_by_does_not_match_unrelated_domains() {
        let set = make_set(&["youtube.com"]);
        assert!(!is_blocked_by("notyoutube.com", &set));
        assert!(!is_blocked_by("example.com", &set));
    }

    #[test]
    fn is_blocked_by_returns_false_when_blocklist_is_empty() {
        let set = make_set(&[]);
        assert!(!is_blocked_by("youtube.com", &set));
    }

    // ── extract_port_from_url ────────────────────────────────────────

    #[test]
    fn extract_port_from_url_defaults_to_80_for_http_without_port() {
        assert_eq!(extract_port_from_url("http://example.com/path"), Some(80));
    }

    #[test]
    fn extract_port_from_url_reads_explicit_port() {
        assert_eq!(extract_port_from_url("http://example.com:8080/path"), Some(8080));
    }

    #[test]
    fn extract_port_from_url_returns_none_for_relative_url() {
        assert_eq!(extract_port_from_url("/path"), None);
    }
}
