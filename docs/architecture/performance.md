# Performance design

| Concern | Decision | Effect |
| --- | --- | --- |
| Robot flooding | 500ms window per connection; invalid frames also consume it | At most 2 frames per second per robot reach Redis |
| Redis round trips | One multi field `HSET` per 250ms batch | 4 writes per second regardless of fleet size |
| Snapshot latency | Hash values are stored as JSON and joined without parsing | 1,000 robots in single digit milliseconds |
| MongoDB volume | Persist changes plus a 10 second heartbeat | About 70 documents a second instead of 1,000 |
| MongoDB latency | Unordered `insertMany`, fire and forget | Persistence never blocks the live path |
| Dashboard fan out | One frame per batch per client; clients over 1 MB buffered are skipped | Server memory stays bounded |
| React reflow | Frames buffered, committed every 300ms | About 3 commits per second |
| Map rendering | WebGL, clustered GeoJSON, refit only on filter change | 1,000 markers without dropped frames |
| Table rendering | TanStack Virtual with overscan 10 | Only visible rows exist in the DOM |
| Reports | Aggregation over the history window, joined to inventory in memory | Sub second for one hour of data |
