const data = window.NETWORK_DATA;

const departmentOrder = Object.keys(data.meta.departments);
const relationOrder = ["business", "supply", "culture"];
const relationColors = {
  business: "#39484b",
  supply: "#126d74",
  culture: "#8a4653",
};

const nodes = data.nodes.map((node) => ({ ...node }));
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const edges = data.edges
  .map((edge) => ({
    ...edge,
    sourceNode: nodeById.get(edge.source),
    targetNode: nodeById.get(edge.target),
  }))
  .filter((edge) => edge.sourceNode && edge.targetNode);

const canvas = document.getElementById("networkCanvas");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const dossierContainer = document.getElementById("dossierContainer");
const dossier = document.getElementById("dossier");
const dossierContent = document.getElementById("dossierContent");
const folderTab = document.getElementById("folderTab");

const nodeImages = new Map();
const IMAGE_FOLDER = "./缩放后/";
const imageCacheReady = { count: 0, total: 0 };

function initPanelCollapse() {
  const panels = document.querySelectorAll(".panel");
  const savedStates = JSON.parse(sessionStorage.getItem("panelStates") || "{}");

  panels.forEach((panel) => {
    const panelId = panel.dataset.panel;
    const savedExpanded = savedStates[panelId];
    if (savedExpanded !== undefined) {
      panel.dataset.expanded = savedExpanded ? "true" : "false";
    }
    updatePanelToggle(panel);
  });

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("panel-toggle")) {
      const panel = e.target.closest(".panel");
      const isExpanded = panel.dataset.expanded === "true";
      panel.dataset.expanded = isExpanded ? "false" : "true";
      updatePanelToggle(panel);

      const states = {};
      panels.forEach((p) => {
        states[p.dataset.panel] = p.dataset.expanded === "true";
      });
      sessionStorage.setItem("panelStates", JSON.stringify(states));
    }
  });
}

function updatePanelToggle(panel) {
  const toggle = panel.querySelector(".panel-toggle");
  toggle.textContent = panel.dataset.expanded === "true" ? "[-]" : "[+]";
}

function initPanelDragging() {
  const panels = document.querySelectorAll(".panel");
  const savedPositions = JSON.parse(sessionStorage.getItem("panelPositions") || "{}");

  panels.forEach((panel) => {
    const panelId = panel.dataset.panel;
    const savedPos = savedPositions[panelId];

    if (savedPos) {
      panel.style.left = savedPos.left + "px";
      panel.style.top = savedPos.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }

    const header = panel.querySelector(".panel-header");
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("panel-toggle")) return;
      if (e.button !== 0) return;

      isDragging = true;
      panel.style.zIndex = "100";
      header.style.cursor = "grabbing";

      startX = e.clientX;
      startY = e.clientY;
      startLeft = panel.offsetLeft;
      startTop = panel.offsetTop;

      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      panel.style.left = Math.max(0, startLeft + dx) + "px";
      panel.style.top = Math.max(0, startTop + dy) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;

      isDragging = false;
      panel.style.zIndex = "2";
      header.style.cursor = "grab";

      const positions = JSON.parse(sessionStorage.getItem("panelPositions") || "{}");
      positions[panel.dataset.panel] = {
        left: panel.offsetLeft,
        top: panel.offsetTop,
      };
      sessionStorage.setItem("panelPositions", JSON.stringify(positions));
    });

    header.style.cursor = "grab";
  });
}

function buildImageFilenameIndex() {
  const { nodes } = data;
  const index = new Map();
  nodes.forEach((node) => {
    index.set(node.id, node.name);
  });
  return index;
}

function preloadNodeImages() {
  imageCacheReady.total = nodes.length;
  nodes.forEach((node) => {
    const img = new Image();
    img.onload = () => {
      nodeImages.set(node.id, img);
      imageCacheReady.count++;
    };
    img.onerror = () => { imageCacheReady.count++; };
    // The ID-specific image mapping is independent of jmaCount.
    img.src = `${IMAGE_FOLDER}${encodeURIComponent(node.imageFile || `${node.name}_${node.jmaCount}.png`)}`;
  });
}

const state = {
  selectedDepartments: new Set(departmentOrder),
  selectedRelations: new Set(relationOrder),
  search: "",
  minJma: 0,
  cluster: true,
  hovered: null,
  selected: null,
  draggingNode: null,
  panning: false,
  lastPointer: null,
  width: 0,
  height: 0,
  pixelRatio: 1,
  transform: { x: 0, y: 0, scale: 1 },
  alpha: 1,
};

const countsByDepartment = nodes.reduce((acc, node) => {
  acc[node.department] = (acc[node.department] || 0) + 1;
  return acc;
}, {});

function initializePositions() {
  const centerX = 0;
  const centerY = 0;
  const radius = 360;
  const clusterCenters = getClusterCenters(radius);
  const departmentBuckets = new Map(departmentOrder.map((department) => [department, []]));
  nodes.forEach((node) => departmentBuckets.get(node.department)?.push(node));

  departmentBuckets.forEach((bucket, department) => {
    const center = clusterCenters.get(department);
    bucket.forEach((node, index) => {
      const angle = (index / Math.max(bucket.length, 1)) * Math.PI * 2;
      const localRadius = 50 + Math.sqrt(index) * 18;
      node.x = centerX + center.x + Math.cos(angle) * localRadius;
      node.y = centerY + center.y + Math.sin(angle) * localRadius;
      node.vx = 0;
      node.vy = 0;
      node.radius = Math.max(5.5, Math.min(15, 4.8 + Math.sqrt(node.jmaCount) * 1.3));
    });
  });
}

function getClusterCenters(radius = Math.min(state.width, state.height) * 0.36 || 480) {
  const centers = new Map();
  departmentOrder.forEach((department, index) => {
    const angle = -Math.PI / 2 + (index / departmentOrder.length) * Math.PI * 2;
    centers.set(department, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  return centers;
}

function getVisibleNodes() {
  const query = state.search.trim().toLowerCase();
  return nodes.filter((node) => {
    if (!state.selectedDepartments.has(node.department)) return false;
    if (node.jmaCount < state.minJma) return false;
    if (!query) return true;
    return [node.id, `MSC-${node.number}`, node.name, node.department, node.position, node.secondaryPosition, node.service, node.source, node.traditionalFunction, node.rawRecord?.category, data.meta.recordKinds?.[node.recordKind]]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function getVisibleGraph() {
  const visibleNodes = getVisibleNodes();
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) =>
      state.selectedRelations.has(edge.type) &&
      visibleIds.has(edge.source) &&
      visibleIds.has(edge.target)
  );
  return { visibleNodes, visibleEdges, visibleIds };
}

function resizeCanvas() {
  state.width = Math.max(320, window.innerWidth);
  state.height = Math.max(420, window.innerHeight);
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(state.width * state.pixelRatio);
  canvas.height = Math.floor(state.height * state.pixelRatio);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  if (!state.transform.scale) resetView();
}

function worldToScreen(point) {
  return {
    x: point.x * state.transform.scale + state.transform.x,
    y: point.y * state.transform.scale + state.transform.y,
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.transform.x) / state.transform.scale,
    y: (point.y - state.transform.y) / state.transform.scale,
  };
}

function tick() {
  const { visibleNodes, visibleEdges } = getVisibleGraph();
  const visibleSet = new Set(visibleNodes);
  const clusterCenters = getClusterCenters();

  visibleEdges.forEach((edge) => {
    const a = edge.sourceNode;
    const b = edge.targetNode;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desired = edge.type === "business" ? 280 : edge.type === "supply" ? 360 : 440;
    const force = (distance - desired) * 0.002 * state.alpha;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  });

  for (let i = 0; i < visibleNodes.length; i += 1) {
    const a = visibleNodes[i];
    for (let j = i + 1; j < visibleNodes.length; j += 1) {
      const b = visibleNodes[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const distanceSq = Math.max(100, dx * dx + dy * dy);
      const force = Math.min(0.9, 1200 / distanceSq) * state.alpha;
      const distance = Math.sqrt(distanceSq);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  nodes.forEach((node) => {
    if (!visibleSet.has(node)) return;
    const target = state.cluster ? clusterCenters.get(node.department) : { x: 0, y: 0 };
    const strength = state.cluster ? 0.018 : 0.008;
    node.vx += (target.x - node.x) * strength * state.alpha;
    node.vy += (target.y - node.y) * strength * state.alpha;
    if (node !== state.draggingNode) {
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
    }
  });

  state.alpha = Math.max(0.08, state.alpha * 0.992);
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.save();
  ctx.translate(state.transform.x, state.transform.y);
  ctx.scale(state.transform.scale, state.transform.scale);

  const { visibleNodes, visibleEdges } = getVisibleGraph();
  const highlightedIds = getHighlightedIds();

  drawClusterLabels(visibleNodes);
  drawEdges(visibleEdges, highlightedIds);
  drawNodes(visibleNodes, highlightedIds);

  ctx.restore();
  updateCounts(visibleNodes.length, visibleEdges.length);
}

function drawClusterLabels(visibleNodes) {
  if (!state.cluster || state.transform.scale < 0.46) return;
  ctx.save();
  ctx.font = "300 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const centers = getClusterCenters();
  departmentOrder.forEach((department) => {
    if (!visibleNodes.some((node) => node.department === department)) return;
    const center = centers.get(department);
    ctx.fillStyle = "rgba(31, 37, 40, 0.18)";
    ctx.fillText(department, center.x, center.y - 76);
  });
  ctx.restore();
}

function drawEdges(visibleEdges, highlightedIds) {
  visibleEdges.forEach((edge) => {
    const a = edge.sourceNode;
    const b = edge.targetNode;
    const dim = highlightedIds && !highlightedIds.has(a.id) && !highlightedIds.has(b.id);
    ctx.save();
    ctx.globalAlpha = dim ? 0.09 : 0.5;
    ctx.strokeStyle = relationColors[edge.type] || "#566";
    ctx.lineWidth = 0.4;
    ctx.setLineDash(lineDashForStyle(edge.style || data.meta.relationTypes[edge.type]?.style));
    ctx.lineCap = "round";

    if (a === b) {
      const size = a.radius + 5;
      ctx.beginPath();
      ctx.arc(a.x + size + 5, a.y - size - 5, 15, 0.3, Math.PI * 1.8);
      ctx.stroke();
    } else {
      drawSmoothLine(a, b, edge.type);
    }
    ctx.restore();
  });
}

function lineDashForStyle(style) {
  return style === "dash" ? [7, 4] : style === "dot" ? [1, 4] : [];
}

function drawSmoothLine(a, b, edgeType) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.max(1, Math.hypot(dx, dy));

  const tension = 0.4 + distance * 0.0008;

  const nx = -dy / distance;
  const ny = dx / distance;

  const curveFactor = edgeType === "culture" ? 0.55 : edgeType === "supply" ? -0.35 : 0.2;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const cx1 = midX + nx * distance * curveFactor * tension;
  const cy1 = midY + ny * distance * curveFactor * tension;

  const t1 = 0.28;

  const cp1x = a.x + (cx1 - a.x) * t1 * 2;
  const cp1y = a.y + (cy1 - a.y) * t1 * 2;
  const cp2x = b.x + (cx1 - b.x) * t1 * 2;
  const cp2y = b.y + (cy1 - b.y) * t1 * 2;

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, b.x, b.y);
  ctx.stroke();
  if (edgeType === "supply") {
    // Position the arrow on the visible curve, away from either node image.
    const t = 0.66, u = 1 - t;
    const x = u*u*u*a.x + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*b.x;
    const y = u*u*u*a.y + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*b.y;
    const tx = 3*u*u*(cp1x-a.x) + 6*u*t*(cp2x-cp1x) + 3*t*t*(b.x-cp2x);
    const ty = 3*u*u*(cp1y-a.y) + 6*u*t*(cp2y-cp1y) + 3*t*t*(b.y-cp2y);
    const angle = Math.atan2(ty, tx), size = 7;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x-size*Math.cos(angle-0.45), y-size*Math.sin(angle-0.45));
    ctx.lineTo(x-size*Math.cos(angle+0.45), y-size*Math.sin(angle+0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function shouldShowLabel(node, isHovered, isSelected) {
  if (isHovered || isSelected) return true;
  if (node.radius > 14) return true;
  return false;
}

function drawNodes(visibleNodes, highlightedIds) {
  visibleNodes
    .slice()
    .sort((a, b) => a.radius - b.radius)
    .forEach((node) => {
      const isHovered = state.hovered?.id === node.id;
      const isSelected = state.selected?.id === node.id;
      const dim = highlightedIds && !highlightedIds.has(node.id);
      const size = node.radius * 2 + (isHovered || isSelected ? 4 : 0);
      const img = nodeImages.get(node.id);

      ctx.save();
      ctx.globalAlpha = dim ? 0.25 : 1;

      ctx.beginPath();
      ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(img, node.x - size, node.y - size, size * 2, size * 2);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.restore();

      ctx.save();
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = node.recordKind === "collection" ? 1.2 : 0.5;
      ctx.setLineDash(node.recordKind === "collection" ? [3, 2] : []);
      ctx.strokeRect(node.x - size, node.y - size, size * 2, size * 2);
      ctx.restore();

      if (shouldShowLabel(node, isHovered, isSelected)) {
        const labelText = (isHovered || isSelected) ? node.name : node.name.slice(0, 2);
        ctx.save();
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.font = `300 ${node.radius > 12 ? 12 : 10}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
        ctx.strokeText(labelText, node.x, node.y + size + 5);
        ctx.fillStyle = "#1f2528";
        ctx.fillText(labelText, node.x, node.y + size + 5);
        ctx.restore();
      }
    });
}

function getHighlightedIds() {
  const active = state.hovered || state.selected;
  if (!active) return null;
  const ids = new Set([active.id]);
  getVisibleGraph().visibleEdges.forEach((edge) => {
    if (edge.source === active.id) ids.add(edge.target);
    if (edge.target === active.id) ids.add(edge.source);
  });
  return ids;
}

function updateCounts(nodeCount, edgeCount) {
  document.getElementById("visibleNodeCount").textContent = nodeCount;
  document.getElementById("visibleEdgeCount").textContent = edgeCount;
}

function renderControls() {
  const departmentContainer = document.getElementById("departmentFilters");
  departmentContainer.innerHTML = "";
  departmentOrder.forEach((department) => {
    const row = document.createElement("label");
    row.className = "check-row";
    row.innerHTML = `
      <input type="checkbox" checked data-department="${department}">
      <span class="swatch" style="background:${data.meta.departments[department]}"></span>
      <span class="row-label">${department}</span>
      <span class="row-count">${countsByDepartment[department] || 0}</span>
    `;
    departmentContainer.append(row);
  });

  const note = document.getElementById("dataProvenanceNote");
  if (note) note.textContent = "140条目录记录 · 关系为设计推演 · 虚框为集合记录";

  const relationContainer = document.getElementById("relationFilters");
  relationContainer.innerHTML = "";
  relationOrder.forEach((type) => {
    const meta = data.meta.relationTypes[type];
    const row = document.createElement("label");
    row.className = "check-row";
    row.innerHTML = `
      <input type="checkbox" checked data-relation="${type}">
      <span class="relation-sample ${meta.style}"></span>
      <span class="row-label">${meta.label}${type === "supply" ? " →" : ""}</span>
      <span class="row-count">${edges.filter((edge) => edge.type === type).length}</span>
    `;
    relationContainer.append(row);
  });

  const legend = document.getElementById("legend");
  legend.innerHTML = departmentOrder
    .map(
      (department) => `
        <div class="legend-item">
          <span class="swatch" style="background:${data.meta.departments[department]}"></span>
          <span class="legend-label">${department}</span>
          <span class="legend-count">${countsByDepartment[department] || 0}</span>
        </div>
      `
    )
    .join("");

  const maxJma = Math.max(...nodes.map((node) => node.jmaCount));
  const slider = document.getElementById("jmaSlider");
  slider.max = maxJma;
  slider.value = 0;
}

function bindControls() {
  document.getElementById("departmentFilters").addEventListener("change", (event) => {
    const department = event.target.dataset.department;
    if (!department) return;
    if (event.target.checked) state.selectedDepartments.add(department);
    else state.selectedDepartments.delete(department);
    refreshSelectedDetail();
    state.alpha = 1;
  });

  document.getElementById("relationFilters").addEventListener("change", (event) => {
    const relation = event.target.dataset.relation;
    if (!relation) return;
    if (event.target.checked) state.selectedRelations.add(relation);
    else state.selectedRelations.delete(relation);
    refreshSelectedDetail();
    state.alpha = 1;
  });

  document.getElementById("toggleDepartments").addEventListener("click", () => {
    const allSelected = state.selectedDepartments.size === departmentOrder.length;
    state.selectedDepartments = new Set(allSelected ? [] : departmentOrder);
    document.querySelectorAll("[data-department]").forEach((input) => {
      input.checked = !allSelected;
    });
    document.getElementById("toggleDepartments").textContent = allSelected ? "全选" : "清空";
    refreshSelectedDetail();
    state.alpha = 1;
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    refreshSelectedDetail();
    state.alpha = 1;
  });

  document.getElementById("clusterToggle").addEventListener("change", (event) => {
    state.cluster = event.target.checked;
    state.alpha = 1;
  });

  document.getElementById("jmaSlider").addEventListener("input", (event) => {
    state.minJma = Number(event.target.value);
    refreshSelectedDetail();
    document.getElementById("jmaValue").textContent = state.minJma;
    state.alpha = 1;
  });

  document.getElementById("resetView").addEventListener("click", () => {
    initializePositions();
    resetView();
    state.alpha = 1;
  });

  document.getElementById("fitView").addEventListener("click", fitView);
  document.getElementById("exportPng").addEventListener("click", exportPng);
}

function bindCanvas() {
  canvas.addEventListener("pointermove", (event) => {
    const point = getCanvasPoint(event);
    const world = screenToWorld(point);
    if (state.draggingNode) {
      state.draggingNode.x = world.x;
      state.draggingNode.y = world.y;
      state.draggingNode.vx = 0;
      state.draggingNode.vy = 0;
      state.alpha = 1;
      return;
    }
    if (state.panning && state.lastPointer) {
      state.transform.x += point.x - state.lastPointer.x;
      state.transform.y += point.y - state.lastPointer.y;
      state.lastPointer = point;
      return;
    }
    const hit = findNodeAt(world);
    if (hit !== state.hovered) {
      state.hovered = hit;
      updateTooltip(hit, point);
    } else if (hit) {
      moveTooltip(point);
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    const point = getCanvasPoint(event);
    const world = screenToWorld(point);
    const hit = findNodeAt(world);
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
    if (hit) {
      state.draggingNode = hit;
      state.selected = hit;
      renderDetail(hit);
    } else {
      state.panning = true;
      state.lastPointer = point;
      // Click on empty space closes dossier
      dossier.classList.remove('open');
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("dragging");
    state.draggingNode = null;
    state.panning = false;
    state.lastPointer = null;
  });

  canvas.addEventListener("pointerleave", () => {
    if (!state.draggingNode) {
      state.hovered = null;
      tooltip.hidden = true;
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = getCanvasPoint(event);
      const worldBefore = screenToWorld(point);
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      state.transform.scale = Math.max(0.22, Math.min(3.2, state.transform.scale * factor));
      const after = worldToScreen(worldBefore);
      state.transform.x += point.x - after.x;
      state.transform.y += point.y - after.y;
    },
    { passive: false }
  );
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function findNodeAt(world) {
  const { visibleNodes } = getVisibleGraph();
  for (let i = visibleNodes.length - 1; i >= 0; i -= 1) {
    const node = visibleNodes[i];
    const radius = node.radius + 8 / state.transform.scale;
    if (Math.hypot(world.x - node.x, world.y - node.y) <= radius) return node;
  }
  return null;
}

function updateTooltip(node, point) {
  if (!node) {
    tooltip.hidden = true;
    return;
  }
  tooltip.innerHTML = `
    <strong>${escapeHTML(node.name)} · #${node.id}</strong>
    <div>${escapeHTML(data.meta.recordKinds?.[node.recordKind] || "目录记录")} · ${escapeHTML(node.department)}</div>
    <div>${node.reviewStatus === "needs_evidence" ? "职能待核查" : node.recordKind === "collection" ? "不指派单一神职" : "资料有范围限制 · 公司岗位为设计"}</div>
    ${node.jmaCount ? `<div>甲马数量: ${node.jmaCount}</div>` : ""}
  `;
  tooltip.hidden = false;
  moveTooltip(point);
}

function moveTooltip(point) {
  tooltip.style.left = `${Math.min(point.x + 16, state.width - 300)}px`;
  tooltip.style.top = `${Math.max(12, point.y + 16)}px`;
}

function getDepartmentClass(department) {
  return ({"自然环境管理部":"dept-natural", "民生生活服务部":"dept-livelihood", "财富事业发展部":"dept-wealth", "健康生育服务部":"dept-health", "社会秩序管理部":"dept-ministry", "地方文化运营部":"dept-culture", "风险危机处理部":"dept-military"})[department] || "";
}

function generateBarcode() {
  const bars = [];
  for (let i = 0; i < 40; i++) {
    const height = 15 + Math.floor(Math.random() * 20);
    const width = 2 + (Math.random() > 0.7 ? 1 : 0);
    bars.push(`<div class="barcode-bar" style="height:${height}px;width:${width}px"></div>`);
  }
  return bars.join("");
}

function getRandomStamp() {
  const stamps = [
    { class: "stamp-active", text: "ACTIVE" },
    { class: "stamp-confidential", text: "CONFIDENTIAL" },
    { class: "stamp-level-b", text: "LEVEL-B" },
    { class: "stamp-mythic", text: "MYTHIC STAFF" },
  ];
  const shuffled = stamps.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
}

function referenceHTML(ids) {
  return (ids || []).map((id) => {
    const ref = data.meta.references?.[id];
    if (!ref) return `<p>来源 ${escapeHTML(id)}：未提供</p>`;
    const href = /^https:\/\//.test(ref.url || "") ? ref.url : "";
    const title = href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(ref.title)}</a>` : escapeHTML(ref.title);
    return `<div class="reference-entry"><div>${escapeHTML(id)} · ${title}</div><div>${escapeHTML(ref.author)}</div><div>${escapeHTML(ref.publication)}</div><div>定位：${escapeHTML(ref.location)}</div><div>范围：${escapeHTML(ref.scope)}</div><div>查阅状态：${escapeHTML(ref.accessStatus || "未记录")}</div></div>`;
  }).join("");
}

// Drawer navigation is presentation state only; network records remain untouched.
let detailView = { nodeId: null, mode: "identity" };

function refreshSelectedDetail() {
  if (state.selected && dossier.classList.contains("open")) {
    renderDetail(state.selected, { preserveView: true });
  }
}

function identityResponsibility(node) {
  if (node.recordKind === "collection") return "集合记录的查阅与关联入口，不指派个人神职。";
  if (node.recordKind === "ritual_object") return "保存与查阅本条仪式用品的相关记录。";
  // A short display excerpt; the unchanged complete service is in the archive.
  return String(node.service || "岗位职责见研究档案。")
    .split(/[；;。]/)[0].replace(/[，,]$/, "") + "。";
}

function archiveSection(number, english, title, content) {
  return `<section class="research-section" aria-labelledby="research-section-${number}">
    <header class="research-section-heading"><span class="research-section-number">${number}</span><div><span class="research-section-english">${english}</span><h3 id="research-section-${number}">${title}</h3></div></header>
    <div class="research-section-content">${content}</div>
  </section>`;
}

function renderDetail(node, options = {}) {
  const mode = options.preserveView && detailView.nodeId === node.id
    ? detailView.mode : options.mode === "research" ? "research" : "identity";
  const oldScroll = options.preserveView ? dossierContent.scrollTop : 0;
  detailView = { nodeId: node.id, mode };
  const graph = getVisibleGraph();
  const allRelated = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const related = graph.visibleEdges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const isCollection = node.recordKind === "collection";
  const isObject = node.recordKind === "ritual_object";
  const supported = node.reviewStatus === "source_supported_scope_limited";
  const recordKind = data.meta.recordKinds?.[node.recordKind] || "目录记录";
  const status = isCollection ? "集合记录 · 不指派单一神职" : supported ? "有职能资料线索 · 地方版本待核" : "具体职能不确定 · 待核查";
  const imgSrc = `${IMAGE_FOLDER}${encodeURIComponent(node.imageFile || `${node.name}_${node.jmaCount}.png`)}`;
  const relatedHTML = allRelated.length ? allRelated.map((edge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = nodeById.get(otherId);
    const typeLabel = data.meta.relationTypes[edge.type]?.label || edge.type;
    const evidenceLabels = {documented:"文献支持", inferred:"资料支持的解释性推断", design_simulation:"设计推演"};
    const direction = edge.type === "supply" ? `${edge.sourceName} #${edge.source} → ${edge.targetName} #${edge.target}` : `${edge.sourceName} #${edge.source} ↔ ${edge.targetName} #${edge.target}`;
    return `<details class="relation-entry" data-edge-id="${escapeHTML(edge.id)}">
      <summary><span class="relation-kind">${escapeHTML(typeLabel)} · ${evidenceLabels[edge.evidenceType] || "证据待核"}</span><span class="related-name">${escapeHTML(edge.label)}</span><span class="relation-direction">${escapeHTML(direction)}</span></summary>
      <div class="relation-explanation">
        <p><strong>场景：</strong>${escapeHTML(edge.scenario)}</p>
        <p><strong>建立理由：</strong>${escapeHTML(edge.reason)}</p>
        <p>${escapeHTML(edge.sourceName)}：${escapeHTML(edge.sourceRole)}<br>${escapeHTML(edge.targetName)}：${escapeHTML(edge.targetRole)}</p>
        ${edge.type === "supply" ? `<p><strong>上游提供：</strong>${escapeHTML(edge.upstreamProvides)}</p><p><strong>下游负责：</strong>${escapeHTML(edge.downstreamResponsibility)}</p><p><strong>输入依赖：</strong>${escapeHTML(edge.dependencyReason)}</p>` : ""}
        <p>可信度：${escapeHTML(edge.confidence || "未确定")} · 待研究者签核</p>
        <p>${edge.evidenceType === "design_simulation" ? "这是根据职能线索建立的公司隐喻，不是历史上神明协作的记载。" : "文化或资料联系须按下方出处与范围理解，不能自动解释为历史演化。"}</p>
        <p>${escapeHTML(edge.limitations)}</p>
        <div class="evidence-references">${referenceHTML(edge.evidenceIds)}</div>
        <button class="text-button related-node-button" data-node-id="${escapeHTML(otherId)}" type="button">查看 ${escapeHTML(other.name)} #${escapeHTML(otherId)} 档案 →</button>
      </div>
    </details>`;
  }).join("") : `<div class="empty-relations">${allRelated.length ? "当前筛选下无可见关系。可恢复部门、关系层或搜索条件后查看。" : "尚无符合证据与场景门槛的关系，保留孤立记录。"}</div>`;

  const compactRelations = related.map((edge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = nodeById.get(otherId);
    const type = edge.type === "supply"
      ? (edge.source === node.id ? "服务下游 →" : "← 服务上游")
      : edge.type === "culture" ? "文化关联" : "业务协作";
    return `<button class="identity-relation related-node-button" data-node-id="${escapeHTML(otherId)}" data-edge-id="${escapeHTML(edge.id)}" type="button">
      <span class="identity-relation-top"><strong>${escapeHTML(other.name)}</strong><span class="identity-relation-type">${type}</span></span>
      <span class="identity-relation-bottom"><span>MSC-${escapeHTML(otherId)}</span><span>${escapeHTML(edge.label)}</span></span>
    </button>`;
  }).join("");
  const position = isCollection ? "集合档案 · 不设个人岗位" : isObject ? "仪式用品档案" : node.position || "未设定公司职位";
  const closeButton = '<button class="detail-close dossier-close" type="button" aria-label="关闭节点详情">[×]</button>';
  const identityHTML = `<article class="dossier-view identity-view" aria-label="员工工牌">
    <header class="detail-toolbar"><div><p class="detail-eyebrow">PERSONNEL / MSC-${node.number}</p><h2 class="detail-view-title" tabindex="-1">EMPLOYEE IDENTITY CARD</h2></div>${closeButton}</header>
    <div class="identity-hero">
      <div class="portrait-frame"><img src="${imgSrc}" alt="${escapeHTML(node.name)} · 甲马图像"></div>
      <div class="identity-nameblock"><span class="identity-card-caption">${isCollection || isObject ? escapeHTML(recordKind) : "员工工牌"}</span><div class="identity-name${node.name.length > 5 ? ' identity-name-long' : ''}">${escapeHTML(node.name)}</div><div class="identity-number">MSC-${node.number}</div><div class="identity-department">${escapeHTML(node.department)}</div></div>
    </div>
    <section class="identity-position"><p class="detail-eyebrow">${isCollection || isObject ? "ARCHIVE ROLE / 档案类别" : "COMPANY POSITION / 公司职位"}</p><h3>${escapeHTML(position)}</h3></section>
    <section class="identity-duties"><h3 class="identity-section-title">01 / ${isCollection || isObject ? "档案说明" : "岗位职责"}</h3><p>${escapeHTML(identityResponsibility(node))}</p></section>
    <section class="identity-connections"><div class="identity-section-heading"><h3 class="identity-section-title">02 / 业务关系</h3><span>${related.length}${related.length === allRelated.length ? "" : ` / ${allRelated.length}`}</span></div>
      <div class="identity-relation-list">${compactRelations || `<p class="identity-no-relations">${allRelated.length ? "当前筛选下暂无关联对象。" : "暂无关联对象。"}</p>`}</div>
    </section>
    <footer class="identity-actions"><button class="view-research detail-primary-button" data-detail-view="research" type="button"><span>查看完整研究档案</span><span aria-hidden="true">→</span></button><p>RESEARCH ARCHIVE / MSC-${node.number}</p></footer>
  </article>`;

  const originalFields = `<dl class="archive-record-grid">
    <div><dt>记录编号</dt><dd>MSC-${node.number}</dd></div><div><dt>记录类型</dt><dd>${escapeHTML(recordKind)}</dd></div>
    <div><dt>原始名称</dt><dd>${escapeHTML(node.rawRecord?.name || node.name)}</dd></div><div><dt>原始顺序</dt><dd>${node.rawRecord?.order ?? node.number}</dd></div>
    <div><dt>目录类别</dt><dd>${escapeHTML(node.rawRecord?.category)}</dd></div><div><dt>原页码组</dt><dd>${escapeHTML(node.rawRecord?.pageGroup)}<small>非精确引文页码</small></dd></div>
    <div><dt>甲马数量</dt><dd>${node.jmaCount}</dd></div><div><dt>CSV行号</dt><dd>${node.rawRecord?.csvRow ?? "未记录"}</dd></div>
  </dl>`;
  const legacy = `<details class="archive-fold legacy-profile"><summary>旧花名册原值（保留溯源）</summary><div>${Object.entries(node.originalProfile || {}).map(([key,value]) => `<p><strong>${escapeHTML(({department:"部门",source:"入职来源",position:"职位",secondaryPosition:"兼任",service:"服务",jmaCount:"旧网页数量"})[key] || key)}：</strong>${escapeHTML(value)}</p>`).join("")}</div></details>`;
  const researchHTML = `<article class="dossier-view research-view" aria-label="研究档案">
    <header class="detail-toolbar research-toolbar"><button class="return-identity" data-detail-view="identity" type="button">← 返回员工工牌</button>${closeButton}</header>
    <div class="research-masthead"><p class="detail-eyebrow">RESEARCH ARCHIVE / MSC-${node.number}</p><h2 class="detail-view-title" tabindex="-1">研究档案</h2><p>${escapeHTML(node.name)} <span>/ ${escapeHTML(node.department)}</span></p></div>
    ${archiveSection("01", "FUNCTION & CULTURE", "传统神职与文化背景", `<p class="archive-function">${escapeHTML(node.traditionalFunction || "不确定，待核查")}</p><details class="archive-fold profile-evidence"><summary>神职资料与文化背景说明</summary><div>${node.evidenceIds?.length ? referenceHTML(node.evidenceIds) : '<p>尚无可定位到本条目地方版本的职能资料。</p>'}</div></details><details class="archive-fold"><summary>完整服务说明</summary><div><p>${escapeHTML(node.service)}</p>${!supported && !isCollection ? '<p class="review-caption">保留的旧服务字段不是已核实的民俗事实。</p>' : ''}</div></details>`)}
    ${archiveSection("02", "ORIGINAL CATALOG", "原始甲马目录记录", originalFields + legacy)}
    ${archiveSection("03", "INTERPRETATION & REVIEW", "数据解释与核验状态", `<p class="archive-status">${escapeHTML(status)}</p><p>${escapeHTML(node.reviewNote)}</p><details class="archive-fold"><summary>公司设定、来源分类与核验说明</summary><div><p>公司职位：${escapeHTML(node.position || "未指派个人职位")}（组织隐喻）</p>${!isCollection && !isObject ? `<p>${supported ? "基于职能线索的设计岗位，不是传统称谓。" : "保留旧版AI职位，尚未核实对应神职。"}</p>` : ""}<p>兼任职位：${escapeHTML(node.secondaryPosition || "未指派")}（旧字段如有保留，仍待核查）</p><p>部门：${escapeHTML(node.department)}；${node.departmentBasis === "legacy_design_pending_review" ? "沿用旧设计分类待核" : "依据当前职能线索的设计归部"}。</p><p>入职来源：${escapeHTML(node.source)}（旧AI分类，历史依据待核查）</p>${isCollection || isObject ? "<p>此记录不认定单一神格起源。</p>" : ""}<p>可信度：${escapeHTML(node.confidence || "未确定")}；尚待研究者签核。</p>${node.imageReviewStatus === "legacy_mapping_pending_book_check" ? '<p>图像沿用旧版ID关联，具体书图对应待核；图片后缀不是原数量。</p>' : ""}<p>${graph.visibleIds.has(node.id) ? "本档案在当前筛选内。" : "本档案在当前筛选外；记录仍可访问。"}</p><p>${escapeHTML(data.meta.aiDisclosure || "AI辅助整理，研究者尚未签核。")}</p></div></details>`)}
    ${archiveSection("04", "RELATIONS & REFERENCES", "关系依据及参考资料", `<p class="archive-relation-count">全部 ${allRelated.length} 条关系 · 当前筛选可见 ${related.length} 条</p><div class="related-list">${relatedHTML}</div>`)}
    <footer class="research-endnote">END OF ARCHIVE / MSC-${node.number}</footer>
  </article>`;

  folderTab.className = "folder-tab " + getDepartmentClass(node.department);
  folderTab.textContent = mode === "research" ? "RESEARCH ARCHIVE" : "EMPLOYEE IDENTITY CARD";
  dossierContent.dataset.detailView = mode;
  dossierContent.innerHTML = mode === "research" ? researchHTML : identityHTML;
  dossierContent.querySelector('.dossier-close').addEventListener('click', () => { dossier.classList.remove('open'); });
  dossierContent.querySelectorAll('[data-detail-view]').forEach((button) => button.addEventListener('click', () => {
    renderDetail(node, { mode: button.dataset.detailView, focus: true });
  }));
  dossierContent.querySelector('.portrait-frame img')?.addEventListener('error', (event) => {
    event.target.replaceWith(Object.assign(document.createElement('span'), {textContent: "图像暂不可用"}));
  }, {once:true});
  dossierContent.querySelectorAll('.related-node-button').forEach((item) => item.addEventListener('click', () => {
    const target = nodeById.get(item.dataset.nodeId);
    if (!target) return;
    state.selected = target;
    renderDetail(target, { focus: true });
    state.transform.x = state.width / 2 - target.x * state.transform.scale;
    state.transform.y = state.height / 2 - target.y * state.transform.scale;
  }));
  dossierContent.scrollTop = oldScroll;
  state.hovered = null;
  tooltip.hidden = true;
  dossier.classList.add('open');
  if (options.focus) {
    dossierContent.querySelector(mode === "research" ? '.return-identity' : '.detail-view-title')?.focus({ preventScroll: true });
  }
}

function resetView() {
  state.transform = {
    x: state.width / 2,
    y: state.height / 2,
    scale: Math.min(1, Math.max(0.62, Math.min(state.width, state.height) / 960)),
  };
}

function fitView() {
  const { visibleNodes } = getVisibleGraph();
  if (!visibleNodes.length) return;
  const xs = visibleNodes.map((node) => node.x);
  const ys = visibleNodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 110;
  const scale = Math.min(
    (state.width - padding) / Math.max(1, maxX - minX),
    (state.height - padding) / Math.max(1, maxY - minY),
    2.1
  );
  state.transform.scale = Math.max(0.28, scale);
  state.transform.x = state.width / 2 - ((minX + maxX) / 2) * state.transform.scale;
  state.transform.y = state.height / 2 - ((minY + maxY) / 2) * state.transform.scale;
}

function exportPng() {
  const link = document.createElement("a");
  link.download = "神话服务公司多层网络.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function animate() {
  for (let i = 0; i < 2; i += 1) tick();
  draw();
  requestAnimationFrame(animate);
}

renderControls();
bindControls();
bindCanvas();
initPanelCollapse();
initPanelDragging();
preloadNodeImages();
initializePositions();
resizeCanvas();
resetView();
animate();

window.addEventListener("resize", () => {
  resizeCanvas();
  fitView();
});
