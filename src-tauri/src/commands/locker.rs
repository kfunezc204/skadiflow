use std::collections::HashSet;
use std::fs;
use std::net::ToSocketAddrs;
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Flag to hide console windows spawned by Command on Windows.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SENTINEL_START: &str = "# SKADIFLOW-LOCKER-START";
const SENTINEL_END: &str = "# SKADIFLOW-LOCKER-END";

// ── Firewall rule names ──────────────────────────────────────────────
#[cfg(target_os = "windows")]
const FW_RULE_DOH_TCP: &str = "SkadiFlow-Block-DoH-TCP";
#[cfg(target_os = "windows")]
const FW_RULE_DOH_UDP: &str = "SkadiFlow-Block-DoH-UDP";
#[cfg(target_os = "windows")]
const FW_RULE_DOT: &str = "SkadiFlow-Block-DoT";
#[cfg(target_os = "windows")]
const FW_RULE_IPS_TCP: &str = "SkadiFlow-Block-IPs-TCP";
#[cfg(target_os = "windows")]
const FW_RULE_IPS_QUIC: &str = "SkadiFlow-Block-IPs-QUIC";
#[cfg(target_os = "windows")]
const FW_RULE_IPS6_TCP: &str = "SkadiFlow-Block-IPv6-TCP";
#[cfg(target_os = "windows")]
const FW_RULE_IPS6_QUIC: &str = "SkadiFlow-Block-IPv6-QUIC";

/// Well-known DNS-over-HTTPS provider IPs.
/// Blocking outbound port 443 to these forces browsers to fall back to system DNS,
/// which respects the hosts file.
#[cfg(target_os = "windows")]
const DOH_SERVER_IPS: &[&str] = &[
    // Google
    "8.8.8.8", "8.8.4.4",
    // Cloudflare (also used by Firefox default)
    "1.1.1.1", "1.0.0.1",
    // Quad9
    "9.9.9.9", "149.112.112.112",
    // OpenDNS
    "208.67.222.222", "208.67.220.220",
    // NextDNS
    "45.90.28.0", "45.90.30.0",
    // CleanBrowsing
    "185.228.168.168", "185.228.169.168",
    // AdGuard
    "94.140.14.14", "94.140.15.15",
    // DNS.SB
    "185.222.222.222", "45.11.45.11",
    // Mullvad
    "194.242.2.2",
    // Control D
    "76.76.2.0", "76.76.10.0",
];

// ── Result struct returned to the frontend ───────────────────────────

#[derive(serde::Serialize, Default, Clone)]
pub struct LockerResult {
    pub hosts_written: bool,
    pub ips_resolved: usize,
    pub ips_blocked: bool,
    pub doh_blocked: bool,
    pub dns_flushed: bool,
    pub warnings: Vec<String>,
}

// ── Helpers ──────────────────────────────────────────────────────────

fn hosts_file_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts")
    }
    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from("/etc/hosts")
    }
}

fn remove_locker_block(content: &str) -> String {
    let mut result = String::new();
    let mut in_block = false;
    for line in content.lines() {
        if line.contains(SENTINEL_START) {
            in_block = true;
            continue;
        }
        if line.contains(SENTINEL_END) {
            in_block = false;
            continue;
        }
        if !in_block {
            result.push_str(line);
            result.push('\n');
        }
    }
    result
}

/// Normalize a domain: trim whitespace, strip trailing dot, strip "www." prefix.
fn normalize_domain(raw: &str) -> String {
    let d = raw.trim().trim_end_matches('.');
    d.strip_prefix("www.").unwrap_or(d).to_lowercase()
}

// ── Layer 0: DNS resolution ──────────────────────────────────────────
// Resolve each blocked domain to its real IPs BEFORE writing the hosts file.
// This captures the IPs that browsers may have cached in their internal DNS cache.

fn resolve_domain_ips(domains: &[String]) -> Vec<String> {
    let mut ips = HashSet::new();
    for domain in domains {
        let bare = normalize_domain(domain);
        if bare.is_empty() {
            continue;
        }
        for variant in &[bare.clone(), format!("www.{}", bare)] {
            // ToSocketAddrs uses the OS resolver (getaddrinfo) which queries
            // the system DNS — this runs BEFORE the hosts file is modified,
            // so we get the real IPs.
            if let Ok(addrs) = format!("{}:443", variant).to_socket_addrs() {
                for addr in addrs {
                    let ip = addr.ip();
                    let s = ip.to_string();
                    // Skip loopback — we only want real IPs to block
                    if !ip.is_loopback() && s != "0.0.0.0" {
                        ips.insert(s);
                    }
                }
            }
        }
    }
    ips.into_iter().collect()
}

// ── Layer 1: Hosts file ──────────────────────────────────────────────

fn write_hosts_block(domains: &[String]) -> Result<(), String> {
    let path = hosts_file_path();
    let content = fs::read_to_string(&path).map_err(|e| format!("read hosts: {}", e))?;
    let clean = remove_locker_block(&content);

    let mut block = format!("\n{}\n", SENTINEL_START);
    for domain in domains {
        let bare = normalize_domain(domain);
        if bare.is_empty() {
            continue;
        }
        // IPv4 + IPv6 loopback for both bare domain and www variant
        block.push_str(&format!("0.0.0.0 {}\n", bare));
        block.push_str(&format!("::1 {}\n", bare));
        block.push_str(&format!("0.0.0.0 www.{}\n", bare));
        block.push_str(&format!("::1 www.{}\n", bare));
    }
    block.push_str(&format!("{}\n", SENTINEL_END));

    fs::write(&path, clean + &block).map_err(|e| format!("write hosts: {}", e))
}

// ── Layer 2: Block resolved IPs via Windows Firewall ─────────────────
// This is the CRITICAL new layer. Even if a browser has the real IP cached
// in its internal DNS cache, the TCP/UDP connection will be blocked.

#[cfg(target_os = "windows")]
fn run_netsh_add_rule(name: &str, protocol: &str, ports: &str, remote_ips: &str, warnings: &mut Vec<String>) {
    let output = std::process::Command::new("netsh")
        .args([
            "advfirewall", "firewall", "add", "rule",
            &format!("name={}", name),
            "dir=out", "action=block",
            &format!("protocol={}", protocol),
            &format!("remoteport={}", ports),
            &format!("remoteip={}", remote_ips),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            warnings.push(format!("netsh rule '{}' failed: {}", name, stderr.trim()));
        }
        Err(e) => {
            warnings.push(format!("netsh rule '{}' error: {}", name, e));
        }
    }
}

#[cfg(target_os = "windows")]
fn block_domain_ips(ips: &[String], warnings: &mut Vec<String>) -> bool {
    if ips.is_empty() {
        return false;
    }

    let ipv4: Vec<&str> = ips.iter()
        .filter(|ip| !ip.contains(':'))
        .map(|s| s.as_str())
        .collect();
    let ipv6: Vec<&str> = ips.iter()
        .filter(|ip| ip.contains(':'))
        .map(|s| s.as_str())
        .collect();

    let mut any_ok = false;

    if !ipv4.is_empty() {
        let list = ipv4.join(",");
        // Block HTTP + HTTPS (TCP)
        let before = warnings.len();
        run_netsh_add_rule(FW_RULE_IPS_TCP, "tcp", "80,443", &list, warnings);
        if warnings.len() == before { any_ok = true; }
        // Block QUIC (UDP 443) — Chrome/Edge prefer this for HTTP/3
        let before = warnings.len();
        run_netsh_add_rule(FW_RULE_IPS_QUIC, "udp", "443", &list, warnings);
        if warnings.len() == before { any_ok = true; }
    }

    if !ipv6.is_empty() {
        let list = ipv6.join(",");
        let before = warnings.len();
        run_netsh_add_rule(FW_RULE_IPS6_TCP, "tcp", "80,443", &list, warnings);
        if warnings.len() == before { any_ok = true; }
        let before = warnings.len();
        run_netsh_add_rule(FW_RULE_IPS6_QUIC, "udp", "443", &list, warnings);
        if warnings.len() == before { any_ok = true; }
    }

    any_ok
}

// ── Layer 3: Block DoH / DoT ─────────────────────────────────────────

#[cfg(target_os = "windows")]
fn block_doh_firewall(warnings: &mut Vec<String>) -> bool {
    let remote_ips = DOH_SERVER_IPS.join(",");
    let mut any_ok = false;

    // TCP 443 — standard DoH
    let before = warnings.len();
    run_netsh_add_rule(FW_RULE_DOH_TCP, "tcp", "443", &remote_ips, warnings);
    if warnings.len() == before { any_ok = true; }

    // UDP 443 — QUIC (Chrome, Edge use this for DoH)
    let before = warnings.len();
    run_netsh_add_rule(FW_RULE_DOH_UDP, "udp", "443", &remote_ips, warnings);
    if warnings.len() == before { any_ok = true; }

    // Port 853 — DNS-over-TLS
    let before = warnings.len();
    run_netsh_add_rule(FW_RULE_DOT, "tcp", "853", "any", warnings);
    if warnings.len() == before { any_ok = true; }

    any_ok
}

// ── Layer 4: Registry DoH policies ───────────────────────────────────
//
// The pre-existing policy values are saved to a JSON file BEFORE overwriting,
// and the restore writes back exactly what was there — a machine that already
// had DoH policies (user- or org-managed) gets them back intact. A value that
// did not exist before (`None`) is deleted on restore.

/// Registry policy values as they were before we touched them.
/// `None` = the value did not exist.
#[derive(serde::Serialize, serde::Deserialize, Default, Clone, Debug, PartialEq)]
pub struct SavedDohPolicies {
    pub chrome_mode: Option<String>,
    pub edge_mode: Option<String>,
    pub firefox_enabled: Option<u32>,
}

pub fn doh_state_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {}", e))?;
    Ok(dir.join("doh_state.json"))
}

#[cfg(target_os = "windows")]
const CHROME_POLICY_KEY: &str = r"SOFTWARE\Policies\Google\Chrome";
#[cfg(target_os = "windows")]
const EDGE_POLICY_KEY: &str = r"SOFTWARE\Policies\Microsoft\Edge";
#[cfg(target_os = "windows")]
const FIREFOX_DOH_KEY: &str = r"SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS";

#[cfg(target_os = "windows")]
fn read_current_doh_policies() -> SavedDohPolicies {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let read_str = |subkey: &str, value: &str| -> Option<String> {
        hklm.open_subkey(subkey).ok()?.get_value::<String, _>(value).ok()
    };
    let read_u32 = |subkey: &str, value: &str| -> Option<u32> {
        hklm.open_subkey(subkey).ok()?.get_value::<u32, _>(value).ok()
    };

    SavedDohPolicies {
        chrome_mode: read_str(CHROME_POLICY_KEY, "DnsOverHttpsMode"),
        edge_mode: read_str(EDGE_POLICY_KEY, "DnsOverHttpsMode"),
        firefox_enabled: read_u32(FIREFOX_DOH_KEY, "Enabled"),
    }
}

#[cfg(target_os = "windows")]
fn disable_browser_doh(state_path: &Path) {
    use winreg::enums::*;
    use winreg::RegKey;

    // Save the pre-existing values once. If a state file already exists we are
    // re-activating within a session (or after a crash) and the file already
    // holds the true originals — never overwrite it with our own "off" values.
    if !state_path.exists() {
        let saved = read_current_doh_policies();
        if let Some(parent) = state_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string(&saved) {
            let _ = fs::write(state_path, text);
        }
    }

    for subkey in &[CHROME_POLICY_KEY, EDGE_POLICY_KEY] {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.create_subkey(subkey) {
            let _ = key.0.set_value("DnsOverHttpsMode", &"off");
        }
    }

    // Firefox
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(_) = hklm.create_subkey(r"SOFTWARE\Policies\Mozilla\Firefox") {
        if let Ok(dns_key) = hklm.create_subkey(FIREFOX_DOH_KEY) {
            let _ = dns_key.0.set_value("Enabled", &0u32);
        }
    }
}

#[cfg(target_os = "windows")]
fn restore_browser_doh(state_path: &Path) {
    use winreg::enums::*;
    use winreg::RegKey;

    // No saved state = we never changed anything (or already restored) —
    // foreign policy values are not ours to delete.
    let Some(saved) = fs::read_to_string(state_path)
        .ok()
        .and_then(|t| serde_json::from_str::<SavedDohPolicies>(&t).ok())
    else {
        return;
    };

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    let restore_str = |subkey: &str, value_name: &str, original: &Option<String>| {
        if let Ok(key) = hklm.open_subkey_with_flags(subkey, KEY_WRITE) {
            match original {
                Some(v) => { let _ = key.set_value(value_name, v); }
                None => { let _ = key.delete_value(value_name); }
            }
        }
    };
    restore_str(CHROME_POLICY_KEY, "DnsOverHttpsMode", &saved.chrome_mode);
    restore_str(EDGE_POLICY_KEY, "DnsOverHttpsMode", &saved.edge_mode);

    if let Ok(key) = hklm.open_subkey_with_flags(FIREFOX_DOH_KEY, KEY_WRITE) {
        match saved.firefox_enabled {
            Some(v) => { let _ = key.set_value("Enabled", &v); }
            None => { let _ = key.delete_value("Enabled"); }
        }
    }

    let _ = fs::remove_file(state_path);
}

// ── Layer 5: Flush DNS caches ────────────────────────────────────────

#[cfg(target_os = "windows")]
fn flush_dns_caches(warnings: &mut Vec<String>) -> bool {
    // ipconfig /flushdns — clears the Windows DNS Client cache
    let ok1 = match std::process::Command::new("ipconfig")
        .args(["/flushdns"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(o) if o.status.success() => true,
        Ok(o) => {
            warnings.push(format!("ipconfig /flushdns: {}", String::from_utf8_lossy(&o.stderr).trim()));
            false
        }
        Err(e) => {
            warnings.push(format!("ipconfig /flushdns error: {}", e));
            false
        }
    };

    // Clear-DnsClientCache via PowerShell — more thorough on newer Windows
    let ok2 = match std::process::Command::new("powershell")
        .args(["-WindowStyle", "Hidden", "-Command", "Clear-DnsClientCache"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(o) if o.status.success() => true,
        _ => false,
    };

    // NOTE: net stop/start dnscache is intentionally NOT used here.
    // On Windows 10 1809+ and Windows 11, the dnscache service is protected
    // and cannot be stopped — the commands silently fail.

    ok1 || ok2
}

// ── Cleanup helpers ──────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn delete_firewall_rule(name: &str) {
    let _ = std::process::Command::new("netsh")
        .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", name)])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(target_os = "windows")]
fn remove_all_firewall_rules() {
    for rule in [
        // DoH/DoT rules
        FW_RULE_DOH_TCP, FW_RULE_DOH_UDP, FW_RULE_DOT,
        // Legacy rule name from earlier versions
        "SkadiFlow-Block-DoH",
        // IP-based rules
        FW_RULE_IPS_TCP, FW_RULE_IPS_QUIC,
        FW_RULE_IPS6_TCP, FW_RULE_IPS6_QUIC,
    ] {
        delete_firewall_rule(rule);
    }
}

// ── Tauri commands ───────────────────────────────────────────────────

#[tauri::command]
pub fn check_locker_permission() -> bool {
    let path = hosts_file_path();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .is_ok()
}

#[tauri::command]
pub async fn activate_locker(
    app: tauri::AppHandle,
    domains: Vec<String>,
) -> Result<LockerResult, String> {
    // DNS resolution, netsh and PowerShell are all blocking — run the whole
    // activation off the async runtime so the UI never freezes.
    let doh_path = doh_state_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || activate_locker_impl(domains, &doh_path))
        .await
        .map_err(|e| e.to_string())?
}

fn activate_locker_impl(domains: Vec<String>, doh_state: &Path) -> Result<LockerResult, String> {
    let mut result = LockerResult::default();

    // ── Layer 0: Resolve real IPs BEFORE modifying hosts file ─────
    // This captures the IPs browsers have cached in their internal DNS cache.
    // We block these IPs via firewall so cached DNS entries can't bypass the block.
    let resolved_ips = resolve_domain_ips(&domains);
    result.ips_resolved = resolved_ips.len();

    // ── Layer 1: Write hosts file ────────────────────────────────
    // Uses 0.0.0.0 (instant connection refused) instead of 127.0.0.1 (slow timeout).
    // Catches all NEW DNS lookups after browser cache expires (~60s).
    write_hosts_block(&domains)?;
    result.hosts_written = true;

    #[cfg(target_os = "windows")]
    {
        // ── Layer 2: Block resolved IPs via firewall ─────────────
        // THE CRITICAL FIX: even if browsers have cached DNS, the actual
        // TCP/UDP connections to these IPs will be dropped by the firewall.
        result.ips_blocked = block_domain_ips(&resolved_ips, &mut result.warnings);

        // ── Layer 3: Block DoH/DoT traffic ───────────────────────
        // Forces browsers with Secure DNS in "automatic" mode to fall back
        // to the system resolver, which reads the hosts file.
        result.doh_blocked = block_doh_firewall(&mut result.warnings);

        // ── Layer 4: Registry policies to disable DoH ────────────
        // Only takes effect on next browser launch, but prevents DoH
        // re-activation during long focus sessions.
        disable_browser_doh(doh_state);

        // ── Layer 5: Flush OS DNS caches ─────────────────────────
        // Clears the Windows DNS Client cache so new lookups go to hosts file.
        result.dns_flushed = flush_dns_caches(&mut result.warnings);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = doh_state;
        let _ = std::process::Command::new("dscacheutil")
            .args(["-flushcache"])
            .output();
        result.dns_flushed = true;
    }

    Ok(result)
}

#[tauri::command]
pub async fn deactivate_locker(app: tauri::AppHandle) -> Result<(), String> {
    let doh_path = doh_state_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || deactivate_locker_impl(&doh_path))
        .await
        .map_err(|e| e.to_string())?
}

fn deactivate_locker_impl(doh_state: &Path) -> Result<(), String> {
    let path = hosts_file_path();
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let clean = remove_locker_block(&content);
    fs::write(&path, clean).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        remove_all_firewall_rules();
        restore_browser_doh(doh_state);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = doh_state;
    }

    Ok(())
}
