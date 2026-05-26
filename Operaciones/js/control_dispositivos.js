(() => {
  "use strict";

  function clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("rol");
    localStorage.removeItem("userData");
    localStorage.removeItem("username");
    localStorage.removeItem("session");
    localStorage.removeItem("nombre");
    localStorage.removeItem("active_operation_id");
  }

  function redirectToLogin(message = "") {
    clearSession();
    if (message) alert(message);
    window.location.href = "login.html";
  }

  const API_BASE =
    localStorage.getItem("API_BASE") ||
    `http://${window.location.hostname}:3001`;

  async function api(path, { method = "GET", body } = {}) {
    const liveToken = localStorage.getItem("token");

    if (!liveToken) {
      redirectToLogin("Tu sesión expiró. Inicia sesión nuevamente.");
      throw new Error("Sesión no disponible.");
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          "Authorization": `Bearer ${liveToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("No se pudo conectar con el servidor.");
    }

    const data = await res.json().catch(() => null);

    if (res.status === 401 || res.status === 403) {
      redirectToLogin("Tu sesión expiró o ya no es válida.");
      throw new Error("Sesión expirada.");
    }

    if (!res.ok) {
      throw new Error(data?.mensaje || `Error ${res.status} en ${path}`);
    }

    return data;
  }

  const TIPOS = ["TELEFONO", "TABLET", "SMART_WATCH"];
  const ESTADOS = ["DISPONIBLE", "ASIGNADO", "MANTENIMIENTO", "BAJA"];

  function normalize(value) {
    return (value ?? "").toString().trim().toLowerCase();
  }

  function escapeHtml(text) {
    return (text ?? "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTipo(tipo) {
    const labels = {
      TELEFONO: "Teléfono",
      TABLET: "Tablet",
      SMART_WATCH: "Smart watch",
    };
    return labels[tipo] || tipo || "-";
  }

  const btnBack = document.getElementById("btnBack");
  const btnLogout = document.getElementById("btnLogout");
  const btnAdd = document.getElementById("btnAdd");
  const btnEdit = document.getElementById("btnEdit");
  const btnDelete = document.getElementById("btnDelete");

  const searchInput = document.getElementById("searchInput");
  const btnSearch = document.getElementById("btnSearch");
  const btnClear = document.getElementById("btnClear");
  const filterTipo = document.getElementById("filterTipo");
  const filterEstado = document.getElementById("filterEstado");
  const resultHint = document.getElementById("resultHint");
  const tbody = document.getElementById("tbody");

  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnCancel = document.getElementById("btnCancel");
  const btnDeleteModal = document.getElementById("btnDeleteModal");
  const form = document.getElementById("form");

  const fTipo = document.getElementById("fTipo");
  const phoneField = document.getElementById("phoneField");
  const fMarca = document.getElementById("fMarca");
  const fModelo = document.getElementById("fModelo");
  const fNumeroTelefono = document.getElementById("fNumeroTelefono");
  const fImei = document.getElementById("fImei");
  const fNumeroSerie = document.getElementById("fNumeroSerie");
  const fSistemaOperativo = document.getElementById("fSistemaOperativo");
  const fDetalles = document.getElementById("fDetalles");

  const requiredEls = {
    tbody,
    resultHint,
    modal,
    modalTitle,
    form,
    fTipo,
    fMarca,
    fModelo,
  };

  for (const [name, el] of Object.entries(requiredEls)) {
    if (!el) {
      alert(`Falta el elemento del DOM: ${name}`);
      return;
    }
  }

  let dispositivos = [];
  let selectedId = null;
  let mode = "add";

  function syncPhoneField() {
    const needsPhone = (fTipo?.value || "").toUpperCase() === "TELEFONO";
    if (phoneField) phoneField.hidden = !needsPhone;
    if (fNumeroTelefono) {
      fNumeroTelefono.disabled = !needsPhone;
      fNumeroTelefono.required = needsPhone;
      if (!needsPhone) fNumeroTelefono.value = "";
    }
  }

  btnBack?.addEventListener("click", () => window.location.href = "menu_inicial.html");

  btnLogout?.addEventListener("click", () => {
    clearSession();
    window.location.href = "login.html";
  });

  async function loadFromApi() {
    const r = await api("/catalog/dispositivos");
    dispositivos = (r.items || []).map(d => ({
      id_dispositivo: d.id_dispositivo,
      tipo: d.tipo ?? "",
      marca: d.marca ?? "",
      modelo: d.modelo ?? "",
      numero_telefono: d.numero_telefono ?? "",
      imei: d.imei ?? "",
      numero_serie: d.numero_serie ?? "",
      sistema_operativo: d.sistema_operativo ?? "",
      estado: d.estado ?? "DISPONIBLE",
      responsable: d.responsable ?? "",
      detalles: d.detalles ?? "",
      fecha_registro: d.fecha_registro ?? "",
    }));
  }

  function getFiltered() {
    const q = normalize(searchInput?.value);
    const tipo = filterTipo?.value || "";
    const estado = filterEstado?.value || "";

    return dispositivos.filter(d => {
      if (tipo && d.tipo !== tipo) return false;
      if (estado && d.estado !== estado) return false;
      if (!q) return true;

      return (
        normalize(d.tipo).includes(q) ||
        normalize(d.marca).includes(q) ||
        normalize(d.modelo).includes(q) ||
        normalize(d.numero_telefono).includes(q) ||
        normalize(d.imei).includes(q) ||
        normalize(d.numero_serie).includes(q) ||
        normalize(d.sistema_operativo).includes(q) ||
        normalize(d.estado).includes(q) ||
        normalize(d.responsable).includes(q) ||
        normalize(d.detalles).includes(q)
      );
    });
  }

  function updateButtons() {
    const hasSelection = !!selectedId;
    if (btnEdit) btnEdit.disabled = !hasSelection;
    if (btnDelete) btnDelete.disabled = !hasSelection;
  }

  function renderTable() {
    const list = getFiltered();

    if (selectedId && !dispositivos.some(d => d.id_dispositivo === selectedId)) {
      selectedId = null;
    }

    tbody.innerHTML = "";

    if (!list.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9" style="color: rgba(11,18,32,.65); padding: 16px;">
        No hay registros con los filtros actuales.
      </td>`;
      tbody.appendChild(tr);
    } else {
      list.forEach(d => {
        const tr = document.createElement("tr");
        if (d.id_dispositivo === selectedId) tr.classList.add("selected");

        tr.innerHTML = `
          <td>${escapeHtml(formatTipo(d.tipo))}</td>
          <td>${escapeHtml(d.marca || "-")}</td>
          <td>${escapeHtml(d.modelo || "-")}</td>
          <td>${escapeHtml(d.numero_telefono || "-")}</td>
          <td>${escapeHtml(d.imei || "-")}</td>
          <td>${escapeHtml(d.numero_serie || "-")}</td>
          <td>${escapeHtml(d.estado || "DISPONIBLE")}</td>
          <td>${escapeHtml(d.responsable || "-")}</td>
          <td>${escapeHtml(d.fecha_registro || "-")}</td>
        `;

        tr.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedId = selectedId === d.id_dispositivo ? null : d.id_dispositivo;
          updateButtons();
          renderTable();
        });

        tr.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          selectedId = d.id_dispositivo;
          updateButtons();
          renderTable();
          openModal("edit");
        });

        tbody.appendChild(tr);
      });
    }

    updateButtons();
    resultHint.textContent = `${list.length} resultado(s)`;
  }

  function openModal(newMode) {
    mode = newMode;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (btnDeleteModal) btnDeleteModal.style.display = mode === "edit" ? "inline-flex" : "none";

    if (mode === "add") {
      modalTitle.textContent = "Agregar dispositivo";
      form.reset();
      syncPhoneField();
      return;
    }

    modalTitle.textContent = "Modificar dispositivo";
    const d = dispositivos.find(x => x.id_dispositivo === selectedId);
    if (!d) return;

    fTipo.value = d.tipo ?? "";
    fMarca.value = d.marca ?? "";
    fModelo.value = d.modelo ?? "";
    fNumeroTelefono.value = d.numero_telefono ?? "";
    fImei.value = d.imei ?? "";
    fNumeroSerie.value = d.numero_serie ?? "";
    fSistemaOperativo.value = d.sistema_operativo ?? "";
    fDetalles.value = d.detalles ?? "";
    syncPhoneField();
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  btnCloseModal?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", closeModal);
  btnDeleteModal?.addEventListener("click", () => btnDelete?.click());

  modal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal();
  });

  btnAdd?.addEventListener("click", () => openModal("add"));

  btnEdit?.addEventListener("click", () => {
    if (!selectedId) {
      alert("Selecciona un dispositivo.");
      return;
    }
    openModal("edit");
  });

  btnDelete?.addEventListener("click", async () => {
    if (!selectedId) return;

    try {
      await api(`/catalog/dispositivos/${selectedId}`, { method: "DELETE" });
      await loadFromApi();
      selectedId = null;
      renderTable();
      closeModal();
    } catch (err) {
      alert(err.message);
    }
  });

  btnSearch?.addEventListener("click", renderTable);

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      renderTable();
    }
  });

  btnClear?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (filterTipo) filterTipo.value = "";
    if (filterEstado) filterEstado.value = "";
    selectedId = null;
    renderTable();
  });

  filterTipo?.addEventListener("change", renderTable);
  filterEstado?.addEventListener("change", renderTable);

  fTipo?.addEventListener("change", syncPhoneField);

  fNumeroTelefono?.addEventListener("input", () => {
    fNumeroTelefono.value = fNumeroTelefono.value.replace(/\D/g, "").slice(0, 10);
  });

  document.addEventListener("click", (e) => {
    if (selectedId && !e.target.closest("table") && !e.target.closest("#modal") && !e.target.closest("button")) {
      selectedId = null;
      updateButtons();
      renderTable();
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const body = {
      tipo: fTipo.value.trim().toUpperCase(),
      marca: fMarca.value.trim(),
      modelo: fModelo.value.trim(),
      numero_telefono: fTipo.value.trim().toUpperCase() === "TELEFONO" ? (fNumeroTelefono?.value?.trim() || null) : null,
      imei: fImei?.value?.trim() || null,
      numero_serie: fNumeroSerie?.value?.trim() || null,
      sistema_operativo: fSistemaOperativo?.value?.trim() || null,
      estado: "DISPONIBLE",
      detalles: fDetalles?.value?.trim() || null,
    };

    if (!body.tipo || !body.marca || !body.modelo) {
      alert("Completa tipo, marca y modelo.");
      return;
    }

    if (!TIPOS.includes(body.tipo)) {
      alert("Tipo inválido.");
      return;
    }

    if (body.tipo === "TELEFONO" && !body.numero_telefono) {
      alert("Captura el número de teléfono.");
      return;
    }

    try {
      if (mode === "add") {
        await api("/catalog/dispositivos", { method: "POST", body });
      } else {
        await api(`/catalog/dispositivos/${selectedId}`, { method: "PUT", body });
      }

      closeModal();
      await loadFromApi();
      renderTable();
    } catch (err) {
      alert(err.message);
    }
  });

  (async function init() {
    try {
      await loadFromApi();
      renderTable();
    } catch (err) {
      alert(`No se pudo cargar dispositivos: ${err.message}\nRevisa API_BASE, token y endpoints.`);
    }
  })();
})();
