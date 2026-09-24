"""Generates hotel-fleet.json: the demo hotels and robots.

The output is deterministic (fixed seed), so running this again without
changes reproduces the committed file byte for byte. Edit the tables below,
run `python3 generate_fleet.py`, and commit the regenerated JSON.
See docs/guide/simulation.md for how the numbers were chosen.
"""

import json
import random
from pathlib import Path

SEED = 7
TOTAL_ROBOTS = 1000

# id, name, city, country, region, latitude, longitude, IANA time zone
SITES = [
    ("muc", "Munich Central", "Munich", "Germany", "europe", 48.1402, 11.5586, "Europe/Berlin"),
    ("ber", "Berlin Mitte", "Berlin", "Germany", "europe", 52.5200, 13.4050, "Europe/Berlin"),
    ("lon", "London Canary Wharf", "London", "United Kingdom", "europe", 51.5054, -0.0235, "Europe/London"),
    ("par", "Paris Opera", "Paris", "France", "europe", 48.8719, 2.3316, "Europe/Paris"),
    ("mad", "Madrid Gran Via", "Madrid", "Spain", "europe", 40.4203, -3.7058, "Europe/Madrid"),
    ("mil", "Milan Porta Nuova", "Milan", "Italy", "europe", 45.4838, 9.1905, "Europe/Rome"),
    ("zrh", "Zurich Airport", "Zurich", "Switzerland", "europe", 47.4502, 8.5618, "Europe/Zurich"),
    ("nyc", "New York Midtown", "New York", "United States", "north_america", 40.7549, -73.9840, "America/New_York"),
    ("chi", "Chicago Loop", "Chicago", "United States", "north_america", 41.8819, -87.6278, "America/Chicago"),
    ("sfo", "San Francisco SoMa", "San Francisco", "United States", "north_america", 37.7786, -122.4059, "America/Los_Angeles"),
    ("tor", "Toronto Downtown", "Toronto", "Canada", "north_america", 43.6452, -79.3806, "America/Toronto"),
    ("mex", "Mexico City Reforma", "Mexico City", "Mexico", "latin_america", 19.4270, -99.1677, "America/Mexico_City"),
    ("sao", "Sao Paulo Paulista", "Sao Paulo", "Brazil", "latin_america", -23.5614, -46.6559, "America/Sao_Paulo"),
    ("dxb", "Dubai Marina", "Dubai", "United Arab Emirates", "middle_east_africa", 25.0805, 55.1403, "Asia/Dubai"),
    ("cpt", "Cape Town Waterfront", "Cape Town", "South Africa", "middle_east_africa", -33.9036, 18.4207, "Africa/Johannesburg"),
    ("sin", "Singapore Marina Bay", "Singapore", "Singapore", "asia_pacific", 1.2834, 103.8607, "Asia/Singapore"),
    ("hkg", "Hong Kong Central", "Hong Kong", "China", "asia_pacific", 22.2810, 114.1588, "Asia/Hong_Kong"),
    ("tyo", "Tokyo Shinjuku", "Tokyo", "Japan", "asia_pacific", 35.6896, 139.6921, "Asia/Tokyo"),
    ("sel", "Seoul Gangnam", "Seoul", "South Korea", "asia_pacific", 37.4979, 127.0276, "Asia/Seoul"),
    ("syd", "Sydney Circular Quay", "Sydney", "Australia", "asia_pacific", -33.8610, 151.2108, "Australia/Sydney"),
]

# kind, id code, share of each hotel's fleet, models as (name, max speed m/s, battery Wh)
KINDS = [
    ("cleaning", "cln", 0.36, [("Scrubber S50", 1.0, 1200), ("Vacuum V40", 0.8, 800)]),
    ("delivery", "dlv", 0.32, [("Courier D2", 1.2, 900)]),
    ("room_service", "rms", 0.16, [("Minibar M1", 1.0, 700)]),
    ("reception", "rcp", 0.16, [("Concierge C3", 0.8, 600)]),
]

FIRMWARE = ["4.2.1", "4.3.0", "4.3.2", "5.0.0"]


def generate() -> dict:
    rng = random.Random(SEED)

    # Hotel sizes vary by a factor of up to 2.7; the first hotel absorbs rounding.
    weights = [rng.uniform(0.6, 1.6) for _ in SITES]
    sizes = [round(TOTAL_ROBOTS * w / sum(weights)) for w in weights]
    sizes[0] += TOTAL_ROBOTS - sum(sizes)

    robots = []
    serial = 100000
    for site, size in zip(SITES, sizes):
        counts = [round(size * share) for _, _, share, _ in KINDS]
        counts[0] += size - sum(counts)
        for (kind, code, _, models), count in zip(KINDS, counts):
            for n in range(1, count + 1):
                model, max_speed, battery = rng.choice(models)
                serial += 1
                robots.append({
                    "id": f"{site[0]}-{code}-{n:02d}",
                    "kind": kind,
                    "siteId": site[0],
                    "model": model,
                    "serialNumber": f"SN-{serial}",
                    "firmware": rng.choice(FIRMWARE),
                    "maxSpeedMps": max_speed,
                    "batteryWh": battery,
                })

    keys = ["id", "name", "city", "country", "region", "latitude", "longitude", "timezone"]
    return {"customer": "Global hotel group", "sites": [dict(zip(keys, s)) for s in SITES], "robots": robots}


def write(fleet: dict, path: Path) -> None:
    # One record per line keeps diffs readable.
    line = lambda o: "    " + json.dumps(o, separators=(", ", ": "))
    path.write_text(
        '{\n  "customer": %s,\n  "sites": [\n%s\n  ],\n  "robots": [\n%s\n  ]\n}\n'
        % (json.dumps(fleet["customer"]), ",\n".join(map(line, fleet["sites"])), ",\n".join(map(line, fleet["robots"])))
    )


if __name__ == "__main__":
    fleet = generate()
    assert len(fleet["robots"]) == TOTAL_ROBOTS
    assert len({r["id"] for r in fleet["robots"]}) == TOTAL_ROBOTS, "robot ids must be unique"
    write(fleet, Path(__file__).with_name("hotel-fleet.json"))
    print(f"wrote {len(fleet['robots'])} robots in {len(fleet['sites'])} hotels")
