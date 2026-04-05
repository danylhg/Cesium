import { getAdminId, getPersonalByUsername, getPersonalIdStrict } from "../helpers/personal.js";
import { getVehiculoByCodigo, getEquipoBySerie, getGrupoId } from "../helpers/lookup.js";
import { ensureChatParticipantUsuario, ensureChatParticipantPersonal } from "../helpers/chat.js";

export async function seedOperation2(client) {
  const creadoPor = await getAdminId(client);

  // =========================================================
  // OP-NORTE-002 — PLANIFICADA
  // mlopez se repite (ya está en OP-PRUEBA-001 ACTIVA)
  // El resto del personal es completamente distinto
  // Fechas: 2025-07-01 → 2025-09-30 (sin solapamiento + buffer 12h)
  // =========================================================
  const OP2_CODIGO = "OP-NORTE-002";

  const personalOp2Usernames = [
    "atorres",
    "mlopez",
    "rvega",
    "drios",
    "fsilva",
    "anavarro",
    "pmendoza",
    "hcastillo",
    "eruiz",
  ];

  const cutOp2 = await getPersonalIdStrict(client, "atorres");

  await client.query(
    `
    INSERT INTO operacion
      (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
    VALUES
      ($1,$2,$3,'ALTA','PLANIFICADA','2025-07-01 08:00:00-06','2025-09-30 23:59:59-06',$4,$5)
    ON CONFLICT (codigo) DO UPDATE
      SET nombre       = EXCLUDED.nombre,
          descripcion  = EXCLUDED.descripcion,
          prioridad    = EXCLUDED.prioridad,
          estado       = EXCLUDED.estado,
          fecha_inicio = EXCLUDED.fecha_inicio,
          fecha_fin    = EXCLUDED.fecha_fin,
          creada_por   = EXCLUDED.creada_por,
          id_cut       = EXCLUDED.id_cut
    `,
    [
      OP2_CODIGO,
      "Operacion Norte 002",
      "Segunda operacion de prueba. CUT: atorres. mlopez (CET repetido de OP-001) lidera Aguila 1. rvega (CET nuevo) lidera Aguila 2. Celulas completamente distintas a OP-001.",
      creadoPor,
      cutOp2,
    ]
  );

  const op2Row = await client.query(
    `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
    [OP2_CODIGO]
  );
  const idOp2 = op2Row.rows[0].id_operacion;

  const personalAsignado2 = [];

  for (const username of personalOp2Usernames) {
    const persona = await getPersonalByUsername(client, username);
    if (!persona) {
      console.warn(`WARN OP2: personal "${username}" no encontrado, se omite`);
      continue;
    }

    personalAsignado2.push(persona);

    await client.query(
      `
      INSERT INTO asignacion_operacion_personal
        (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,'ASIGNADO',$4)
      ON CONFLICT (id_operacion, id_personal) DO UPDATE
        SET rol_en_operacion  = EXCLUDED.rol_en_operacion,
            estado_asignacion = EXCLUDED.estado_asignacion,
            asignado_por      = EXCLUDED.asignado_por,
            fecha_asignacion  = NOW()
      `,
      [idOp2, persona.id_personal, persona.rol, creadoPor]
    );
  }

  const cet2a = personalAsignado2.find((p) => p.username === "mlopez");
  const cet2b = personalAsignado2.find((p) => p.username === "rvega");
  const cells2_1 = personalAsignado2.filter((p) => ["drios", "fsilva", "anavarro"].includes(p.username));
  const cells2_2 = personalAsignado2.filter((p) => ["pmendoza", "hcastillo", "eruiz"].includes(p.username));

  if (!cet2a) throw new Error(`No se encontró mlopez para OP-NORTE-002.`);
  if (!cet2b) throw new Error(`No se encontró rvega para OP-NORTE-002.`);

  for (const cell of cells2_1) {
    await client.query(
      `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
      [idOp2, cet2a.id_personal, cell.id_personal, creadoPor]
    );
  }

  for (const cell of cells2_2) {
    await client.query(
      `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
      [idOp2, cet2b.id_personal, cell.id_personal, creadoPor]
    );
  }

  await client.query(
    `
    INSERT INTO grupo_operacion
      (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
    VALUES
      ($1,'Grupo NORTE','NORTE',NULL,'Grupo principal — Operacion Norte 002',$2)
    ON CONFLICT (id_operacion, nombre) DO NOTHING
    `,
    [idOp2, creadoPor]
  );

  const idPadre2 = await getGrupoId(client, idOp2, "Grupo NORTE");
  if (!idPadre2) throw new Error(`No se pudo obtener el grupo padre de OP-NORTE-002.`);

  for (const nombre of ["Aguila 1", "Aguila 2"]) {
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES ($1,$2,NULL,$3,$4,$5)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp2, nombre, idPadre2, `Subgrupo ${nombre}`, creadoPor]
    );
  }

  const idAguila1_OP2 = await getGrupoId(client, idOp2, "Aguila 1");
  const idAguila2_OP2 = await getGrupoId(client, idOp2, "Aguila 2");

  if (!idAguila1_OP2 || !idAguila2_OP2) {
    throw new Error(`No se pudieron obtener los subgrupos de OP-NORTE-002.`);
  }

  for (const username of ["drios", "fsilva", "anavarro"]) {
    const persona = personalAsignado2.find((p) => p.username === username);
    if (!persona) continue;
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CELL',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idAguila1_OP2, persona.id_personal, creadoPor]
    );
  }

  // CET Lopez leads Aguila 1
  await client.query(
    `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
     VALUES ($1,$2,'CET',$3)
     ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
    [idAguila1_OP2, cet2a.id_personal, creadoPor]
  );

  for (const username of ["pmendoza", "hcastillo", "eruiz"]) {
    const persona = personalAsignado2.find((p) => p.username === username);
    if (!persona) continue;
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CELL',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idAguila2_OP2, persona.id_personal, creadoPor]
    );
  }

  // CET Vega leads Aguila 2
  await client.query(
    `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
     VALUES ($1,$2,'CET',$3)
     ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
    [idAguila2_OP2, cet2b.id_personal, creadoPor]
  );

  // =========================================================
  // RECURSOS OP-NORTE-002
  // =========================================================
  const vhNorte1 = await getVehiculoByCodigo(client, "VH-004");
  const vhNorte2 = await getVehiculoByCodigo(client, "VH-005");
  const eqComNorte = await getEquipoBySerie(client, "HFC-001");
  const eqTacNorte = await getEquipoBySerie(client, "DRN-001");

  for (const v of [vhNorte1, vhNorte2]) {
    await client.query(
      `INSERT INTO vehiculo_operacion (id_operacion, id_vehiculo, uso_en_operacion, estado_asignacion, asignado_por)
       VALUES ($1,$2,$3,'ASIGNADO',$4)
       ON CONFLICT (id_operacion, id_vehiculo) DO UPDATE SET estado_asignacion = 'ASIGNADO'`,
      [idOp2, v.id_vehiculo, "Vehiculo para Operacion Norte", creadoPor]
    );
  }

  for (const e of [eqComNorte, eqTacNorte]) {
    await client.query(
      `INSERT INTO operacion_equipo (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
       VALUES ($1,$2,1,$3,'ASIGNADO',$4)
       ON CONFLICT (id_operacion, id_equipo) DO UPDATE SET estado_asignacion = 'ASIGNADO'`,
      [idOp2, e.id_equipo, "Equipo para Operacion Norte", creadoPor]
    );
  }

  await client.query(
    `INSERT INTO grupo_vehiculo (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
     VALUES ($1,$2,$3,'Transporte Panther Aguila 1','ASIGNADO',$4)
     ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING`,
    [idAguila1_OP2, idOp2, vhNorte1.id_vehiculo, creadoPor]
  );

  await client.query(
    `INSERT INTO grupo_vehiculo (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
     VALUES ($1,$2,$3,'Interceptor Scualo Aguila 2','ASIGNADO',$4)
     ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING`,
    [idAguila2_OP2, idOp2, vhNorte2.id_vehiculo, creadoPor]
  );

  await client.query(
    `INSERT INTO grupo_equipo (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
     VALUES ($1,$2,$3,1,'Radio Aguila 1','ASIGNADO',$4)
     ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING`,
    [idAguila1_OP2, idOp2, eqComNorte.id_equipo, creadoPor]
  );

  await client.query(
    `INSERT INTO grupo_equipo (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
     VALUES ($1,$2,$3,1,'Dron Aguila 2','ASIGNADO',$4)
     ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING`,
    [idAguila2_OP2, idOp2, eqTacNorte.id_equipo, creadoPor]
  );

  // =========================================================
  // CHAT OP-NORTE-002
  // =========================================================
  const chat2Res = await client.query(
    `INSERT INTO chat_operacion (id_operacion, activo)
     VALUES ($1, FALSE)
     ON CONFLICT (id_operacion) DO UPDATE SET activo = FALSE
     RETURNING id_chat`,
    [idOp2]
  );

  let idChat2 = chat2Res.rows?.[0]?.id_chat;
  if (!idChat2) {
    const chat2Lookup = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
      [idOp2]
    );
    if (chat2Lookup.rowCount === 0) throw new Error(`No se pudo crear el chat de OP-NORTE-002.`);
    idChat2 = chat2Lookup.rows[0].id_chat;
  }

  const idParticipanteAdmin2 = await ensureChatParticipantUsuario(client, idChat2, creadoPor);

  for (const persona of personalAsignado2) {
    await ensureChatParticipantPersonal(client, idChat2, persona.id_personal);
  }

  const msgCount2 = await client.query(
    `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
    [idChat2]
  );

  if ((msgCount2.rows[0]?.total ?? 0) === 0 && idParticipanteAdmin2) {
    await client.query(
      `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
       VALUES ($1,$2,$3,'SISTEMA')`,
      [idChat2, idParticipanteAdmin2, "Chat de OP-NORTE-002 inicializado. Operacion en fase de planeacion."]
    );
  }

  // =========================================================
  // ZONA OP-NORTE-002 — Puerto Veracruz
  // =========================================================
  const zonaGeometria2 = {
    type: "Polygon",
    coordinates: [[
      [-96.9600, 19.5600],
      [-96.8900, 19.5600],
      [-96.8900, 19.5100],
      [-96.9600, 19.5100],
      [-96.9600, 19.5600],
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
      idOp2,
      "Zona Puerto Veracruz",
      JSON.stringify(zonaGeometria2),
      19.5390,
      -96.9270,
      1500,
      "#f97316",
      creadoPor,
    ]
  );

  return {
    codigo: OP2_CODIGO,
    estado: "PLANIFICADA",
    idOp: idOp2,
    personalAsignado: personalAsignado2.length,
  };
}
