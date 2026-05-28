import http from "http";
import os from "os";
import { app } from "./app.js";
import { initSocket } from "./sockets/index.js";
import { PORT } from "./config/env.js";
import { startOperacionAutoActivator } from "./services/operacionesScheduler.service.js";

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    const networkAddress = networkInterface?.find(
      ({ family, internal, address }) =>
        (family === "IPv4" || family === 4) &&
        !internal &&
        !address.startsWith("169.254.")
    );

    if (networkAddress) {
      return networkAddress.address;
    }
  }

  return "localhost";
};

const server = http.createServer(app);
const io = initSocket(server);

app.set("io", io);

server.listen(PORT, "0.0.0.0", () => {
  const localIp = getLocalIp();
  console.log(`API + WS en http://${localIp}:${PORT}`);
  startOperacionAutoActivator({ io });
});
