"""Flexible date windows: a preferred date plus/minus N days, clipped by hard limits and protected dates,
and forward/backward propagation of those windows along a chain of cities. Standard library only.

A preferred date is a planning preference, never a booked flight. Confirmed flights are not moved by anything here.
"""
from dataclasses import dataclass, field
from datetime import date as Date, timedelta


def _d(x):
    return x if isinstance(x, Date) else Date.fromisoformat(str(x)[:10])


@dataclass(frozen=True)
class DateWindow:
    preferred_date: str
    flexibility_before_days: int = 2
    flexibility_after_days: int = 2
    hard_min_date: str | None = None
    hard_max_date: str | None = None
    protected_dates: tuple = field(default_factory=tuple)

    def bounds(self):
        p = _d(self.preferred_date)
        lo, hi = p - timedelta(days=max(0, self.flexibility_before_days)), p + timedelta(days=max(0, self.flexibility_after_days))
        if self.hard_min_date:
            lo = max(lo, _d(self.hard_min_date))
        if self.hard_max_date:
            hi = min(hi, _d(self.hard_max_date))
        return lo, hi

    def dates(self):
        """Candidate departure dates, earliest first. Protected dates are removed; hard limits never widen."""
        lo, hi = self.bounds()
        blocked = {str(x)[:10] for x in self.protected_dates}
        out, d = [], lo
        while d <= hi:
            if d.isoformat() not in blocked:
                out.append(d.isoformat())
            d += timedelta(days=1)
        return out


def span(lo, hi, protected=()):
    """Every ISO date from lo to hi inclusive that is not protected (empty when lo > hi)."""
    lo, hi, blocked = _d(lo), _d(hi), {str(x)[:10] for x in protected}
    out = []
    while lo <= hi:
        if lo.isoformat() not in blocked:
            out.append(lo.isoformat())
        lo += timedelta(days=1)
    return out


def propagate(chain, first, stay_hours, deadline_date=None, protected=(), overnight=1):
    """Departure-date window for every leg of chain[0] -> chain[1] -> ... -> chain[-1].

    first        DateWindow for the first leg.
    stay_hours   {city: {"min": h, "max": h}} with a "default" entry; the stay applies to the city a leg arrives in.
    deadline     last local date on which the final leg may still depart (e.g. the day you must be back in Madrid).
    overnight    extra days a flight may take to land (latest arrival = departure + overnight).

    Forward pass: a city's earliest onward departure is the earliest arrival plus its minimum stay in whole days
    (a 4 h minimum still allows a same-day connection).
    Backward pass: a leg must leave early enough for every later minimum stay to fit before the deadline.
    The two are intersected, so no search is generated for a date that cannot belong to a valid itinerary.
    Returns [{"from", "to", "earliest", "latest", "dates": [...]}]; an impossible leg has dates == [].
    """
    def rule(city):
        return stay_hours.get(city, stay_hours.get("default", {"min": 0, "max": 24 * 365}))

    lo, hi = first.bounds()
    wins = [[lo, hi]]
    for i in range(1, len(chain) - 1):
        r = rule(chain[i])
        e = wins[-1][0] + timedelta(days=r["min"] // 24)
        l = wins[-1][1] + timedelta(days=overnight + r["max"] // 24)
        wins.append([e, l])
    if deadline_date:
        wins[-1][1] = min(wins[-1][1], _d(deadline_date))
    for i in range(len(wins) - 2, -1, -1):
        need = rule(chain[i + 1])["min"] // 24
        wins[i][1] = min(wins[i][1], wins[i + 1][1] - timedelta(days=need))
    out = []
    for i, (e, l) in enumerate(wins):
        prot = tuple(protected) + (tuple(first.protected_dates) if i == 0 else ())
        out.append({"from": chain[i], "to": chain[i + 1], "earliest": e.isoformat(), "latest": l.isoformat(), "dates": span(e, l, prot)})
    return out
