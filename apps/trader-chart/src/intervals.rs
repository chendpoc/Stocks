pub const INTERVALS: &[&str] = &["1m", "2m", "5m", "30m", "1h", "2h", "4h", "30d"];

pub fn normalize(raw: &str) -> String {
    let v = raw.trim().to_lowercase();
    if INTERVALS.contains(&v.as_str()) {
        v
    } else {
        "30d".to_string()
    }
}

pub fn cycle(current: &str, delta: i32) -> String {
    let cur = normalize(current);
    let idx = INTERVALS.iter().position(|&x| x == cur).unwrap_or(INTERVALS.len() - 1);
    let len = INTERVALS.len() as i32;
    let next = (idx as i32 + delta).rem_euclid(len) as usize;
    INTERVALS[next].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_unknown() {
        assert_eq!(normalize("bogus"), "30d");
    }

    #[test]
    fn cycle_wraps() {
        assert_eq!(cycle("30d", 1), "1m");
        assert_eq!(cycle("1m", -1), "30d");
    }
}
