use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HandoffState {
    pub symbol: String,
    pub chart: String,
    #[serde(default = "default_menu")]
    pub menu: String,
}

fn default_menu() -> String {
    "dashboard".to_string()
}

impl HandoffState {
    pub fn new(symbol: &str, chart: &str) -> Self {
        Self {
            symbol: symbol.to_uppercase(),
            chart: chart.to_string(),
            menu: default_menu(),
        }
    }
}

pub fn read_handoff(path: &Path) -> Result<Option<HandoffState>> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).context("read handoff")?;
    let state: HandoffState = serde_json::from_str(&raw).context("parse handoff")?;
    Ok(Some(state))
}

pub fn write_handoff(path: &Path, state: &HandoffState) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("mkdir handoff dir")?;
    }
    let raw = serde_json::to_string_pretty(state).context("serialize handoff")?;
    fs::write(path, raw).context("write handoff")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn roundtrip() {
        let path = temp_dir().join("trader-chart-handoff-test.json");
        let state = HandoffState::new("tsla", "5m");
        write_handoff(&path, &state).unwrap();
        let read = read_handoff(&path).unwrap().unwrap();
        assert_eq!(read.symbol, "TSLA");
        assert_eq!(read.chart, "5m");
        let _ = fs::remove_file(path);
    }
}
