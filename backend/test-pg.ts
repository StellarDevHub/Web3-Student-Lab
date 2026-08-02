import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  connectionString: process.env.DATABASE_URL
});
client.connect()
  .then(() => { console.log('Connected'); client.end(); })
  .catch((err: Error) => { console.error('Connection error', err.stack); client.end(); });
