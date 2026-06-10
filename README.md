# PMOptimal

PMOptimal is a lightweight, local-first project and task management workspace. It runs as a static web app and stores the workspace in the browser.

## Features

- Portfolio dashboard with project, task, action-item, completion, and overdue metrics
- Project, task, and linked action-item CRUD workflows
- Project status/priority and task status/priority filters
- PMO-oriented status and priority badges, progress tracking, ownership, and dates
- Responsive desktop, tablet, and mobile layouts
- Confirmations for destructive project, task, action-item, import, and demo-reset operations
- JSON export/import for portable workspace backups
- Resettable demo workspace for evaluation and recovery

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>. Use **Reset demo data** in the sidebar to populate the sample PMO portfolio.

## Data safety

All changes are saved to `localStorage` in the current browser. Export a JSON backup before clearing browser data or replacing a workspace through import/reset.
