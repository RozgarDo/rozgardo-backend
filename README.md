# RozgarDo Backend

Express.js API server for the RozgarDo job portal.

## Tech Stack

- Express.js
- Supabase (PostgreSQL)
- CORS
- Dotenv

## Getting Started

```bash
# Install dependencies
npm install

# Start server
node server.js
```

## API Endpoints

- `/api/auth` - Authentication
- `/api/jobs` - Job listings
- `/api/applications` - Job applications

## Database

Uses Supabase PostgreSQL. Schema defined in `migration.sql`.

## Environment Variables

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
PORT=5000
```

## License

ISC