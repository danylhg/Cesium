import "dotenv/config";
import { createClient } from "./db/client.js";
import { seedUsers } from "./seeds/seedUsers.js";
import { seedOperation1 } from "./seeds/seedOperation1.js";
import { seedOperation2 } from "./seeds/seedOperation2.js";
import { seedOperation3 } from "./seeds/seedOperation3.js";
import { seedOperation4 } from "./seeds/seedOperation4.js";

// Punto de entrada del proceso de seed.
async function main() {
  // Usa un cliente dedicado para controlar manualmente la transaccion.
  const client = await createClient();

  try {
    // Todo el seed corre en una sola transaccion: si algo falla, nada queda a medias.
    await client.query("BEGIN");

    // Orden importante: primero usuarios/inventario base, despues operaciones.
    const usersResult = await seedUsers(client);
    const op1Result = await seedOperation1(client);
    const op2Result = await seedOperation2(client);
    const op3Result = await seedOperation3(client);
    const op4Result = await seedOperation4(client);

    // Confirma todos los cambios cuando los seeds terminaron correctamente.
    await client.query("COMMIT");

    // Resumen de ejecucion para verificar rapidamente que se cargo lo esperado.
    console.log("Seed OK");
    console.log(`Operacion 1 creada/actualizada: ${op1Result.codigo}      — ${op1Result.estado}      (id=${op1Result.idOp})  CUT=cramirez`);
    console.log(`Operacion 2 creada/actualizada: ${op2Result.codigo}   — ${op2Result.estado}  (id=${op2Result.idOp}) CUT=atorres`);
    console.log(`Operacion 3 creada/actualizada: ${op3Result.codigo} — ${op3Result.estado}      (id=${op3Result.idOp}) CUT=cramirez`);
    console.log(`Operacion 4 creada/actualizada: ${op4Result.codigo} — ${op4Result.estado}    (id=${op4Result.idOp}) CUT=atorres`);
    console.log(`Password para usuarios seed: ${usersResult.defaultPassword}`);
    console.log(`Personal OP1: ${op1Result.personalAsignado}`);
    console.log(`Personal OP2: ${op2Result.personalAsignado} (mlopez repetido)`);
    console.log(`Personal OP3: ${op3Result.personalAsignado}`);
    console.log(`Personal OP4: ${op4Result.personalAsignado}`);
    console.log(`Vehiculos fijos OP1: ${op1Result.vehiculosFijos}`);
    console.log(`Equipos fijos OP1:   ${op1Result.equiposFijos}`);
  } catch (e) {
    // Revierte la transaccion completa si cualquier seed lanza error.
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e);
    process.exitCode = 1;
  } finally {
    // Cierra la conexion aunque haya ocurrido error.
    await client.end();
  }
}

// Ejecuta el seed al invocar este archivo con Node.
main();
