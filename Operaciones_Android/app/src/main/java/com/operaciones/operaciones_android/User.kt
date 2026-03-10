package com.operaciones.operaciones_android

// ── Roles del sistema (RF-01) ────────────────────────────────────────────────
// CET y CELULA → app móvil   |   ADMIN y CUT → plataforma web (bloqueados aquí)
enum class UserRole(val display: String) {
    CET("Comandante de Equipo de Trabajo"),
    CELULA("Célula Operativa"),
    ADMIN("Administrador"),       // bloqueado en móvil
    CUT("Comandante de Unidad")   // bloqueado en móvil
}

// ── Estados del ciclo de vida de una operación ───────────────────────────────
enum class OperationStatus {
    INACTIVA,       // aún no inicia → pantalla de espera
    EN_REALIZACION, // en curso       → pantalla operativa (mapa + chat)
    REALIZADA       // concluida      → solo lectura / análisis
}

// ── Usuario autenticado ──────────────────────────────────────────────────────
data class User(
    val id: Int,
    val nombre: String,
    val apellido: String,
    val numeroControl: String, // credencial de login
    val password: String,      // en prototipo en texto plano
    val rol: UserRole,
    val jerarquia: String
) {
    val nombreCompleto get() = "$nombre $apellido"
    val puedeAsignarEstructuras get() = rol == UserRole.CET
}

// ── Operación táctica ────────────────────────────────────────────────────────
data class Operation(
    val id: Int,
    val nombre: String,
    val descripcion: String,
    val zona: String,
    val fechaInicio: String,   // formato "DD/MM/YYYY HH:mm"
    val fechaFin: String,
    val prioridad: String,     // "Alta" / "Media" / "Baja"
    val mensajePrincipal: String,
    val status: OperationStatus,
    val asignadoA: List<Int>   // IDs de usuarios asignados
)