# Customer use case: a global hotel group

The demo data models a hospitality operator: one hotel group running a mixed fleet of service robots in 20 hotels on five continents. Hospitality is a common case for robot fleet orchestration: robots from several vendors share lobbies, corridors and elevators, and operations teams need one view across every property.

[How the simulation works](/guide/simulation) explains how this fleet was designed and generated. The same file drives both the simulator and the database seed: [`ingestion-service/cmd/simulator/hotel-fleet.json`](https://github.com/cnotv/robot-fleet-platform/blob/main/ingestion-service/cmd/simulator/hotel-fleet.json).

## Hotels

| Region | Hotels |
| --- | --- |
| Europe | Munich Central, Berlin Mitte, London Canary Wharf, Paris Opera, Madrid Gran Via, Milan Porta Nuova, Zurich Airport |
| North America | New York Midtown, Chicago Loop, San Francisco SoMa, Toronto Downtown |
| Latin America | Mexico City Reforma, Sao Paulo Paulista |
| Middle East and Africa | Dubai Marina, Cape Town Waterfront |
| Asia Pacific | Singapore Marina Bay, Hong Kong Central, Tokyo Shinjuku, Seoul Gangnam, Sydney Circular Quay |

Each hotel has between 33 and 80 robots, 1,000 in total. Every hotel stores its IANA time zone, because robot activity follows local time.

## Robot types

| Type | Share | Example tasks | Rhythm |
| --- | --- | --- | --- |
| Cleaning | 36% | `scrub_lobby`, `vacuum_corridor_f12`, `vacuum_ballroom` | Busiest at night |
| Delivery | 32% | `pickup_kitchen`, `deliver_room_1204`, `ride_elevator_bank_a` | Busy from 07:00 to 23:00 |
| Room service | 16% | `restock_minibar_f7`, `ride_elevator_bank_b` | Busy from 07:00 to 23:00 |
| Reception | 16% | `greet_lobby`, `guide_to_elevator`, `checkin_assist` | Almost always on during the day |

Robot ids read as `{hotel}-{type}-{number}`, for example `muc-dlv-07` is delivery robot 7 in Munich.

## Behaviour the simulator reproduces

* Robots stay within about 75m of their hotel and move only while active.
* A task lasts 20 to 120 seconds. When it ends, the robot picks a new task or goes idle, weighted by the local hour.
* Delivery and room service robots ride elevators for about 30% of their tasks. Elevator rides are a report of their own, because elevator integration is where hotel fleets most often stall.
* Batteries drain while active and robots dock to charge below 15%, returning to work at 95%.
* About one robot in a hundred is faulted at any time; a fault lasts 30 seconds to 4 minutes.

## Questions the dashboard answers

| Question | Where |
| --- | --- |
| Where are my robots and which hotels have problems right now? | Overview map: amber clusters contain faulted robots |
| How available is each hotel's fleet? | Availability report |
| Which robots need a charger before they stop? | Low battery report |
| What is broken and what was it doing? | Open incidents report |
| How much work did each hotel get done, and how often do robots use elevators? | Tasks and elevator rides report |
| What did one robot do in the last hour? | Robot page: battery chart and task list |
| How do I add, retire or reassign a robot? | Robots page and robot page: create, edit, delete |
