"""Daily analytics email: sends a summary of today's Google Analytics numbers for dmaksimoff.com.

Run every evening by .github/workflows/daily-report.yml (setup: README.md, "Daily analytics email").
It reads four GitHub secrets, passed in as environment variables:
  GA_PROPERTY_ID      the Google Analytics property's number (Admin → Property details), not the G-… ID
  GA_CREDENTIALS      the service account's JSON key, pasted in whole
  GMAIL_ADDRESS       the Gmail address that sends the email, and receives it
  GMAIL_APP_PASSWORD  an app password for that Gmail account
Nothing from the reports is printed, since the run's log is public.
"""
import html
import json
import os
import smtplib
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, OrderBy, RunReportRequest
from google.oauth2 import service_account

SITE = "dmaksimoff.com"
NEW_YORK = ZoneInfo("America/New_York")
SEND_HOUR = 20            # 8 pm, New York time
TOP = 10                  # rows in each list (pages, sources, locations, devices)
SETTINGS = ["GA_PROPERTY_ID", "GA_CREDENTIALS", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD"]

# The summary's columns, and the numbers in it
RANGES = {"today": ("today", "today"), "yesterday": ("yesterday", "yesterday"), "week": ("6daysAgo", "today")}
TOTALS = ["activeUsers", "newUsers", "screenPageViews", "userEngagementDuration"]


def time_to_send():
    """The workflow is scheduled at both 00:00 and 01:00 UTC: 8 pm in New York in summer and in winter.
    Only the one that's 8 pm today sends. It goes by the time the run was scheduled for rather than the
    clock, since GitHub sometimes starts a run late. A run started by hand always sends."""
    schedule = os.environ.get("SCHEDULE")      # the cron line that started this run; empty when run by hand
    if not schedule:
        return True
    hour = int(schedule.split()[1])
    scheduled = datetime.now(timezone.utc).replace(hour=hour, minute=0, second=0, microsecond=0)
    return scheduled.astimezone(NEW_YORK).hour == SEND_HOUR


def fetch(property_id, credentials_json):
    """Asks Google Analytics for the numbers. "Today" follows the property's reporting time zone."""
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(credentials_json), scopes=["https://www.googleapis.com/auth/analytics.readonly"])
    client = BetaAnalyticsDataClient(credentials=credentials)
    prop = "properties/" + property_id.strip().removeprefix("properties/")

    def report(metrics, dimensions=(), date_ranges=(DateRange(start_date="today", end_date="today"),)):
        response = client.run_report(RunReportRequest(
            property=prop,
            date_ranges=list(date_ranges),
            dimensions=[Dimension(name=d) for d in dimensions],
            metrics=[Metric(name=m) for m in metrics],
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=metrics[0]), desc=True)] if dimensions else [],
            limit=TOP,
        ))
        return [([d.value for d in row.dimension_values], [float(m.value) for m in row.metric_values])
                for row in response.rows]

    # With several date ranges, each row is labelled with its range's name. A range with no visits has no row.
    rows = report(TOTALS, date_ranges=[DateRange(start_date=s, end_date=e, name=n) for n, (s, e) in RANGES.items()])
    totals = {name: dict.fromkeys(TOTALS, 0.0) for name in RANGES}
    for (name, *_), values in rows:
        totals[name] = dict(zip(TOTALS, values))

    return {
        "totals": totals,
        "pages": report(["screenPageViews", "activeUsers"], ["pagePath"]),
        "sources": report(["activeUsers"], ["sessionSourceMedium"]),
        "places": report(["activeUsers"], ["city", "country"]),
        "devices": report(["activeUsers"], ["deviceCategory"]),
    }


def count(n):
    return f"{round(n):,}"


def plural(n, word):
    return f"{count(n)} {word}{'' if round(n) == 1 else 's'}"


def duration(seconds):
    seconds = round(seconds)
    return f"{seconds // 60}m {seconds % 60:02d}s" if seconds >= 60 else f"{seconds}s"


def place(city, country):
    return ", ".join(v for v in (city, country) if v and v != "(not set)") or "Unknown"


def build_email(data, day):
    totals = data["totals"]

    def per_visitor(name):
        visitors = totals[name]["activeUsers"]
        return totals[name]["userEngagementDuration"] / visitors if visitors else 0

    summary = (["", "Today", "Yesterday", "Last 7 days"], [
        ["Visitors"] + [count(totals[r]["activeUsers"]) for r in RANGES],
        ["New visitors"] + [count(totals[r]["newUsers"]) for r in RANGES],
        ["Page views"] + [count(totals[r]["screenPageViews"]) for r in RANGES],
        ["Avg. time per visitor"] + [duration(per_visitor(r)) for r in RANGES],
    ])
    lists = [
        ("Pages viewed today", ["Page", "Views", "Visitors"],
         [[path, count(views), count(visitors)] for (path,), (views, visitors) in data["pages"]]),
        ("Where visitors came from", ["Source / medium", "Visitors"],
         [[source, count(n)] for (source,), (n,) in data["sources"]]),
        ("Where visitors are", ["Location", "Visitors"],
         [[place(city, country), count(n)] for (city, country), (n,) in data["places"]]),
        ("Devices", ["Device", "Visitors"],
         [[device.capitalize(), count(n)] for (device,), (n,) in data["devices"]]),
    ]
    lists = [section for section in lists if section[2]]

    today = totals["today"]
    date = f"{day:%A, %B} {day.day}"
    headline = f"{plural(today['activeUsers'], 'visitor')} today"
    note = ("Today's numbers can be a few hours behind; Google finishes processing them within a day. "
            "Full reports: https://analytics.google.com")

    message = EmailMessage()
    message["Subject"] = f"{SITE}, {day:%b} {day.day}: {plural(today['activeUsers'], 'visitor')}, " \
                         f"{plural(today['screenPageViews'], 'page view')}"

    # Plain text, for mail apps that don't show HTML
    def text_table(headers, rows):
        widths = [max(len(str(r[i])) for r in [headers] + rows) for i in range(len(headers))]
        return "\n".join("  ".join(str(c).ljust(w) if i == 0 else str(c).rjust(w)
                                   for i, (c, w) in enumerate(zip(r, widths))) for r in [headers] + rows)

    text = [f"{SITE} · {date}", headline, "", text_table(*summary)]
    for title, headers, rows in lists:
        text += ["", title, text_table(headers, rows)]
    if not lists:
        text += ["", "No visits today."]
    text += ["", note]
    message.set_content("\n".join(text))

    # HTML, with the styles inline (mail apps ignore style sheets)
    muted = "color:#6b675f"
    cell = "padding:6px 0;border-bottom:1px solid #e3ded3;"

    def html_table(headers, rows):
        def tr(row, head=False):
            cells = []
            for i, c in enumerate(row):
                style = cell + ("text-align:left;padding-right:16px" if i == 0 else "text-align:right;padding-left:16px")
                if head:
                    style += ";font-size:12px;" + muted
                cells.append(f'<td style="{style}">{html.escape(str(c))}</td>')
            return "<tr>" + "".join(cells) + "</tr>"
        return ('<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">'
                + tr(headers, head=True) + "".join(tr(r) for r in rows) + "</table>")

    body = [f'<p style="margin:0 0 4px;font-size:13px;{muted}">{SITE} · {html.escape(date)}</p>',
            f'<h1 style="font-size:22px;margin:0 0 20px">{html.escape(headline)}</h1>',
            html_table(*summary)]
    for title, headers, rows in lists:
        body += [f'<h2 style="font-size:15px;margin:28px 0 6px">{html.escape(title)}</h2>', html_table(headers, rows)]
    if not lists:
        body += ['<p style="font-size:14px;margin:28px 0 0">No visits today.</p>']
    body += [f'<p style="margin:28px 0 0;font-size:12px;{muted}">{html.escape(note)}</p>']
    message.add_alternative(
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',Arial,sans-serif;'
        'color:#0b0b0b;max-width:560px">' + "".join(body) + "</div>", subtype="html")
    return message


def send(message, address, password):
    message["From"] = f"Portfolio analytics <{address}>"
    message["To"] = address
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(address, password.replace(" ", ""))    # Google shows app passwords with spaces
        smtp.send_message(message)


def main():
    if not time_to_send():
        print("This scheduled time isn't 8 pm in New York today, so this run sends nothing.")
        return
    missing = [name for name in SETTINGS if not os.environ.get(name, "").strip()]
    if len(missing) == len(SETTINGS):
        print("::notice title=Daily analytics email::Not set up yet, so nothing was sent. "
              'Add the four GitHub secrets listed in README.md under "Daily analytics email".')
        return
    if missing:
        sys.exit(f"Missing GitHub secrets: {', '.join(missing)} (see README.md, \"Daily analytics email\").")

    data = fetch(os.environ["GA_PROPERTY_ID"], os.environ["GA_CREDENTIALS"])
    send(build_email(data, datetime.now(NEW_YORK).date()),
         os.environ["GMAIL_ADDRESS"].strip(), os.environ["GMAIL_APP_PASSWORD"])
    print("Report sent.")


if __name__ == "__main__":
    main()
