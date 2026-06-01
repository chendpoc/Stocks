use crate::model::Bar;

#[derive(Debug, Clone)]
pub struct ViewWindow {
    pub start: usize,
    pub len: usize,
}

pub fn clamp_visible(len: usize, max: usize, min: usize) -> usize {
    len.clamp(min, max)
}

pub fn window_for(bars_len: usize, visible: usize, scroll_from_end: usize) -> ViewWindow {
    if bars_len == 0 {
        return ViewWindow { start: 0, len: 0 };
    }
    let vis = visible.min(bars_len).max(1);
    let max_start = bars_len.saturating_sub(vis);
    let start = max_start.saturating_sub(scroll_from_end.min(max_start));
    ViewWindow { start, len: vis }
}

pub fn price_range(bars: &[Bar], win: &ViewWindow) -> (f64, f64) {
    let slice = &bars[win.start..win.start + win.len.min(bars.len().saturating_sub(win.start))];
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    for b in slice {
        lo = lo.min(b.low);
        hi = hi.max(b.high);
    }
    if !lo.is_finite() || !hi.is_finite() {
        return (0.0, 1.0);
    }
    if (hi - lo).abs() < f64::EPSILON {
        return (lo - 1.0, hi + 1.0);
    }
    let pad = (hi - lo) * 0.05;
    (lo - pad, hi + pad)
}

pub fn y_for_price(price: f64, lo: f64, hi: f64, height: u16) -> u16 {
    let h = height.max(1) as f64;
    let t = (price - lo) / (hi - lo);
    let row = (1.0 - t.clamp(0.0, 1.0)) * (h - 1.0);
    row.round() as u16
}

pub fn max_volume(bars: &[Bar], win: &ViewWindow) -> f64 {
    let end = (win.start + win.len).min(bars.len());
    bars[win.start..end]
        .iter()
        .map(|b| b.volume)
        .fold(0.0_f64, f64::max)
        .max(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Bar;

    fn bar(close: f64) -> Bar {
        Bar {
            ts: "t".into(),
            open: close,
            high: close + 1.0,
            low: close - 1.0,
            close,
            volume: 10.0,
        }
    }

    #[test]
    fn window_end_aligned() {
        let bars: Vec<_> = (0..20).map(|i| bar(i as f64)).collect();
        let w = window_for(bars.len(), 10, 0);
        assert_eq!(w.start, 10);
        assert_eq!(w.len, 10);
    }
}
