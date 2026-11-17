# Data Tracker: Markets, Earnings & the TXSE

[![Tests](https://github.com/StevenP195/data-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/StevenP195/data-tracker/actions/workflows/tests.yml)

Every day, on its own, this tool downloads the latest values for the four U.S. markets (S&P 500, Nasdaq, NYSE and
the Texas Stock Exchange), every TXSE listing, a watchlist of large Nasdaq and NYSE companies, and the largest
companies reporting earnings that week. It adds them to a history with one row per item per day, flags which
stocks analysts expect to rise, to fall, or to come in below expectations, reports what moved in a GitHub Issue,
and publishes the result to a website.

- **Live site:** https://stevenp195.github.io/data-tracker/
- **Pages:** Today (`index.html`), Browse (`browse.html`), Trends (`trends.html`). The site installs as an app and
  works offline with the last data it loaded.

The TXSE gets extra attention: all of its listings are tracked with TXSE's official closing prices and short
interest, and Yahoo's analyst data fills in the TXSE-primary stocks that Nasdaq does not cover (Cullen/Frost moved
its listing from the NYSE to the TXSE on Nov 12, 2026).

## Items

Item key (`item_id`): the ticker as Yahoo Finance writes it (indexes start with `^`; preferreds use `-P` plus the
series letter, e.g. `CFR-PB`). The same item lines up day after day whichever source reports it.

| Group | Items | Count |
|---|---|---|
| Index | S&P 500 `^GSPC`, Nasdaq Composite `^IXIC`, NYSE Composite `^NYA`, and `TXS` (Texas Capital Texas Equity Index ETF, listed on TXSE) as the stand-in for the TXSE, which has no index of its own | 4 |
| TXSE | every security in the TXSE listings feed: stocks, preferreds and ETFs | ~24 |
| Watchlist | AAPL MSFT NVDA AMZN GOOGL META (Nasdaq); JPM BAC GS WFC XOM CVX COP SLB KMI HAL (NYSE) | 16 |
| Earnings this week | the 15 largest companies by market cap reporting Monday–Friday of the run's week (a weekend run looks at the coming week); these rotate as the week changes | ≤15 |

## Sources

| Source (`data/raw/<date>/…`) | Format | What it is | What is kept |
|---|---|---|---|
| `txse_listings.json.gz` | JSON | TXSE's official listings feed (the public content API behind txse.com): every TXSE listing with its official closing price | the whole feed (~25 listings) |
| `txse_short_interest.csv.gz` | CSV | TXSE's latest short interest report (published twice a month) | the whole file (one row per TXSE security) |
| `nasdaq_earnings.json.gz` | JSON | Nasdaq earnings calendar, one response per weekday of the run's week, kept unchanged and keyed by date | the raw file keeps every reporter (~300); the history keeps only the 15 largest by market cap plus tracked items that report that week |
| `yahoo_chart.json.gz` | JSON | Yahoo Finance chart API, one response per tracked symbol, kept unchanged and keyed by symbol | only the tracked symbols, and only the shortest range (last 5 trading days) |
| `nasdaq_analyst.json.gz` | JSON | Nasdaq analyst API (price target, EPS forecast, earnings surprise), three responses per tracked common stock | only the tracked common stocks; the history keeps the consensus overview, the next quarter's forecast and the latest surprise |
| `yahoo_analyst.json.gz` | JSON | Yahoo Finance analyst data for TXSE-listed common stocks (Nasdaq has no records for TXSE-primary listings) | only TXSE common stocks; the same fields as above, plus the next earnings date |

No source needs a login or an API key. One source failing never stops the run: it writes no raw file that day, and
every source's result (ok, count, error) is recorded in `data/runs/<date>.json` and `data/status.json`.

## History file: `data/history.csv`

One row per item per day, sorted by date, then `item_id`. A value a source does not report for an item that day is
left empty.

| Column | Meaning | Unit |
|---|---|---|
| `date` | UTC date of the run | YYYY-MM-DD |
| `item_id` | ticker (see Items) | text |
| `item` | item name | text |
| `source` | source of the row's price: `txse` (TXSE official close) for TXSE listings, `yahoo_chart` for the rest | text |
| `exchange` | Index, NYSE, Nasdaq or TXSE | text |
| `group` | Index, TXSE, Watchlist or Earnings this week (why the item is tracked) | text |
| `signals` | flags, separated by `; ` (see Signal rules) | text |
| `price_date` | trading day the close belongs to (New York date) | YYYY-MM-DD |
| `close` | closing price, or index level | USD (index points for indexes) |
| `change_pct` | change from the previous trading day's close | % |
| `volume` | shares traded that day | shares |
| `high_52w`, `low_52w` | 52-week high and low | USD |
| `pct_off_high` | close vs the 52-week high | % |
| `target_price` | consensus analyst price target | USD |
| `upside_pct` | target_price ÷ close − 1 | % |
| `analysts_buy`, `analysts_hold`, `analysts_sell` | number of analysts rating buy (incl. strong buy), hold, sell (incl. strong sell) | count |
| `eps_qtr` | fiscal quarter of the EPS forecast | text (e.g. Dec 2026) |
| `eps_forecast` | consensus EPS forecast for that quarter | USD per share |
| `eps_revisions_up`, `eps_revisions_down` | analysts raising / cutting that forecast in the last 4 weeks (Nasdaq) or 30 days (Yahoo) | count |
| `last_surprise_pct` | latest reported EPS vs the consensus forecast | % |
| `earnings_date` | report date, when the item reports in the run's week | YYYY-MM-DD |
| `earnings_time` | before open / after close, when known | text |
| `market_cap_b` | market capitalization (earnings calendar) | USD billions |
| `short_interest` | shares sold short at the latest TXSE settlement date (TXSE common stocks) | shares |
| `short_change_pct` | change in short interest from the previous report | % |
| `days_to_cover` | short interest ÷ average daily volume | days |

## Signal rules

- **Earnings this week:** reports Monday–Friday of the run's week.
- **Expected to rise:** `upside_pct` ≥ 25 and buy ratings are at least half of all ratings.
- **Expected to fall:** `upside_pct` ≤ 0 (at or above the consensus target), or more sell than buy ratings, or
  (TXSE common stocks) short interest up 25% or more since the previous report.
- **Below expectations:** more EPS estimate cuts than raises (`eps_revisions_down` > `eps_revisions_up`).

The thresholds are in `tracker/config.py`; rebuilding the history applies a change to every day.

## Move rule

move % = (close in the latest run ÷ close in the previous run − 1) × 100, for every item with a close in both runs.
Items are ranked by the absolute size of the move (largest first; ties by `item_id`), and the **top 10 non-zero
moves** are listed with their old and new close. Items in the latest run but not the previous one *appeared*;
items in the previous run but not the latest *disappeared*. The daily Issue (titled with the date) also lists flags
gained and lost. On weekends and holidays no close changes, so the Issue says so. A new Issue is opened every day
and the previous day's Issue is closed.

## Status file: `data/status.json`

`run_time` (UTC), `first_run_date` (date of the earliest raw file), `days_with_success` (number of dates with a raw
file), `items` (items in the latest run), `new_today` and `gone_today` (lists of item_ids that appeared and
disappeared), and `sources` (one entry per source: `name`, `format`, `ok`, `count`, `error`).

## Commands

```sh
uv sync                                 # install (the pipeline uses only the standard library; pytest for tests)
uv run python -m tracker run            # fetch every source, rebuild history + status, open the daily issue
uv run python -m tracker build          # rebuild data/history.csv and data/status.json from the raw files alone
uv run python -m tracker trends         # print the Trends page numbers computed in Python (cross-check)
uv run python -m tracker serve --port 8000   # serve the site at http://localhost:8000
uv run pytest                           # run the tests
```

A second run on the same UTC day replaces that day's raw files, rebuilds the history and updates that day's Issue,
so each day counts once.

## Files

| File | What it does |
|---|---|
| `tracker/__main__.py` | command line: run, fetch, build, issue, trends, serve |
| `tracker/config.py` | paths, tracked items, signal thresholds, history columns |
| `tracker/http.py` | standard-library HTTP GET with retries |
| `tracker/fetch.py` | calls every source in order and saves `data/raw/<date>/<source>.<format>.gz`; records each result in `data/runs/<date>.json` |
| `tracker/universe.py` | which symbols each run asks the price and analyst sources for |
| `tracker/sources/txse.py` | TXSE listings feed: fetch and convert |
| `tracker/sources/txse_short.py` | TXSE short interest report: fetch and convert |
| `tracker/sources/nasdaq_earnings.py` | Nasdaq earnings calendar for the run's week: fetch, convert, top-N by market cap |
| `tracker/sources/yahoo.py` | Yahoo chart API: fetch and convert prices |
| `tracker/sources/nasdaq_analyst.py` | Nasdaq analyst API: fetch and convert targets, ratings, forecasts, surprises |
| `tracker/sources/yahoo_analyst.py` | Yahoo analyst data for TXSE common stocks: fetch and convert |
| `tracker/history.py` | builds `data/history.csv` from the raw files alone; signal rules |
| `tracker/moves.py` | the move rule (biggest moves, appeared, disappeared, flags gained / lost) |
| `tracker/status.py` | writes `data/status.json` |
| `tracker/issues.py` | renders and opens the daily GitHub Issue, closes the previous one |
| `tracker/trends.py` | the Trends findings in Python, to cross-check the page |
| `index.html`, `assets/today.js` | Today page |
| `browse.html`, `assets/browse.js` | Browse page: filters (exchange, group, flag), search, sort by every numeric column, starred shortlist |
| `trends.html`, `assets/trends.js` | Trends page: value explorer with item picker, five findings with charts |
| `assets/app.js` | shared navigation, theme, data loading, CSV parsing, the move rule in the browser |
| `assets/style.css` | shared fonts and colors (light and dark) |
| `assets/vendor/chart.umd.min.js` | Chart.js 4.4.1 (MIT), served locally so charts work offline |
| `assets/icons/` | app icons; `scripts/make_icons.py` draws them |
| `manifest.webmanifest`, `sw.js` | web app manifest and service worker (installable, offline) |
| `tests/` | pytest: source conversion, history build and same-day re-run, failed source, move rule, Trends numbers |
| `.github/workflows/daily.yml` | daily run at 04:23 UTC: fetch, build, issue, commit data, publish site |
| `.github/workflows/tests.yml` | runs the tests on every push |
| `.github/workflows/pages.yml` | publishes the site to GitHub Pages |
| `data/raw/`, `data/runs/`, `data/history.csv`, `data/status.json` | the data (written by the pipeline) |

Data: TXSE, Nasdaq and Yahoo Finance, for a class project. Not investment advice.
