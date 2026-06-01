pub const PREFERRED: &[&str] = &[
    "TSLA", "TSLL", "QQQ", "SPY", "ARKK", "NVDA", "COIN", "BMNR",
];

pub fn normalize_ticker(raw: &str) -> Option<String> {
    let t = raw.trim().to_uppercase();
    if t.is_empty() || !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return None;
    }
    Some(t)
}

pub fn cycle_symbol(current: &str, delta: i32) -> String {
    let cur = normalize_ticker(current).unwrap_or_else(|| PREFERRED[0].to_string());
    let idx = PREFERRED.iter().position(|&s| s == cur).unwrap_or(0);
    let len = PREFERRED.len() as i32;
    let next = (idx as i32 + delta).rem_euclid(len) as usize;
    PREFERRED[next].to_string()
}
