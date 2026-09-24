---
layout: home
hero:
  name: Robot Fleet Platform
  text: Real time operations for 1,000 service robots
  tagline: Go ingestion, a Node orchestration API and a Next.js dashboard, modelled on a global hotel group running cleaning, delivery, room service and reception robots in 20 hotels.
  actions:
    - theme: brand
      text: Customer use case
      link: /guide/use-case
    - theme: alt
      text: Architecture
      link: /architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/cnotv/robot-fleet-platform
features:
  - title: Ingestion at the edge
    details: One goroutine per robot socket, strict validation and a 500ms throttle before anything reaches Redis.
  - title: One live picture
    details: The API keeps the latest state of every robot in a Redis hash and streams batched changes to dashboards every 250ms.
  - title: History that stays small
    details: MongoDB stores task changes, status changes and a 10 second heartbeat, not every packet.
  - title: A dashboard built for 1,000 robots
    details: WebGL world map with clustering, location filters, virtualized tables, reports and robot CRUD.
---
