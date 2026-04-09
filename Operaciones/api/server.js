import http from "http";
import { app } from "./app.js";
import { initSocket } from "./sockets/index.js";
import { PORT } from "./config/env.js";

const server = http.createServer(app);
const io = initSocket(server);

app.set("io", io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`API + WS en http://192.168.100.12:${PORT}`);
  // http://192.168.202.103 SEDAM
  // http://192.168.100.12:3001 mi casa de vera
  // http://192.168.1.83:3001 mi casa de lerdo
});
