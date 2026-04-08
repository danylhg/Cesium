import { getAdminId, getPersonalByUsername, getPersonalIdStrict } from "../helpers/personal.js";
import { getVehiculoByCodigo, getEquipoBySerie, getGrupoId } from "../helpers/lookup.js";
import { ensureChatParticipantUsuario, ensureChatParticipantPersonal } from "../helpers/chat.js";

export async function seedOperation1(client) {
  const creadoPor = await getAdminId(client);

  const OP_CODIGO = "OP-PRUEBA-001";
  const personalOpUsernames = [
    "cramirez",
    "mlopez",
    "mcruz",
    "jmartinez",
    "psanchez",
    "lgomez",
    "jflores",
    "smorales",
  ];

  // =========================================================
  // 3) OPERACION DE PRUEBA
  // =========================================================
  const cutOp1 = await getPersonalIdStrict(client, "cramirez");

  await client.query(
    `
    INSERT INTO operacion
      (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
    VALUES
      ($1,$2,$3,'MEDIA','ACTIVA','2025-02-09 08:00:00-06','2025-06-09 23:59:59-06',$4,$5)
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
      OP_CODIGO,
      "Operacion de Prueba SEDAM",
      "Operacion de validacion del sistema. CUT: cramirez. CET: mlopez. Dos subgrupos de 3 celulas. Vehiculos y equipos fijos del inventario: VH-001, VH-003, HFC-001 y DRN-001.",
      creadoPor,
      cutOp1,
    ]
  );

  const opRow = await client.query(
    `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
    [OP_CODIGO]
  );
  const idOp = opRow.rows[0].id_operacion;

  // =========================================================
  // 4) PERSONAL -> OPERACION
  // =========================================================
  const personalAsignado = [];

  for (const username of personalOpUsernames) {
    const persona = await getPersonalByUsername(client, username);
    if (!persona) {
      console.warn(`WARN: personal "${username}" no encontrado, se omite`);
      continue;
    }

    personalAsignado.push(persona);

    await client.query(
      `
      INSERT INTO asignacion_operacion_personal
        (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,'ASIGNADO',$4)
      ON CONFLICT (id_operacion, id_personal) DO UPDATE
        SET rol_en_operacion = EXCLUDED.rol_en_operacion,
            estado_asignacion = EXCLUDED.estado_asignacion,
            asignado_por = EXCLUDED.asignado_por,
            fecha_asignacion = NOW()
      `,
      [idOp, persona.id_personal, persona.rol, creadoPor]
    );
  }

  const cet = personalAsignado.find((p) => p.username === "mlopez");
  const cells = personalAsignado.filter((p) => p.rol === "CELL");

  if (!cet) {
    throw new Error(`No se encontró el CET "mlopez" para la operación de prueba.`);
  }

  // =========================================================
  // 5) MANDO: CET -> CELL
  // =========================================================
  for (const cell of cells) {
    await client.query(
      `
      INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (id_operacion, id_cell) DO NOTHING
      `,
      [idOp, cet.id_personal, cell.id_personal, creadoPor]
    );
  }

  // =========================================================
  // 6) GRUPO PADRE
  // =========================================================
  await client.query(
    `
    INSERT INTO grupo_operacion
      (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
    VALUES
      ($1,'Grupo MLOPEZ','MLOPEZ',NULL,'Grupo principal bajo mando CET mlopez',$2)
    ON CONFLICT (id_operacion, nombre) DO NOTHING
    `,
    [idOp, creadoPor]
  );

  const idPadre = await getGrupoId(client, idOp, "Grupo MLOPEZ");
  if (!idPadre) throw new Error(`No se pudo obtener el grupo padre de la operación.`);

  // CET dentro del grupo padre
  await client.query(
    `
    INSERT INTO grupo_personal
      (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
    VALUES ($1,$2,'CET',$3)
    ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
    `,
    [idPadre, cet.id_personal, creadoPor]
  );

  // =========================================================
  // FLOTILLA (nivel intermedio entre grupo padre y subgrupos)
  // =========================================================
  await client.query(
    `
    INSERT INTO grupo_operacion
      (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
    VALUES
      ($1,'Flotilla Alfa','ALFA',$2,'Flotilla principal del CET',$3)
    ON CONFLICT (id_operacion, nombre) DO NOTHING
    `,
    [idOp, idPadre, creadoPor]
  );

  const idFlotilla = await getGrupoId(client, idOp, "Flotilla Alfa");
  if (!idFlotilla) throw new Error(`No se pudo obtener la Flotilla Alfa de OP1.`);

  // =========================================================
  // 7) SUBGRUPOS
  // =========================================================
  for (const nombre of ["Aguila 1", "Aguila 2"]) {
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES
        ($1,$2,NULL,$3,$4,$5)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp, nombre, idFlotilla, `Subgrupo ${nombre}`, creadoPor]
    );
  }

  const idAguila1 = await getGrupoId(client, idOp, "Aguila 1");
  const idAguila2 = await getGrupoId(client, idOp, "Aguila 2");

  if (!idAguila1 || !idAguila2) {
    throw new Error(`No se pudieron obtener los subgrupos de la operación.`);
  }

  // =========================================================
  // 8) CELULAS -> SUBGRUPOS (3 y 3)
  // =========================================================
  const subgrupo1Usernames = ["mcruz", "jmartinez", "psanchez"];
  const subgrupo2Usernames = ["lgomez", "jflores", "smorales"];

  for (const username of subgrupo1Usernames) {
    const persona = await getPersonalByUsername(client, username);
    if (!persona) continue;

    await client.query(
      `
      INSERT INTO grupo_personal
        (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
      VALUES ($1,$2,'CELL',$3)
      ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
      `,
      [idAguila1, persona.id_personal, creadoPor]
    );
  }

  for (const username of subgrupo2Usernames) {
    const persona = await getPersonalByUsername(client, username);
    if (!persona) continue;

    await client.query(
      `
      INSERT INTO grupo_personal
        (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
      VALUES ($1,$2,'CELL',$3)
      ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
      `,
      [idAguila2, persona.id_personal, creadoPor]
    );
  }

  // =========================================================
  // 9) CHAT OPERACION
  // =========================================================
  const chatRes = await client.query(
    `
    INSERT INTO chat_operacion (id_operacion, activo)
    VALUES ($1, TRUE)
    ON CONFLICT (id_operacion) DO UPDATE
      SET activo = TRUE,
          fecha_cierre = NULL
    RETURNING id_chat
    `,
    [idOp]
  );

  let idChat = chatRes.rows?.[0]?.id_chat;

  if (!idChat) {
    const chatLookup = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
      [idOp]
    );
    if (chatLookup.rowCount === 0) {
      throw new Error(`No se pudo crear ni recuperar el chat de la operación.`);
    }
    idChat = chatLookup.rows[0].id_chat;
  }

  const idParticipanteAdmin = await ensureChatParticipantUsuario(client, idChat, creadoPor);

  for (const persona of personalAsignado) {
    await ensureChatParticipantPersonal(client, idChat, persona.id_personal);
  }

  const msgCount = await client.query(
    `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
    [idChat]
  );

  if ((msgCount.rows[0]?.total ?? 0) === 0 && idParticipanteAdmin) {
    await client.query(
      `
      INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
      VALUES ($1,$2,$3,'SISTEMA')
      `,
      [idChat, idParticipanteAdmin, "OPERACIÓN INICIADA 9 DE FEBRERO DEL 2025."]
    );
  }

  // =========================================================
  // 10) RECURSOS FIJOS CON RESPONSABLE HUMANO (CORREGIDO)
  // =========================================================
  const vehiculoAguila1 = await getVehiculoByCodigo(client, "VH-001");
  const vehiculoAguila2 = await getVehiculoByCodigo(client, "VH-003");

  const equipoComunicacion = await getEquipoBySerie(client, "HFC-001");
  const equipoTactico = await getEquipoBySerie(client, "DRN-001");

  const operadorTactico = await getPersonalByUsername(client, "mcruz");
  if (!operadorTactico) {
    throw new Error(`No se encontró el personal "mcruz" para asignarle el equipo táctico.`);
  }

  // Definimos quién es el responsable de cada vehículo en su subgrupo
  // Debe ser alguien que hayamos metido al grupo en el paso 8
  const respH1 = await getPersonalByUsername(client, "mcruz");     // Miembro de Aguila 1
  const respH2 = await getPersonalByUsername(client, "lgomez");    // Miembro de Aguila 2

  // --- ASIGNACIÓN VEHÍCULO 1 ---
  // Primero en la tabla maestra de la operación
  await client.query(
    `INSERT INTO vehiculo_operacion
      (id_operacion, id_vehiculo, id_personal, id_grupo_operacion, nivel_asignacion, estado_asignacion, asignado_por)
    VALUES ($1,$2,$3,$4,'GRUPO','ASIGNADO',$5)
    ON CONFLICT (id_operacion, id_vehiculo, id_personal) DO NOTHING`,
    [idOp, vehiculoAguila1.id_vehiculo, respH1.id_personal, idAguila1, creadoPor]
  );

  // Luego en el grupo (Aquí es donde fallaba por la FK)
  await client.query(
    `INSERT INTO grupo_vehiculo
      (id_grupo_operacion, id_operacion, id_vehiculo, id_personal, asignado_por)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT DO NOTHING`,
    [idAguila1, idOp, vehiculoAguila1.id_vehiculo, respH1.id_personal, creadoPor]
  );

  // --- ASIGNACIÓN VEHÍCULO 2 ---
  await client.query(
    `INSERT INTO vehiculo_operacion
      (id_operacion, id_vehiculo, id_personal, id_grupo_operacion, nivel_asignacion, estado_asignacion, asignado_por)
    VALUES ($1,$2,$3,$4,'GRUPO','ASIGNADO',$5)
    ON CONFLICT (id_operacion, id_vehiculo, id_personal) DO NOTHING`,
    [idOp, vehiculoAguila2.id_vehiculo, respH2.id_personal, idAguila2, creadoPor]
  );

  await client.query(
    `INSERT INTO grupo_vehiculo
      (id_grupo_operacion, id_operacion, id_vehiculo, id_personal, asignado_por)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT DO NOTHING`,
    [idAguila2, idOp, vehiculoAguila2.id_vehiculo, respH2.id_personal, creadoPor]
  );

  await client.query(
    `
    INSERT INTO operacion_equipo
      (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
    VALUES ($1,$2,1,$3,'ASIGNADO',$4)
    ON CONFLICT (id_operacion, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          uso_en_operacion = EXCLUDED.uso_en_operacion,
          estado_asignacion = EXCLUDED.estado_asignacion,
          asignado_por = EXCLUDED.asignado_por,
          fecha_asignacion = NOW()
    `,
    [idOp, equipoComunicacion.id_equipo, "DESTINO:VEHICULO:VH-001", creadoPor]
  );

  await client.query(
    `
    INSERT INTO operacion_equipo
      (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
    VALUES ($1,$2,1,$3,'ASIGNADO',$4)
    ON CONFLICT (id_operacion, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          uso_en_operacion = EXCLUDED.uso_en_operacion,
          estado_asignacion = EXCLUDED.estado_asignacion,
          asignado_por = EXCLUDED.asignado_por,
          fecha_asignacion = NOW()
    `,
    [idOp, equipoTactico.id_equipo, "DESTINO:PERSONAL:MCRUZ", creadoPor]
  );

  await client.query(
    `
    INSERT INTO vehiculo_equipo
      (id_vehiculo, id_equipo, cantidad, estado)
    VALUES ($1,$2,1,'INSTALADO')
    ON CONFLICT (id_vehiculo, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          estado = EXCLUDED.estado,
          fecha_retiro = NULL
    `,
    [vehiculoAguila1.id_vehiculo, equipoComunicacion.id_equipo]
  );

  await client.query(
    `
    INSERT INTO grupo_equipo
      (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
    VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
    ON CONFLICT (id_grupo_operacion, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          uso_en_grupo = EXCLUDED.uso_en_grupo,
          estado_asignacion = EXCLUDED.estado_asignacion,
          asignado_por = EXCLUDED.asignado_por,
          fecha_asignacion = NOW(),
          fecha_fin_asignacion = NULL
    `,
    [idAguila1, idOp, equipoComunicacion.id_equipo, "Radio instalada en vehículo de Aguila 1", creadoPor]
  );

  await client.query(
    `
    INSERT INTO personal_equipo
      (id_personal, id_equipo, cantidad, estado, asignado_por)
    VALUES ($1,$2,1,'ASIGNADO',$3)
    ON CONFLICT (id_personal, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          estado = EXCLUDED.estado,
          asignado_por = EXCLUDED.asignado_por,
          fecha_asignacion = NOW(),
          fecha_devolucion = NULL
    `,
    [operadorTactico.id_personal, equipoTactico.id_equipo, creadoPor]
  );

  await client.query(
    `
    INSERT INTO uso_equipo_operacion
      (id_operacion, id_equipo, id_personal, cantidad, asignado_por, notas)
    VALUES ($1,$2,$3,1,$4,$5)
    ON CONFLICT (id_operacion, id_equipo, id_personal, id_grupo_operacion) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          asignado_por = EXCLUDED.asignado_por,
          notas = EXCLUDED.notas,
          fecha_asignacion = NOW(),
          fecha_devolucion = NULL
    `,
    [idOp, equipoTactico.id_equipo, operadorTactico.id_personal, creadoPor, "Equipo táctico asignado al operador principal de Aguila 1"]
  );

  await client.query(
    `
    INSERT INTO grupo_equipo
      (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
    VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
    ON CONFLICT (id_grupo_operacion, id_equipo) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          uso_en_grupo = EXCLUDED.uso_en_grupo,
          estado_asignacion = EXCLUDED.estado_asignacion,
          asignado_por = EXCLUDED.asignado_por,
          fecha_asignacion = NOW(),
          fecha_fin_asignacion = NULL
    `,
    [idAguila1, idOp, equipoTactico.id_equipo, "Dron táctico bajo resguardo de mcruz", creadoPor]
  );

  // =========================================================
  // 12) ZONA PRINCIPAL DE LA OPERACION — Anton Lizardo, Veracruz
  // =========================================================
  const zonaGeometria = {
    type: "Polygon",
    coordinates: [[
      [-95.9950, 19.0750],
      [-95.9350, 19.0750],
      [-95.9350, 19.0250],
      [-95.9950, 19.0250],
      [-95.9950, 19.0750],
    ]],
  };

  await client.query(
    `
    INSERT INTO zona_operacion
      (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id_operacion) DO UPDATE
      SET nombre         = EXCLUDED.nombre,
          geometria      = EXCLUDED.geometria,
          centroide_lat  = EXCLUDED.centroide_lat,
          centroide_lon  = EXCLUDED.centroide_lon,
          zoom_inicial   = EXCLUDED.zoom_inicial,
          color          = EXCLUDED.color,
          creado_por     = EXCLUDED.creado_por,
          fecha_creacion = NOW()
    `,
    [
      idOp,
      "Zona Anton Lizardo",
      JSON.stringify(zonaGeometria),
      19.0460,
      -95.9709,
      1000,
      "#3b82f6",
      creadoPor,
    ]
  );

  return {
    codigo: OP_CODIGO,
    estado: "ACTIVA",
    idOp,
    personalAsignado: personalAsignado.length,
    vehiculosFijos: 2,
    equiposFijos: 2,
  };
}
