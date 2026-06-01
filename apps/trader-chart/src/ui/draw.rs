use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;
use crate::viewport::{price_range, window_for, y_for_price, ViewWindow};

pub fn draw_ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2),
            Constraint::Min(8),
            Constraint::Length(4),
            Constraint::Length(2),
        ])
        .split(f.area());

    draw_header(f, chunks[0], app);
    if let Some(err) = &app.error {
        let p = Paragraph::new(err.as_str())
            .style(Style::default().fg(Color::Red))
            .block(Block::default().borders(Borders::ALL).title("Error"));
        f.render_widget(p, chunks[1]);
    } else if app.bars.is_empty() && app.loading {
        let p = Paragraph::new("加载 K 线…")
            .block(Block::default().borders(Borders::ALL).title("Loading"));
        f.render_widget(p, chunks[1]);
    } else {
        let inner = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(5), Constraint::Length(3)])
            .split(chunks[1]);
        draw_candles(f, inner[0], app);
        draw_volume(f, inner[1], app);
    }
    draw_crosshair_line(f, chunks[2], app);
    draw_footer(f, chunks[3], app);

    if app.symbol_input_active {
        draw_symbol_overlay(f, app);
    }
}

fn draw_header(f: &mut Frame, area: Rect, app: &App) {
    let change = app.change_pct();
    let chg_str = change
        .map(|c| format!("{:+.2}%", c))
        .unwrap_or_else(|| "—".to_string());
    let tf = app.timeframe.as_deref().unwrap_or("—");
    let title = format!(
        " {} · {} · 源 {} · {} 根 · {} ",
        app.symbol,
        app.chart_interval,
        tf,
        app.bars.len(),
        chg_str
    );
    let mut spans = vec![Span::styled(title, Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))];
    if app.loading {
        spans.push(Span::raw("  "));
        spans.push(Span::styled("⟳", Style::default().fg(Color::Yellow)));
    }
    if app.symbol_mode {
        spans.push(Span::styled("  [x]标的模式", Style::default().fg(Color::Yellow)));
    }
    let p = Paragraph::new(Line::from(spans));
    f.render_widget(p, area);
}

fn draw_footer(f: &mut Frame, area: Rect, app: &App) {
    let hint = if app.symbol_input_active {
        "输入标的 · Enter 确认 · Esc 取消"
    } else {
        "q 退出 · [] 周期 · x 标的模式 · ←→/hl 换标的 · jk 十字 · +/- 缩放 · f 刷新 · i 拉行情 · / 搜索"
    };
    let p = Paragraph::new(hint).style(Style::default().fg(Color::DarkGray));
    f.render_widget(p, area);
}

fn draw_crosshair_line(f: &mut Frame, area: Rect, app: &App) {
    let text = app.crosshair_summary();
    let p = Paragraph::new(text)
        .block(Block::default().borders(Borders::TOP).title("OHLCV"));
    f.render_widget(p, area);
}

fn draw_symbol_overlay(f: &mut Frame, app: &App) {
    let area = centered_rect(60, 3, f.area());
    let p = Paragraph::new(format!("标的: {}_", app.symbol_input))
        .style(Style::default().fg(Color::Yellow))
        .block(Block::default().borders(Borders::ALL).title("Symbol"));
    f.render_widget(p, area);
}

fn centered_rect(percent_x: u16, height: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Length(height),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(r);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

fn win(app: &App) -> ViewWindow {
    window_for(app.bars.len(), app.visible_count, app.scroll_from_end)
}

fn draw_candles(f: &mut Frame, area: Rect, app: &App) {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(" K 线 ");
    let inner = block.inner(area);
    f.render_widget(block, area);
    if inner.width < 4 || inner.height < 3 {
        return;
    }
    let w = win(app);
    if w.len == 0 {
        return;
    }
    let (lo, hi) = price_range(&app.bars, &w);
    let h = inner.height;
    let chart_w = inner.width as usize;

    for (col, bi) in (w.start..w.start + w.len).enumerate() {
        if col >= chart_w {
            break;
        }
        let b = &app.bars[bi];
        let x = inner.x + col as u16;
        let y_high = y_for_price(b.high, lo, hi, h);
        let y_low = y_for_price(b.low, lo, hi, h);
        let y_open = y_for_price(b.open, lo, hi, h);
        let y_close = y_for_price(b.close, lo, hi, h);
        let y_top = y_high.min(y_low);
        let y_bot = y_high.max(y_low);
        let body_top = y_open.min(y_close);
        let body_bot = y_open.max(y_close);
        let color = if b.close >= b.open {
            Color::Green
        } else {
            Color::Red
        };
        let cross = bi == app.crosshair_index;
        let style = if cross {
            Style::default().fg(color).add_modifier(Modifier::REVERSED)
        } else {
            Style::default().fg(color)
        };
        for y in y_top..=y_bot {
            let ch = if y >= body_top && y <= body_bot && body_bot > body_top {
                '█'
            } else if y == y_top || y == y_bot {
                '│'
            } else {
                '│'
            };
            if y < h {
                f.buffer_mut()
                    .set_string(x, inner.y + y, ch.to_string(), style);
            }
        }
    }
}

fn draw_volume(f: &mut Frame, area: Rect, app: &App) {
    let block = Block::default().borders(Borders::LEFT | Borders::RIGHT | Borders::BOTTOM);
    let inner = block.inner(area);
    f.render_widget(block, area);
    let w = win(app);
    if w.len == 0 || inner.height == 0 {
        return;
    }
    let vmax = crate::viewport::max_volume(&app.bars, &w);
    let h = inner.height.max(1) as f64;
    let chart_w = inner.width as usize;
    for (col, bi) in (w.start..w.start + w.len).enumerate() {
        if col >= chart_w {
            break;
        }
        let vol = app.bars[bi].volume;
        let bars_h = ((vol / vmax) * (h - 1.0)).round() as u16;
        let x = inner.x + col as u16;
        for dy in 0..bars_h {
            let y = inner.y + inner.height.saturating_sub(1 + dy);
            f.buffer_mut().set_string(
                x,
                y,
                "▪",
                Style::default().fg(Color::Blue),
            );
        }
    }
}
