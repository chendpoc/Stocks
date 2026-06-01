use std::io::stdout;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::Result;
use clap::Parser;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::{execute, terminal::ClearType};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use reqwest::Client;
use tokio::sync::mpsc;
use trader_chart::api::{api_base_from_env, fetch_bars, post_ingest};
use trader_chart::app::{App, FetchKind};
use trader_chart::handoff::{read_handoff, write_handoff};
use trader_chart::intervals::normalize;
use trader_chart::ui::draw_ui;

#[derive(Parser, Debug)]
#[command(name = "trader-chart", about = "Ratatui OHLCV chart for trader-cli")]
struct Cli {
    #[arg(long, default_value = "TSLA")]
    symbol: String,
    #[arg(long, default_value = "30d")]
    chart: String,
    #[arg(long)]
    api_base: Option<String>,
    #[arg(long)]
    handoff: Option<PathBuf>,
    #[arg(long, default_value_t = 120)]
    limit: u32,
}

enum WorkerMsg {
    BarsOk(Vec<trader_chart::model::Bar>, String),
    Err(String),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let handoff_path = cli
        .handoff
        .unwrap_or_else(default_handoff_path);
    let mut symbol = cli.symbol;
    let mut chart = cli.chart;
    if let Some(state) = read_handoff(&handoff_path)? {
        symbol = state.symbol;
        chart = state.chart;
    }
    let api_base = cli.api_base.unwrap_or_else(api_base_from_env);
    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let (tx, mut rx) = mpsc::unbounded_channel::<WorkerMsg>();

    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen, crossterm::terminal::Clear(ClearType::All))?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(symbol, chart, handoff_path.clone());

    let tick_rate = Duration::from_millis(80);
    let mut last_tick = std::time::Instant::now();

    loop {
        if let Some(kind) = app.pending_fetch.take() {
            spawn_fetch_kind(
                &client,
                &api_base,
                &app.symbol,
                &app.chart_interval,
                cli.limit,
                kind,
                tx.clone(),
            );
        }

        while let Ok(msg) = rx.try_recv() {
            match msg {
                WorkerMsg::BarsOk(bars, tf) => app.apply_bars(bars, tf),
                WorkerMsg::Err(e) => app.apply_error(e),
            }
        }

        terminal.draw(|f| draw_ui(f, &app))?;

        if app.should_quit {
            break;
        }

        let timeout = tick_rate.saturating_sub(last_tick.elapsed());
        if event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                handle_key(&mut app, key);
            }
        }
        if last_tick.elapsed() >= tick_rate {
            last_tick = std::time::Instant::now();
        }
    }

    let state = app.handoff_state();
    write_handoff(&handoff_path, &state)?;

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        crossterm::terminal::Clear(ClearType::All)
    )?;
    terminal.show_cursor()?;
    Ok(())
}

fn default_handoff_path() -> PathBuf {
    std::env::var("TRADER_CHART_HANDOFF")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(".cache/trader-cli/chart-handoff.json")
        })
}

fn spawn_fetch_kind(
    client: &Client,
    base: &str,
    symbol: &str,
    chart: &str,
    limit: u32,
    kind: FetchKind,
    tx: mpsc::UnboundedSender<WorkerMsg>,
) {
    let client = client.clone();
    let base = base.to_string();
    let symbol = symbol.to_string();
    let chart = normalize(chart);
    tokio::spawn(async move {
        let result = async {
            if kind == FetchKind::IngestThenBars {
                post_ingest(&client, &base, &symbol).await?;
            }
            fetch_bars(&client, &base, &symbol, &chart, limit).await
        }
        .await;
        match result {
            Ok((bars, tf)) => {
                let _ = tx.send(WorkerMsg::BarsOk(bars, tf));
            }
            Err(e) => {
                let _ = tx.send(WorkerMsg::Err(e.to_string()));
            }
        }
    });
}

fn handle_key(app: &mut App, key: KeyEvent) {
    if key.kind != KeyEventKind::Press {
        return;
    }
    if app.symbol_input_active {
        match key.code {
            KeyCode::Esc => {
                app.symbol_input_active = false;
                app.symbol_input.clear();
            }
            KeyCode::Enter => app.confirm_symbol_input(),
            KeyCode::Backspace => {
                app.symbol_input.pop();
            }
            KeyCode::Char(c) => {
                app.symbol_input.push(c);
            }
            _ => {}
        }
        return;
    }

    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => app.should_quit = true,
        KeyCode::Char('f') | KeyCode::Char('r') => app.request_fetch(FetchKind::Bars),
        KeyCode::Char('i') => app.request_fetch(FetchKind::IngestThenBars),
        KeyCode::Char('x') => app.symbol_mode = !app.symbol_mode,
        KeyCode::Char('/') => {
            app.symbol_input_active = true;
            app.symbol_input = app.symbol.clone();
        }
        KeyCode::Char('[') | KeyCode::Char(',') => app.cycle_interval(-1),
        KeyCode::Char(']') | KeyCode::Char('.') => app.cycle_interval(1),
        KeyCode::Char('+') | KeyCode::Char('=') => app.zoom(-1),
        KeyCode::Char('-') | KeyCode::Char('_') => app.zoom(1),
        KeyCode::Char('h') | KeyCode::Left if app.symbol_mode => app.cycle_symbol(-1),
        KeyCode::Char('l') | KeyCode::Right if app.symbol_mode => app.cycle_symbol(1),
        KeyCode::Char('j') | KeyCode::Down => app.move_crosshair(1),
        KeyCode::Char('k') | KeyCode::Up => app.move_crosshair(-1),
        KeyCode::Home => app.crosshair_home(),
        KeyCode::End => app.crosshair_end(),
        _ => {}
    }
}
