import { Server } from "socket.io";

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado:", socket.id);

    socket.on("join_operacion", (payload) => {
      let idOperacion = null;

      if (typeof payload === "number" || typeof payload === "string") {
        idOperacion = Number(payload);
      } else {
        idOperacion = Number(payload?.id_operacion);
      }

      if (!Number.isFinite(idOperacion) || idOperacion <= 0) {
        console.warn("join_operacion inválido:", payload);
        return;
      }

      socket.join(`op_${idOperacion}`);
      console.log(`Socket ${socket.id} unido a operación ${idOperacion}`);
      socket.operationId = idOperacion;
    });

    socket.on("tracking_personal", (data) => {
      if (socket.operationId) {
        socket.to(`op_${socket.operationId}`).emit("tracking_personal", data);
      }
    });

    socket.on("tracking_vehiculo", (data) => {
      if (socket.operationId) {
        socket.to(`op_${socket.operationId}`).emit("tracking_vehiculo", data);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Cliente desconectado:", socket.id);
    });
  });

  return io;
}
