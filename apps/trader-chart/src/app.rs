use crate::intervals::{self, INTERVALS};
use crate::model::Bar;
use crate::symbols;
use crate::viewport::{clamp_visible, window_for};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchKind {
    Bars,
    IngestThenBars,
}

pub struct App {
    pub symbol: String,
    pub chart_interval: String,
    pub bars: Vec<Bar>,
    pub timeframe: Option<String>,
    pub loading: bool,
    pub error: Option<String>,
    pub visible_count: usize,
    pub scroll_from_end: usize,
    pub crosshair_index: usize,
    pub symbol_mode: bool,
    pub symbol_input_active: bool,
    pub symbol_input: String,
    pub should_quit: bool,
    pub handoff_path: std::path::PathBuf,
    pub pending_fetch: Option<FetchKind>,
}

impl App {
    pub fn new(symbol: String, chart_interval: String, handoff_path: std::path::PathBuf) -> Self {
        Self {
            symbol: symbol.to_uppercase(),
            chart_interval: intervals::normalize(&chart_interval),
            bars: Vec::new(),
            timeframe: None,
            loading: true,
            error: None,
            visible_count: 80,
            scroll_from_end: 0,
            crosshair_index: 0,
            symbol_mode: false,
            symbol_input_active: false,
            symbol_input: String::new(),
            should_quit: false,
            handoff_path,
            pending_fetch: Some(FetchKind::Bars),
        }
    }

    pub fn request_fetch(&mut self, kind: FetchKind) {
        self.loading = true;
        self.error = None;
        self.pending_fetch = Some(kind);
    }

    pub fn apply_bars(&mut self, bars: Vec<Bar>, timeframe: String) {
        self.bars = bars;
        self.timeframe = Some(timeframe);
        self.loading = false;
        self.error = None;
        self.pending_fetch = None;
        self.sync_crosshair_to_end();
    }

    pub fn apply_error(&mut self, msg: String) {
        self.loading = false;
        self.error = Some(msg);
        self.pending_fetch = None;
    }

    pub fn sync_crosshair_to_end(&mut self) {
        if self.bars.is_empty() {
            self.crosshair_index = 0;
            return;
        }
        let w = window_for(self.bars.len(), self.visible_count, self.scroll_from_end);
        self.crosshair_index = w.start + w.len.saturating_sub(1);
    }

    pub fn change_pct(&self) -> Option<f64> {
        if self.bars.len() < 2 {
            return None;
        }
        let first = self.bars.first()?.close;
        let last = self.bars.last()?.close;
        if first.abs() < f64::EPSILON {
            return None;
        }
        Some((last - first) / first * 100.0)
    }

    pub fn crosshair_summary(&self) -> String {
        if self.bars.is_empty() {
            return "无数据".to_string();
        }
        let i = self.crosshair_index.min(self.bars.len() - 1);
        let b = &self.bars[i];
        format!(
            "{}  O {:.2}  H {:.2}  L {:.2}  C {:.2}  V {:.0}",
            b.ts, b.open, b.high, b.low, b.close, b.volume
        )
    }

    pub fn cycle_interval(&mut self, delta: i32) {
        self.chart_interval = intervals::cycle(&self.chart_interval, delta);
        self.request_fetch(FetchKind::Bars);
    }

    pub fn cycle_symbol(&mut self, delta: i32) {
        self.symbol = symbols::cycle_symbol(&self.symbol, delta);
        self.request_fetch(FetchKind::Bars);
    }

    pub fn zoom(&mut self, delta: i32) {
        let next = self.visible_count as i32 + delta * 8;
        self.visible_count = clamp_visible(next as usize, 160, 12);
        self.sync_crosshair_to_end();
    }

    pub fn move_crosshair(&mut self, delta: i32) {
        if self.bars.is_empty() {
            return;
        }
        let len = self.bars.len() as i32;
        let next = (self.crosshair_index as i32 + delta).clamp(0, len - 1);
        self.crosshair_index = next as usize;
    }

    pub fn crosshair_home(&mut self) {
        self.crosshair_index = 0;
    }

    pub fn crosshair_end(&mut self) {
        if !self.bars.is_empty() {
            self.crosshair_index = self.bars.len() - 1;
        }
    }

    pub fn confirm_symbol_input(&mut self) {
        if let Some(sym) = symbols::normalize_ticker(&self.symbol_input) {
            self.symbol = sym;
            self.request_fetch(FetchKind::Bars);
        }
        self.symbol_input.clear();
        self.symbol_input_active = false;
    }

    pub fn handoff_state(&self) -> crate::handoff::HandoffState {
        crate::handoff::HandoffState::new(&self.symbol, &self.chart_interval)
    }

    pub fn min_terminal_ok(cols: u16, rows: u16) -> bool {
        cols >= 60 && rows >= 18
    }

    pub fn interval_labels_line() -> String {
        INTERVALS.join(" ")
    }
}
