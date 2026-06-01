use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Bar {
    pub ts: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BarsResponse {
    pub symbol: Option<String>,
    pub timeframe: Option<String>,
    pub chart: Option<String>,
    pub bars: Option<Vec<Bar>>,
}

impl Bar {
    pub fn parse_list(raw: &[serde_json::Value]) -> Vec<Bar> {
        raw.iter()
            .filter_map(|v| {
                Some(Bar {
                    ts: v.get("ts")?.as_str()?.to_string(),
                    open: v.get("open")?.as_f64()?,
                    high: v.get("high")?.as_f64()?,
                    low: v.get("low")?.as_f64()?,
                    close: v.get("close")?.as_f64()?,
                    volume: v.get("volume").and_then(|x| x.as_f64()).unwrap_or(0.0),
                })
            })
            .collect()
    }
}
