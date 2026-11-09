"""Entry point: python trip.py plan|run|build|report|alert|demo"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from flightintel.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
