use std::fs;
use std::path::PathBuf;

const SENTINEL_START: &str = "# BLITZDESK-LOCKER-START";
const SENTINEL_END: &str = "# BLITZDESK-LOCKER-END";

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

#[tauri::command]
pub fn check_locker_permission() -> bool {
    let path = hosts_file_path();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .is_ok()
}

#[tauri::command]
pub fn activate_locker(domains: Vec<String>) -> Result<(), String> {
    let path = hosts_file_path();
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let clean = remove_locker_block(&content);

    let mut block = format!("\n{}\n", SENTINEL_START);
    for domain in &domains {
        let d = domain.trim();
        if d.is_empty() {
            continue;
        }
        block.push_str(&format!("127.0.0.1 {}\n", d));
        block.push_str(&format!("127.0.0.1 www.{}\n", d));
    }
    block.push_str(&format!("{}\n", SENTINEL_END));

    let new_content = clean + &block;
    fs::write(&path, new_content).map_err(|e| e.to_string())?;

    // Flush OS DNS cache in the background so the UI is not blocked
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("ipconfig")
            .args(["/flushdns"])
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("dscacheutil")
            .args(["-flushcache"])
            .spawn();
    }

    Ok(())
}

#[tauri::command]
pub fn deactivate_locker() -> Result<(), String> {
    let path = hosts_file_path();
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let clean = remove_locker_block(&content);
    fs::write(&path, clean).map_err(|e| e.to_string())
}
