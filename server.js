const { createServer } = require('node:http');
const { parse } = require('node:url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: { origin: false }, // same-origin only
    serveClient: false,
  });

  // expose io to Next.js route handlers via a global
  globalThis.__socketIo = io;

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload) => {
      if (payload && typeof payload.tournamentId === 'string') {
        socket.join(`tournament:${payload.tournamentId}`);
      }
    });
    socket.on('unsubscribe', (payload) => {
      if (payload && typeof payload.tournamentId === 'string') {
        socket.leave(`tournament:${payload.tournamentId}`);
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
