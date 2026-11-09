from .base import Offer, Provider  # noqa: F401


def get_provider(name, cfg):
    if name == "serpapi":
        from .serpapi import SerpApiProvider
        return SerpApiProvider(cfg)
    if name == "fixture":
        from .fixture import FixtureProvider
        return FixtureProvider(cfg)
    raise SystemExit(f"Unknown provider {name!r}. Available: serpapi, fixture")
