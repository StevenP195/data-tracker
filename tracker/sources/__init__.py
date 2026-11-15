"""The five data sources. Each module has:

    NAME     the raw file name (data/raw/<date>/<NAME>.<FORMAT>.gz)
    FORMAT   json or csv: the format the source returns
    fetch(ctx) -> bytes   download; returns exactly what is saved as the raw file
    parse(raw: bytes)     convert the raw file into plain dicts (used by the build)
    count(raw: bytes)     how many records the raw file holds (for status.json)
"""


def num(x):
    """'$1,234.50' / '12.5%' / 3 / '' -> float or None."""
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace("$", "").replace(",", "").replace("%", "")
    if s in ("", "N/A", "--", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


from . import nasdaq_analyst, nasdaq_earnings, txse, txse_short, yahoo  # noqa: E402

# fetch order matters: the TXSE feed and the earnings calendar decide which
# symbols the price and analyst sources are asked for
ORDER = [txse, txse_short, nasdaq_earnings, yahoo, nasdaq_analyst]
BY_NAME = {m.NAME: m for m in ORDER}
