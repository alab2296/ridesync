# RideSync

Real-time taxi-hailing platform: passenger app, driver app, admin web, Node.js backend.
**Status:** Phase 0 (planning and design). Portfolio project, not production software.

## Problems this project demonstrates
1. Preventing double booking when two drivers accept the same ride at once.
2. Reliable background location on iOS and Android.
3. A backend that handles 250 drivers sending a location every 3 seconds.

Each one will be backed by an automated test or a load-test result in this repo.

## Documentation
- [Product brief](docs/00-product-brief.md)
- [Requirements and user stories](docs/01-requirements.md)
- [Architecture](docs/02-architecture.md)
- [Data model](docs/03-data-model.md)
- [API outline](docs/04-api-outline.md)
- [Backlog and milestones](docs/05-backlog.md)
- [Engineering process](docs/06-engineering-process.md)
- [Decisions (ADRs)](docs/decisions/)

## How to run
Coming in milestone M1 (`docker compose up`).

## Licence
MIT
