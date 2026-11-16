# burncap (Python)

Hard budgets for AI agents. Route OpenAI and Anthropic calls through [BurnCap](https://github.com/sanjaykumawat134/burncap) to track spend per agent, run and customer, and have agents paused or throttled automatically when they hit a budget.

Zero dependencies. Python 3.9+.

## Install

Not on PyPI yet. Install from GitHub:

```bash
pip install "git+https://github.com/sanjaykumawat134/burncap#subdirectory=sdk/python"
```

## Use

```python
import os
from openai import OpenAI
from burncap import BurnCap, is_budget_error, new_run_id

bc = BurnCap(key=os.environ["BURNCAP_KEY"], base_url="https://your-burncap-host")

client = OpenAI(
    base_url=bc.openai_base_url,
    default_headers=bc.headers(agent="researcher", run=new_run_id("research")),
)

try:
    client.chat.completions.create(model="gpt-4.1", messages=[{"role": "user", "content": "hi"}])
except Exception as err:
    if is_budget_error(err):
        stop_agent("out of budget")
    else:
        raise
```

Anthropic: `Anthropic(base_url=bc.anthropic_base_url, default_headers=bc.headers(agent="support-bot"))`.
LangChain: `ChatOpenAI(base_url=bc.openai_base_url, default_headers=bc.headers(agent="..."))`; CrewAI and AutoGen take the same base URL and headers.

## API

| | |
|---|---|
| `BurnCap(key, base_url, timeout=10)` | Client. Rejects keys that don't start with `bc_`. |
| `.openai_base_url` / `.anthropic_base_url` | Proxy URLs for the provider SDK's `base_url`. |
| `.headers(agent=, run=, customer=)` | `x-bc-*` headers for `default_headers`. |
| `.track(event_or_events)` | Report usage for calls that skip the proxy. Returns each agent's status. |
| `.status(agent, customer=None)` | `active` / `throttled` / `paused`, with `reason` and spend. |
| `is_budget_error(err)` | True for a BurnCap 402/429 from the OpenAI or Anthropic SDK, False for the provider's own errors. |
| `new_run_id(prefix="run")` | Short random run id. |

`track` and `status` raise `BurnCapError` (with `.status` and `.type`) on API errors.

## Test

```bash
PYTHONPATH=src python -m unittest discover -s tests
```
