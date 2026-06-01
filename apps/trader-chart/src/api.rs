use anyhow::{Context, Result};
use reqwest::Client;

use crate::model::{Bar, BarsResponse};

pub fn api_base_from_env() -> String {
    std::env::var("TRADER_API_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:8000/api/intel".to_string())
        .trim_end_matches('/')
        .to_string()
}

pub fn market_url(base: &str, path: &str) -> String {
    format!("{}/market{}", base, path)
}

pub async fn fetch_bars(
    client: &Client,
    base: &str,
    symbol: &str,
    chart: &str,
    limit: u32,
) -> Result<(Vec<Bar>, String)> {
    let url = format!(
        "{}/bars?symbol={}&chart={}&limit={}",
        market_url(base, ""),
        urlencoding_simple(symbol),
        urlencoding_simple(chart),
        limit
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .context("bars request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("bars HTTP {}: {}", status, text);
    }
    let payload: BarsResponse = resp.json().await.context("bars json")?;
    let tf = payload
        .timeframe
        .unwrap_or_else(|| chart.to_string());
    let bars = payload.bars.unwrap_or_default();
    if bars.is_empty() {
        anyhow::bail!("无 K 线数据 · Dashboard [f] 拉行情或 Ops [S] 启动后端");
    }
    Ok((bars, tf))
}

pub async fn post_ingest(client: &Client, base: &str, symbol: &str) -> Result<()> {
    let url = format!(
        "{}/ingest/{}?force=true",
        market_url(base, ""),
        urlencoding_simple(symbol)
    );
    let resp = client
        .post(&url)
        .send()
        .await
        .context("ingest request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("ingest HTTP {}: {}", status, text);
    }
    Ok(())
}

fn urlencoding_simple(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c.to_string()
            } else {
                format!("%{:02X}", c as u8)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_fixture() {
        let json = include_str!("../tests/fixtures/bars.json");
        let payload: BarsResponse = serde_json::from_str(json).unwrap();
        let bars = payload.bars.unwrap();
        assert_eq!(bars.len(), 3);
        assert!((bars[0].close - 100.0).abs() < f64::EPSILON);
    }
}
