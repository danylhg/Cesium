import { getAdminId, getPersonalByUsername, getPersonalIdStrict } from "../helpers/personal.js";
import { getGrupoId } from "../helpers/lookup.js";
import { ensureChatParticipantUsuario, ensureChatParticipantPersonal } from "../helpers/chat.js";

export async function seedOperation3(client) {
  const creadoPor = await getAdminId(client);

  // =========================================================
  // OP-HISTORICA-003 — CERRADA
  // =========================================================
  const OP3_CODIGO = "OP-HISTORICA-003";

  const personalOp3Usernames = [
    "cramirez",
    "lhernandez",
    "iperez",
    "dortega",
    "oreyes",
    "dperez",
    "dortiz",
    "olopez",
  ];

  const cutOp3 = await getPersonalIdStrict(client, "cramirez");

  await client.query(
    `
    INSERT INTO operacion
      (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
    VALUES
      ($1,$2,$3,'ALTA','ACTIVA','2024-09-01 06:00:00-06','2024-11-30 22:00:00-06',$4,$5)
    ON CONFLICT (codigo) DO UPDATE
      SET estado       = 'ACTIVA',
          nombre       = EXCLUDED.nombre,
          descripcion  = EXCLUDED.descripcion,
          prioridad    = EXCLUDED.prioridad,
          fecha_inicio = EXCLUDED.fecha_inicio,
          fecha_fin    = EXCLUDED.fecha_fin,
          creada_por   = EXCLUDED.creada_por,
          id_cut       = EXCLUDED.id_cut
    `,
    [
      OP3_CODIGO,
      "Operacion Historica 003",
      "Operacion concluida exitosamente. Periodo: sept-nov 2024. CUT: cramirez. CET lhernandez al mando. Objetivos cumplidos al 100%.",
      creadoPor,
      cutOp3,
    ]
  );

  const op3Row = await client.query(
    `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
    [OP3_CODIGO]
  );
  const idOp3 = op3Row.rows[0].id_operacion;

  const personalAsignado3 = [];

  for (const username of personalOp3Usernames) {
    const persona = await getPersonalByUsername(client, username);
    if (!persona) {
      console.warn(`WARN OP3: personal "${username}" no encontrado, se omite`);
      continue;
    }

    personalAsignado3.push(persona);

    await client.query(
      `
      INSERT INTO asignacion_operacion_personal
        (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,'ASIGNADO',$4)
      ON CONFLICT (id_operacion, id_personal) DO UPDATE
        SET rol_en_operacion  = EXCLUDED.rol_en_operacion,
            estado_asignacion = EXCLUDED.estado_asignacion,
            asignado_por      = EXCLUDED.asignado_por
      `,
      [idOp3, persona.id_personal, persona.rol, creadoPor]
    );
  }

  const cet3 = personalAsignado3.find((p) => p.username === "lhernandez");
  const cells3 = personalAsignado3.filter((p) => p.rol === "CELL");

  if (!cet3) throw new Error(`No se encontró lhernandez para OP-HISTORICA-003.`);

  for (const cell of cells3) {
    await client.query(
      `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
      [idOp3, cet3.id_personal, cell.id_personal, creadoPor]
    );
  }

  await client.query(
    `
    INSERT INTO grupo_operacion
      (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
    VALUES
      ($1,'Grupo HISTORICA','HISTORICA',NULL,'Grupo principal — Operacion Historica 003',$2)
    ON CONFLICT (id_operacion, nombre) DO NOTHING
    `,
    [idOp3, creadoPor]
  );

  const idPadre3 = await getGrupoId(client, idOp3, "Grupo HISTORICA");
  if (!idPadre3) throw new Error(`No se pudo obtener el grupo padre de OP-HISTORICA-003.`);

  for (const nombre of ["Condor 1", "Condor 2"]) {
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES ($1,$2,NULL,$3,$4,$5)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp3, nombre, idPadre3, `Subgrupo ${nombre}`, creadoPor]
    );
  }

  const idCondor1 = await getGrupoId(client, idOp3, "Condor 1");
  const idCondor2 = await getGrupoId(client, idOp3, "Condor 2");

  if (!idCondor1 || !idCondor2) throw new Error(`No se pudieron obtener los subgrupos de OP-HISTORICA-003.`);

  for (const username of ["iperez", "dortega", "oreyes"]) {
    const persona = personalAsignado3.find((p) => p.username === username);
    if (!persona) continue;
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CELL',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idCondor1, persona.id_personal, creadoPor]
    );
  }

  for (const username of ["dperez", "dortiz", "olopez"]) {
    const persona = personalAsignado3.find((p) => p.username === username);
    if (!persona) continue;
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CELL',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idCondor2, persona.id_personal, creadoPor]
    );
  }

  // =========================================================
  // CHAT OP-HISTORICA-003
  // =========================================================
  const chat3Res = await client.query(
    `INSERT INTO chat_operacion (id_operacion, activo)
     VALUES ($1, TRUE)
     ON CONFLICT (id_operacion) DO UPDATE
       SET activo = TRUE,
           fecha_cierre = NULL
     RETURNING id_chat`,
    [idOp3]
  );

  let idChat3 = chat3Res.rows?.[0]?.id_chat;
  if (!idChat3) {
    const chat3Lookup = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
      [idOp3]
    );
    if (chat3Lookup.rowCount === 0) throw new Error(`No se pudo crear el chat de OP-HISTORICA-003.`);
    idChat3 = chat3Lookup.rows[0].id_chat;
  }

  const idPartAdmin3 = await ensureChatParticipantUsuario(client, idChat3, creadoPor);

  for (const persona of personalAsignado3) {
    await ensureChatParticipantPersonal(client, idChat3, persona.id_personal);
  }

  if (idPartAdmin3) {
    const msgCount3 = await client.query(
      `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
      [idChat3]
    );

    if ((msgCount3.rows[0]?.total ?? 0) === 0) {
      const mensajes3 = [
        { contenido: "Todos los elementos en posición. Iniciando fase de reconocimiento.", tipo: "NORMAL" },
        { contenido: "Sector norte asegurado. Sin novedades.", tipo: "NORMAL" },
        { contenido: "Objetivos cumplidos. Retirando unidades.", tipo: "NORMAL" },
      ];

      for (const msg of mensajes3) {
        await client.query(
          `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
           VALUES ($1,$2,$3,$4)`,
          [idChat3, idPartAdmin3, msg.contenido, msg.tipo]
        );
      }
    }
  }

  // =========================================================
  // ZONA OP-HISTORICA-003 — Xalapa
  // =========================================================
  const zonaGeometria3 = {
    type: "Polygon",
    coordinates: [[
      [-96.3500, 19.5500],
      [-96.2700, 19.5500],
      [-96.2700, 19.4800],
      [-96.3500, 19.4800],
      [-96.3500, 19.5500],
    ]],
  };

  await client.query(
    `
    INSERT INTO zona_operacion
      (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id_operacion) DO UPDATE
      SET nombre        = EXCLUDED.nombre,
          geometria     = EXCLUDED.geometria,
          centroide_lat = EXCLUDED.centroide_lat,
          centroide_lon = EXCLUDED.centroide_lon,
          zoom_inicial  = EXCLUDED.zoom_inicial,
          color         = EXCLUDED.color,
          creado_por    = EXCLUDED.creado_por,
          fecha_creacion = NOW()
    `,
    [
      idOp3,
      "Zona Xalapa",
      JSON.stringify(zonaGeometria3),
      19.5150,
      -96.3100,
      1100,
      "#16a34a",
      creadoPor,
    ]
  );

  // =========================================================
  // CIERRE — liberar recursos y cerrar operación
  // =========================================================
  await client.query(
    `UPDATE asignacion_operacion_personal
     SET estado_asignacion = 'LIBERADO'
     WHERE id_operacion = $1`,
    [idOp3]
  );

  await client.query(
    `UPDATE vehiculo_operacion
     SET estado_asignacion = 'LIBERADO'
     WHERE id_operacion = $1`,
    [idOp3]
  );

  await client.query(
    `UPDATE operacion_equipo
     SET estado_asignacion = 'LIBERADO'
     WHERE id_operacion = $1`,
    [idOp3]
  );

  await client.query(
    `UPDATE chat_operacion
     SET activo = FALSE, fecha_cierre = NOW()
     WHERE id_operacion = $1`,
    [idOp3]
  );

  await client.query(
    `UPDATE operacion SET estado = 'CERRADA' WHERE id_operacion = $1`,
    [idOp3]
  );

  return {
    codigo: OP3_CODIGO,
    estado: "CERRADA",
    idOp: idOp3,
    personalAsignado: personalAsignado3.length,
  };
}

