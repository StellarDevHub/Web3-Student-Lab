const autocannon = require('autocannon');

const url = process.env.TEST_URL || 'http://localhost:4001/graphql';
const connections = Number(process.env.CONNS || 1000);
const duration = Number(process.env.DURATION || 10);

console.log(`Starting WS load test against ${url} with ${connections} connections for ${duration}s`);

autocannon({
  url,
  connections,
  duration,
  pipelining: 1,
  timeout: 20,
  headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  setupClient: (client) => {
    client.on('connect', () => {
      // send a simple graphql-ws connection_init
      client.send(JSON.stringify({ type: 'connection_init', payload: {} }));
      // send a small subscribe payload for courseUpdated with random id
      const id = Math.random().toString(36).slice(2, 8);
      const payload = {
        id,
        type: 'start',
        payload: {
          query: 'subscription($courseId: ID!){ courseUpdated(courseId: $courseId){ id title } }',
          variables: { courseId: 'test-room' },
        },
      };
      client.send(JSON.stringify(payload));
    });
    client.on('data', () => {});
  },
}, (err, res) => {
  if (err) {
    console.error('autocannon error', err);
    process.exit(1);
  }
  console.log('Finished', res);
});
