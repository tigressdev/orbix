from dataclasses import dataclass, field


@dataclass
class Offer:
    """One bookable-looking one-way itinerary (possibly with stops) on a single ticket."""
    origin: str
    destination: str
    dep_local: str          # 'YYYY-MM-DD HH:MM' at origin airport
    arr_local: str          # 'YYYY-MM-DD HH:MM' at destination airport
    price: float
    currency: str
    duration_min: int | None = None
    stops: int = 0
    airlines: str = ""
    flight_numbers: str = ""
    raw: dict = field(default_factory=dict)


class Provider:
    """Adapter contract. Implement search() and return normalized Offers.

    Raise RuntimeError on provider/API errors; return [] when there are simply no flights.
    """
    name = "base"

    def __init__(self, cfg):
        self.cfg = cfg

    def search(self, origin, destination, date):  # -> list[Offer]
        raise NotImplementedError
