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
const detailPanel = document.getElementById("detailPanel");

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
  const nameToId = new Map();
  nodes.forEach((node) => {
    const baseName = node.name;
    if (!nameToId.has(baseName)) {
      nameToId.set(baseName, []);
    }
    nameToId.get(baseName).push(node.id);
  });

  imageCacheReady.total = nameToId.size;

  const specialImageMap = {
    "39": "财神_16.png",
    "51": "财神_17.png",
  };

  nameToId.forEach((nodeIds, nodeName) => {
    nodeIds.forEach((nodeId) => {
      const node = nodeById.get(nodeId);
      const specialFile = specialImageMap[nodeId];
      const filename = specialFile || `${nodeName}_${node.jmaCount}.png`;

      const img = new Image();

      img.onload = () => {
        nodeImages.set(nodeId, img);
        imageCacheReady.count++;
      };

      img.onerror = () => {
        imageCacheReady.count++;
      };

      img.src = `${IMAGE_FOLDER}${encodeURIComponent(filename)}`;
    });
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
    if (node.name.includes("其他")) return false;
    if (!query) return true;
    return [node.name, node.department, node.position, node.secondaryPosition, node.service, node.source]
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
    ctx.setLineDash([]);
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
      ctx.lineWidth = 0.5;
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
  edges.forEach((edge) => {
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

  const relationContainer = document.getElementById("relationFilters");
  relationContainer.innerHTML = "";
  relationOrder.forEach((type) => {
    const meta = data.meta.relationTypes[type];
    const row = document.createElement("label");
    row.className = "check-row";
    row.innerHTML = `
      <input type="checkbox" checked data-relation="${type}">
      <span class="relation-sample ${meta.style}"></span>
      <span class="row-label">${meta.label}</span>
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
    state.alpha = 1;
  });

  document.getElementById("relationFilters").addEventListener("change", (event) => {
    const relation = event.target.dataset.relation;
    if (!relation) return;
    if (event.target.checked) state.selectedRelations.add(relation);
    else state.selectedRelations.delete(relation);
    state.alpha = 1;
  });

  document.getElementById("toggleDepartments").addEventListener("click", () => {
    const allSelected = state.selectedDepartments.size === departmentOrder.length;
    state.selectedDepartments = new Set(allSelected ? [] : departmentOrder);
    document.querySelectorAll("[data-department]").forEach((input) => {
      input.checked = !allSelected;
    });
    document.getElementById("toggleDepartments").textContent = allSelected ? "全选" : "清空";
    state.alpha = 1;
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.alpha = 1;
  });

  document.getElementById("clusterToggle").addEventListener("change", (event) => {
    state.cluster = event.target.checked;
    state.alpha = 1;
  });

  document.getElementById("jmaSlider").addEventListener("input", (event) => {
    state.minJma = Number(event.target.value);
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
    <strong>${node.name}</strong>
    <div>${node.department} · ${node.position || "无职位"}</div>
    ${node.jmaCount ? `<div>甲马数量: ${node.jmaCount}</div>` : ""}
  `;
  tooltip.hidden = false;
  moveTooltip(point);
}

function moveTooltip(point) {
  tooltip.style.left = `${Math.min(point.x + 16, state.width - 300)}px`;
  tooltip.style.top = `${Math.max(12, point.y + 16)}px`;
}

function renderDetail(node) {
  const related = edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .slice(0, 18);
  detailPanel.innerHTML = `
    <div class="detail-title">
      <span class="swatch" style="background:${node.color}"></span>
      <div>
        <h2>${node.name}</h2>
        <span>编号 ${node.number} · 甲马数量 ${node.jmaCount}</span>
      </div>
    </div>
    <dl class="detail-list">
      <div><dt>所属部门</dt><dd>${node.department}</dd></div>
      <div><dt>入职来源</dt><dd>${node.source || "无"}</dd></div>
      <div><dt>具体职位</dt><dd>${node.position || "无"}</dd></div>
      <div><dt>兼任职位</dt><dd>${node.secondaryPosition || "无"}</dd></div>
      <div><dt>服务内容</dt><dd>${node.service || "无"}</dd></div>
    </dl>
    <div class="connection-list">
      ${related
        .map((edge) => {
          const direction = edge.source === node.id ? "指向" : "来自";
          const other = edge.source === node.id ? edge.targetName : edge.sourceName;
          return `<div class="connection-item"><span>${edge.label}</span><strong>${direction} ${other}</strong></div>`;
        })
        .join("") || '<p class="empty-state">当前筛选下暂无连接关系。</p>'}
    </div>
  `;
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
